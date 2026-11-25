package app.zuri.android.core.security.keys

import java.io.File
import java.security.SecureRandom

/**
 * Provides the random 256-bit data-encryption key (DEK) for the SQLCipher database.
 * The DEK is stored only in wrapped form, in no-backup storage. If the wrapped key exists but can't be
 * unwrapped, this throws [KeyUnavailableException] instead of silently creating a new key, which
 * would make the existing database unreadable without anyone noticing.
 */
class DatabaseKeyProvider(
    private val wrappedKeyFile: File,
    private val wrapper: KeyWrapper,
    private val random: SecureRandom = SecureRandom(),
) {
    @Synchronized
    fun getOrCreate(): ByteArray {
        if (wrappedKeyFile.exists()) return wrapper.unwrap(wrappedKeyFile.readBytes())
        val dek = ByteArray(KEY_BYTES).also { random.nextBytes(it) }
        val blob = wrapper.wrap(dek)
        wrappedKeyFile.parentFile?.mkdirs()
        val tmp = File(wrappedKeyFile.parentFile, wrappedKeyFile.name + ".tmp")
        tmp.writeBytes(blob)
        check(tmp.renameTo(wrappedKeyFile)) { "Could not persist the wrapped database key" }
        return dek
    }

    fun exists(): Boolean = wrappedKeyFile.exists()

    companion object {
        const val KEY_BYTES = 32
    }
}
