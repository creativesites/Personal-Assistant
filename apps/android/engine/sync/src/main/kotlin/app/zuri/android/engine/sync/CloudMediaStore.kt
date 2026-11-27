package app.zuri.android.engine.sync

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import app.zuri.android.core.common.Clock
import app.zuri.android.data.local.db.CloudJson
import app.zuri.android.data.local.db.MediaFileEntity
import app.zuri.android.data.local.db.ZuriDatabase
import app.zuri.android.data.remote.CloudApi
import app.zuri.android.data.remote.CloudAccountStore
import app.zuri.android.domain.cloud.CloudMedia
import app.zuri.android.domain.cloud.MediaResult
import com.google.crypto.tink.RegistryConfiguration
import com.google.crypto.tink.StreamingAead
import com.google.crypto.tink.KeyTemplates
import com.google.crypto.tink.integration.android.AndroidKeysetManager
import com.google.crypto.tink.streamingaead.StreamingAeadConfig
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

/**
 * Cloud media on the phone (D-21): downloaded on demand from the server, stored encrypted
 * (Tink streaming AEAD, key in the Android Keystore) under filesDir/media, and evicted
 * least-recently-used past [CAP_BYTES]. Viewing decrypts a temporary copy into the cache dir.
 */
class CloudMediaStore(
    private val context: Context,
    private val db: ZuriDatabase,
    private val api: CloudApi,
    private val prefs: SyncPrefs,
    private val account: CloudAccountStore,
    private val clock: Clock,
) : CloudMedia {
    private val dao = db.cloudSyncDao()
    private val dir get() = File(context.filesDir, "media").apply { mkdirs() }
    private val viewDir get() = File(context.cacheDir, "media-view").apply { mkdirs() }
    private val lock = Mutex()

    private val aead: StreamingAead by lazy {
        StreamingAeadConfig.register()
        AndroidKeysetManager.Builder()
            .withSharedPref(context, "media", "zuri_media_keyset")
            .withKeyTemplate(KeyTemplates.get("AES256_GCM_HKDF_1MB"))
            .withMasterKeyUri("android-keystore://zuri_media_master_v1")
            .build().keysetHandle
            .getPrimitive(RegistryConfiguration.get(), StreamingAead::class.java)
    }

    override fun isStored(messageId: String): Flow<Boolean> = dao.observeMediaStored(messageId)

    override suspend fun open(messageId: String, force: Boolean): MediaResult = withContext(Dispatchers.IO) {
        val stored = dao.media(messageId)
        if (stored != null && File(stored.path).exists()) {
            dao.touchMedia(messageId, clock.nowMillis())
            return@withContext MediaResult.Ready(decryptForView(messageId, stored), stored.mime)
        }
        val media = CloudJson.media(dao.mediaJson(messageId)) ?: return@withContext MediaResult.NotAvailable
        if (!media.available) return@withContext MediaResult.NotAvailable
        if (account.token == null) return@withContext MediaResult.NotConnected
        if (!force && prefs.wifiOnly() && metered()) return@withContext MediaResult.NeedsWifi
        lock.withLock {
            runCatching {
                val file = File(dir, "$messageId.bin")
                var type: String? = null
                file.outputStream().use { raw ->
                    aead.newEncryptingStream(raw, messageId.toByteArray()).use { enc ->
                        type = api.downloadMedia(media.path) { input -> input.copyTo(enc) }
                    }
                }
                val entity = MediaFileEntity(messageId, file.path, file.length(), media.mime ?: type, clock.nowMillis(), clock.nowMillis())
                dao.upsertMedia(entity)
                evict()
                MediaResult.Ready(decryptForView(messageId, entity), entity.mime) as MediaResult
            }.getOrElse { e ->
                File(dir, "$messageId.bin").delete()
                when (e) {
                    is CloudApi.SignedOut -> MediaResult.NotConnected
                    is CloudApi.HttpError -> if (e.code == 404 || e.code == 410) MediaResult.NotAvailable else MediaResult.Failed("Couldn't download (${e.code})")
                    else -> MediaResult.Failed(e.message ?: "Couldn't download")
                }
            }
        }
    }

    suspend fun bytesStored(): Long = dao.mediaBytes()

    suspend fun clear() = withContext(Dispatchers.IO) {
        dao.allMedia().forEach { File(it.path).delete(); dao.deleteMedia(it.messageId) }
        dir.listFiles()?.forEach { it.delete() }
        viewDir.listFiles()?.forEach { it.delete() }
    }

    private fun decryptForView(messageId: String, entity: MediaFileEntity): String {
        val out = File(viewDir, messageId + extension(entity.mime))
        if (!out.exists() || out.length() == 0L) {
            File(entity.path).inputStream().use { raw ->
                aead.newDecryptingStream(raw, messageId.toByteArray()).use { dec -> out.outputStream().use { dec.copyTo(it) } }
            }
        }
        return out.path
    }

    private suspend fun evict() {
        var total = dao.mediaBytes()
        if (total <= CAP_BYTES) return
        for (m in dao.leastRecentMedia(200)) {
            if (total <= CAP_BYTES * 9 / 10) break
            File(m.path).delete()
            File(viewDir, m.messageId + extension(m.mime)).delete()
            dao.deleteMedia(m.messageId)
            total -= m.bytes
        }
    }

    private fun metered(): Boolean {
        val cm = context.getSystemService(ConnectivityManager::class.java) ?: return true
        val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return true
        return !caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)
    }

    private fun extension(mime: String?): String = when {
        mime == null -> ""
        mime.startsWith("image/jpeg") -> ".jpg"
        mime.startsWith("image/png") -> ".png"
        mime.startsWith("image/webp") -> ".webp"
        mime.startsWith("video/mp4") -> ".mp4"
        mime.startsWith("audio/ogg") -> ".ogg"
        mime.startsWith("audio/mpeg") -> ".mp3"
        mime.startsWith("audio/mp4") -> ".m4a"
        mime == "application/pdf" -> ".pdf"
        else -> ""
    }

    companion object {
        const val CAP_BYTES = 1_000L * 1024 * 1024
    }
}
