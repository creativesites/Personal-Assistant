package app.zuri.android.coreai

import app.zuri.android.coreai.install.DownloadOutcome
import app.zuri.android.coreai.install.InstallResult
import app.zuri.android.coreai.install.ModelDownloader
import app.zuri.android.coreai.install.ModelInstaller
import app.zuri.android.coreai.storage.ModelStorage
import app.zuri.android.domain.ai.FailureReason
import app.zuri.android.domain.ai.ModelRole
import app.zuri.android.domain.ai.ModelSpec
import app.zuri.android.domain.ai.ModelTier
import app.zuri.android.domain.privacy.EgressLedger
import app.zuri.android.domain.privacy.EgressPurpose
import app.zuri.android.domain.privacy.EgressRecord
import com.google.common.truth.Truth.assertThat
import java.io.File
import java.io.IOException
import java.security.MessageDigest
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class ModelInstallerTest {
    @get:Rule val tmp = TemporaryFolder()
    private val content = ByteArray(4096) { it.toByte() }
    private val sha = MessageDigest.getInstance("SHA-256").digest(content).joinToString("") { "%02x".format(it) }
    private fun spec(sha256: String = sha) = ModelSpec("m", "M", ModelRole.CHAT, ModelTier.LITE, "m.litertlm", "https://huggingface.co/x/m", sha256, content.size.toLong(), 0, "Apache-2.0", "x", null, "1")

    private class Ledger : EgressLedger {
        val logged = mutableListOf<Pair<String, Long>>()
        val hosts = mutableListOf<String>()
        override val records = MutableStateFlow(emptyList<EgressRecord>())
        override suspend fun record(purpose: EgressPurpose, host: String, detail: String, bytesSent: Long, bytesReceived: Long) { logged += detail to bytesReceived; hosts += host }
    }

    private class Writes(private val bytes: ByteArray, private val failAfter: Int? = null) : ModelDownloader {
        override suspend fun download(url: String, destination: File, expectedSize: Long, onProgress: (Long, Long) -> Unit, onConnected: (String) -> Unit): DownloadOutcome {
            onConnected("cdn.example")
            val start = destination.takeIf { it.isFile }?.length()?.toInt() ?: 0
            val end = failAfter?.coerceAtLeast(start) ?: bytes.size
            destination.appendBytes(bytes.copyOfRange(start, end))
            if (failAfter != null) throw IOException("dropped")
            return DownloadOutcome("cdn.example", (end - start).toLong())
        }
    }

    private val storage get() = ModelStorage(File(tmp.root, "models"))

    @Test fun verifiedFileIsInstalledAndLogged() = runTest {
        val ledger = Ledger()
        val result = ModelInstaller(storage, Writes(content), ledger) { Long.MAX_VALUE }.install(spec(), { _, _ -> })
        assertThat(result).isEqualTo(InstallResult.Installed)
        assertThat(storage.isInstalled(spec())).isTrue()
        assertThat(ledger.logged).containsExactly("m.litertlm" to 4096L)
    }

    @Test fun corruptedFileIsRejectedAndDeleted() = runTest {
        val bad = content.copyOf().also { it[100] = 0x7f }
        val result = ModelInstaller(storage, Writes(bad), Ledger()) { Long.MAX_VALUE }.install(spec(), { _, _ -> })
        assertThat(result).isEqualTo(InstallResult.Failed(FailureReason.CHECKSUM_MISMATCH))
        assertThat(storage.isInstalled(spec())).isFalse()
        assertThat(storage.partialBytes(spec())).isEqualTo(0)
    }

    @Test fun anInterruptedDownloadResumesFromThePartialFile() = runTest {
        val ledger = Ledger()
        val first = ModelInstaller(storage, Writes(content, failAfter = 1000), ledger) { Long.MAX_VALUE }.install(spec(), { _, _ -> })
        assertThat(first).isEqualTo(InstallResult.Failed(FailureReason.NETWORK))
        assertThat(storage.partialBytes(spec())).isEqualTo(1000)
        val second = ModelInstaller(storage, Writes(content), ledger) { Long.MAX_VALUE }.install(spec(), { _, _ -> })
        assertThat(second).isEqualTo(InstallResult.Installed)
        assertThat(ledger.logged).containsExactly("m.litertlm (interrupted)" to 1000L, "m.litertlm" to 3096L).inOrder()
        assertThat(ledger.hosts).containsExactly("cdn.example", "cdn.example") // the real server, interrupted or not
    }

    @Test fun notEnoughStorageStopsBeforeDownloading() = runTest {
        val ledger = Ledger()
        val result = ModelInstaller(storage, Writes(content), ledger) { 10L }.install(spec(), { _, _ -> })
        assertThat(result).isEqualTo(InstallResult.Failed(FailureReason.NOT_ENOUGH_STORAGE))
        assertThat(ledger.logged).isEmpty()
    }

    @Test fun aWrongMarkerMeansNotInstalled() {
        val s = storage
        s.file(spec()).apply { parentFile?.mkdirs(); writeBytes(content) }
        s.markInstalled(spec(sha256 = "deadbeef"))
        assertThat(s.isInstalled(spec())).isFalse()
    }
}
