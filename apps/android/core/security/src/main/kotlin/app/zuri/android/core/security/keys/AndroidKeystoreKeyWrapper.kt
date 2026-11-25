package app.zuri.android.core.security.keys

import android.content.Context
import android.content.pm.PackageManager
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyInfo
import android.security.keystore.KeyProperties
import android.security.keystore.StrongBoxUnavailableException
import app.zuri.android.core.common.ZuriLog
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec

/**
 * AES-256-GCM key in Android Keystore, backed by StrongBox when the device has it, TEE otherwise.
 * The key is not bound to user authentication: capture must write while the phone is locked
 * (SECURITY_AND_PRIVACY.md §3.1). Blob layout: 12-byte IV followed by ciphertext + tag.
 */
class AndroidKeystoreKeyWrapper(
    private val context: Context,
    private val alias: String,
) : KeyWrapper {

    private val keyStore: KeyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }

    override fun wrap(plaintext: ByteArray): ByteArray {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
        return cipher.iv + cipher.doFinal(plaintext)
    }

    override fun unwrap(blob: ByteArray): ByteArray {
        require(blob.size > IV_BYTES) { "Wrapped blob is too short" }
        val key = (keyStore.getKey(alias, null) as? SecretKey)
            ?: throw KeyUnavailableException("Keystore key '$alias' is missing")
        return try {
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(TAG_BITS, blob, 0, IV_BYTES))
            cipher.doFinal(blob, IV_BYTES, blob.size - IV_BYTES)
        } catch (e: java.security.GeneralSecurityException) {
            throw KeyUnavailableException("Could not unwrap with '$alias'", e)
        }
    }

    override val protection: KeyProtection
        get() = runCatching {
            val key = getOrCreateKey()
            val info = SecretKeyFactory.getInstance(key.algorithm, ANDROID_KEYSTORE).getKeySpec(key, KeyInfo::class.java) as KeyInfo
            when (info.securityLevel) {
                KeyProperties.SECURITY_LEVEL_STRONGBOX -> KeyProtection.StrongBox
                KeyProperties.SECURITY_LEVEL_TRUSTED_ENVIRONMENT -> KeyProtection.TrustedEnvironment
                else -> KeyProtection.Software
            }
        }.getOrDefault(KeyProtection.Software)

    @Synchronized
    private fun getOrCreateKey(): SecretKey {
        (keyStore.getKey(alias, null) as? SecretKey)?.let { return it }
        val strongBox = context.packageManager.hasSystemFeature(PackageManager.FEATURE_STRONGBOX_KEYSTORE)
        return try {
            generate(strongBox)
        } catch (e: StrongBoxUnavailableException) {
            ZuriLog.w(TAG, "strongbox_unavailable_fallback_tee")
            generate(false)
        }
    }

    private fun generate(strongBox: Boolean): SecretKey {
        val spec = KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .setRandomizedEncryptionRequired(true)
            .setIsStrongBoxBacked(strongBox)
            .build()
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE).run {
            init(spec)
            generateKey()
        }.also { ZuriLog.i(TAG, "wrapping_key_created", "strongBox" to strongBox) }
    }

    private companion object {
        const val TAG = "Keys"
        const val ANDROID_KEYSTORE = "AndroidKeyStore"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val IV_BYTES = 12
        const val TAG_BITS = 128
    }
}
