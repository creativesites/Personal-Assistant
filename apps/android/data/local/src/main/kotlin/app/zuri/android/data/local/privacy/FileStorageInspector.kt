package app.zuri.android.data.local.privacy

import app.zuri.android.domain.privacy.StorageInspector
import app.zuri.android.domain.privacy.StorageReport
import java.io.File

/**
 * Measures the database on disk. Encryption is verified, not assumed: a plaintext SQLite file always
 * begins with the 16-byte header "SQLite format 3\0"; a SQLCipher file begins with random salt.
 */
class FileStorageInspector(
    private val databaseFile: File,
    private val workspaceCount: suspend () -> Int,
    private val messageCount: suspend () -> Int = { 0 },
    private val rawSnapshotCount: suspend () -> Int = { 0 },
    /** Proves the key isn't a guessable one (see DatabaseKeying.rejectsWeakKeys); the header alone can't. */
    private val keyCheck: (File) -> Boolean = { true },
) : StorageInspector {

    override suspend fun report(): StorageReport {
        val files = listOf("", "-wal", "-shm", "-journal").map { File(databaseFile.path + it) }
        return StorageReport(
            databaseBytes = files.filter { it.exists() }.sumOf { it.length() },
            databaseEncryptionVerified = isEncrypted(databaseFile) && keyCheck(databaseFile),
            workspaceCount = workspaceCount(),
            messageCount = messageCount(),
            rawSnapshotCount = rawSnapshotCount(),
        )
    }

    companion object {
        private val PLAIN_HEADER = "SQLite format 3\u0000".toByteArray(Charsets.US_ASCII)

        fun isEncrypted(file: File): Boolean {
            if (!file.exists() || file.length() < PLAIN_HEADER.size) return false
            val head = ByteArray(PLAIN_HEADER.size)
            file.inputStream().use { input -> if (input.read(head) != head.size) return false }
            return !head.contentEquals(PLAIN_HEADER)
        }
    }
}
