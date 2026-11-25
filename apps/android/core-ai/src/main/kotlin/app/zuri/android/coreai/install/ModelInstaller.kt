package app.zuri.android.coreai.install

import app.zuri.android.coreai.storage.ModelStorage
import app.zuri.android.domain.ai.FailureReason
import app.zuri.android.domain.ai.ModelFit
import app.zuri.android.domain.ai.ModelSpec
import app.zuri.android.domain.privacy.EgressLedger
import app.zuri.android.domain.privacy.EgressPurpose
import java.io.File
import java.io.IOException
import java.security.MessageDigest
import kotlin.coroutines.cancellation.CancellationException

/** Network access for model files; implemented in :core-ai:remote, the only module allowed to connect. */
interface ModelDownloader {
    /**
     * Downloads [url] into [destination], resuming from the bytes already there. Throws
     * [IOException] on failure; partial bytes stay for the next attempt.
     */
    suspend fun download(url: String, destination: File, expectedSize: Long, onProgress: (done: Long, total: Long) -> Unit, onConnected: (host: String) -> Unit = {}): DownloadOutcome
}

data class DownloadOutcome(val host: String, val bytesReceived: Long)

sealed interface InstallResult {
    data object Installed : InstallResult
    data class Failed(val reason: FailureReason) : InstallResult
}

/**
 * Download → verify → activate (from MeetingMind's ModelRepository/ModelVerifier, refactored):
 * nothing is ever loaded unless its SHA-256 matches the catalog. Every attempt is logged in
 * "What leaves my phone", including failed ones (the request still left).
 */
class ModelInstaller(
    private val storage: ModelStorage,
    private val downloader: ModelDownloader,
    private val ledger: EgressLedger,
    private val freeBytes: () -> Long,
) {
    suspend fun install(spec: ModelSpec, onProgress: (done: Long, total: Long) -> Unit, onVerifying: () -> Unit = {}): InstallResult {
        if (storage.isInstalled(spec)) return InstallResult.Installed
        val remaining = spec.sizeBytes - storage.partialBytes(spec)
        if (freeBytes() < remaining + ModelFit.STORAGE_HEADROOM_BYTES) return InstallResult.Failed(FailureReason.NOT_ENOUGH_STORAGE)
        val part = storage.partial(spec)
        part.parentFile?.mkdirs()
        val before = storage.partialBytes(spec)
        var host = HOST
        try {
            val outcome = downloader.download(spec.url, part, spec.sizeBytes, onProgress) { host = it }
            ledger.record(EgressPurpose.MODEL_DOWNLOAD, outcome.host, spec.fileName, bytesSent = 0, bytesReceived = outcome.bytesReceived)
        } catch (e: CancellationException) {
            log(spec, host, storage.partialBytes(spec) - before)
            throw e
        } catch (e: IOException) {
            log(spec, host, storage.partialBytes(spec) - before)
            return InstallResult.Failed(FailureReason.NETWORK)
        }
        if (part.length() != spec.sizeBytes) return InstallResult.Failed(FailureReason.NETWORK)
        onVerifying()
        if (!sha256(part).equals(spec.sha256, ignoreCase = true)) {
            part.delete()
            return InstallResult.Failed(FailureReason.CHECKSUM_MISMATCH)
        }
        val target = storage.file(spec)
        if (!part.renameTo(target)) return InstallResult.Failed(FailureReason.UNKNOWN)
        storage.markInstalled(spec)
        return InstallResult.Installed
    }

    private suspend fun log(spec: ModelSpec, host: String, received: Long) {
        runCatching { ledger.record(EgressPurpose.MODEL_DOWNLOAD, host, "${spec.fileName} (interrupted)", 0, received.coerceAtLeast(0)) }
    }

    companion object {
        const val HOST = "huggingface.co"

        fun sha256(file: File): String {
            val digest = MessageDigest.getInstance("SHA-256")
            file.inputStream().use { input ->
                val buffer = ByteArray(1 shl 16)
                while (true) {
                    val n = input.read(buffer)
                    if (n < 0) break
                    digest.update(buffer, 0, n)
                }
            }
            return digest.digest().joinToString("") { "%02x".format(it) }
        }
    }
}
