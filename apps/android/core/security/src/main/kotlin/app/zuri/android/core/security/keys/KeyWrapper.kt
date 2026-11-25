package app.zuri.android.core.security.keys

/** Encrypts small secrets (data-encryption keys) with a key that never leaves secure hardware. */
interface KeyWrapper {
    fun wrap(plaintext: ByteArray): ByteArray
    fun unwrap(blob: ByteArray): ByteArray
    /** Human-readable description of where the wrapping key lives, for Privacy Center. */
    val protection: KeyProtection
}

enum class KeyProtection { StrongBox, TrustedEnvironment, Software }

/** The wrapping key is gone or unusable (e.g. after a factory-reset restore). Data can't be decrypted. */
class KeyUnavailableException(message: String, cause: Throwable? = null) : Exception(message, cause)
