package app.zuri.android.data.local

import app.zuri.android.data.local.privacy.FileStorageInspector
import com.google.common.truth.Truth.assertThat
import java.io.File
import java.nio.file.Files
import kotlinx.coroutines.test.runTest
import org.junit.Test

class FileStorageInspectorTest {
    private val dir: File = Files.createTempDirectory("zuri-db").toFile()

    @Test fun plaintextSqliteIsNotReportedAsEncrypted() {
        val f = File(dir, "plain.db").apply { writeBytes("SQLite format 3\u0000".toByteArray() + ByteArray(4080)) }
        assertThat(FileStorageInspector.isEncrypted(f)).isFalse()
    }

    @Test fun randomHeaderIsReportedAsEncrypted() {
        val f = File(dir, "enc.db").apply { writeBytes(ByteArray(4096) { (it * 31 + 7).toByte() }) }
        assertThat(FileStorageInspector.isEncrypted(f)).isTrue()
    }

    @Test fun missingFileIsNotEncryptedAndCountsWalFiles() = runTest {
        val db = File(dir, "zuri.db").apply { writeBytes(ByteArray(4096) { 9 }) }
        File(dir, "zuri.db-wal").writeBytes(ByteArray(1000))
        val report = FileStorageInspector(db, workspaceCount = { 2 }).report()
        assertThat(report.databaseBytes).isEqualTo(5096)
        assertThat(report.workspaceCount).isEqualTo(2)
        assertThat(FileStorageInspector.isEncrypted(File(dir, "missing.db"))).isFalse()
    }
}
