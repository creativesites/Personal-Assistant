package app.zuri.android.data.remote

import app.zuri.android.core.security.secrets.SecretStore
import java.util.UUID
import kotlinx.serialization.Serializable

/** This phone's cloud binding, encrypted at rest (SecretStore: Tink AEAD under a Keystore key). */
class CloudAccountStore(private val secrets: SecretStore) {
    @Serializable data class Binding(
        val userId: String, val email: String?, val name: String?, val deviceSessionId: String, val connectedAt: Long,
    )

    var token: String?
        get() = runCatching { secrets.get(TOKEN) }.getOrNull()
        set(value) { if (value == null) secrets.remove(TOKEN) else secrets.put(TOKEN, value) }

    var binding: Binding?
        get() = runCatching { secrets.get(BINDING)?.let { CloudApi.JSON.decodeFromString(Binding.serializer(), it) } }.getOrNull()
        set(value) {
            if (value == null) secrets.remove(BINDING) else secrets.put(BINDING, CloudApi.JSON.encodeToString(Binding.serializer(), value))
        }

    /** Stable for this install: the server keys this phone's session on it. */
    val deviceId: String
        @Synchronized get() = runCatching { secrets.get(DEVICE_ID) }.getOrNull() ?: UUID.randomUUID().toString().also { secrets.put(DEVICE_ID, it) }

    fun clear() {
        secrets.remove(TOKEN)
        secrets.remove(BINDING)
    }

    private companion object {
        const val TOKEN = "cloud.token"
        const val BINDING = "cloud.binding"
        const val DEVICE_ID = "cloud.device_id"
    }
}
