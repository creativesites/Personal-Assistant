package app.zuri.android.core.security.secrets

import android.content.Context
import com.google.crypto.tink.Aead
import com.google.crypto.tink.KeyTemplates
import com.google.crypto.tink.RegistryConfiguration
import com.google.crypto.tink.aead.AeadConfig
import com.google.crypto.tink.integration.android.AndroidKeysetManager

/** Small secrets (account tokens, BYOK keys) encrypted at rest. Replaces deprecated security-crypto. */
interface SecretStore {
    fun put(name: String, value: String)
    fun get(name: String): String?
    fun remove(name: String)
    fun clear()
}

/** Storage for ciphertext only; plaintext never touches it. */
interface CiphertextStorage {
    fun write(name: String, value: String)
    fun read(name: String): String?
    fun delete(name: String)
    fun deleteAll()
}

/** AEAD encryption with the entry name as associated data, so ciphertexts can't be swapped between names. */
class AeadSecretStore(private val aead: Aead, private val storage: CiphertextStorage) : SecretStore {
    override fun put(name: String, value: String) {
        val ct = aead.encrypt(value.toByteArray(Charsets.UTF_8), name.toByteArray(Charsets.UTF_8))
        storage.write(name, java.util.Base64.getEncoder().encodeToString(ct))
    }

    override fun get(name: String): String? {
        val stored = storage.read(name) ?: return null
        val pt = aead.decrypt(java.util.Base64.getDecoder().decode(stored), name.toByteArray(Charsets.UTF_8))
        return String(pt, Charsets.UTF_8)
    }

    override fun remove(name: String) = storage.delete(name)
    override fun clear() = storage.deleteAll()
}

/** SharedPreferences holding only base64 ciphertext (the file is excluded from backups). */
class PrefsCiphertextStorage(context: Context, fileName: String) : CiphertextStorage {
    private val prefs = context.getSharedPreferences(fileName, Context.MODE_PRIVATE)
    override fun write(name: String, value: String) { prefs.edit().putString(name, value).apply() }
    override fun read(name: String): String? = prefs.getString(name, null)
    override fun delete(name: String) { prefs.edit().remove(name).apply() }
    override fun deleteAll() { prefs.edit().clear().apply() }
}

object TinkAead {
    /** Tink keyset stored encrypted under an Android Keystore master key. */
    fun create(context: Context, keysetPrefsFile: String, keysetName: String, masterKeyAlias: String): Aead {
        AeadConfig.register()
        val handle = AndroidKeysetManager.Builder()
            .withSharedPref(context, keysetName, keysetPrefsFile)
            .withKeyTemplate(KeyTemplates.get("AES256_GCM"))
            .withMasterKeyUri("android-keystore://$masterKeyAlias")
            .build()
            .keysetHandle
        return handle.getPrimitive(RegistryConfiguration.get(), Aead::class.java)
    }
}
