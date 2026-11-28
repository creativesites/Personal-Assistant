package app.zuri.android.engine.sync

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.LruCache
import app.zuri.android.core.common.ZuriLog
import app.zuri.android.data.local.db.AvatarRef
import app.zuri.android.data.local.db.ZuriDatabase
import app.zuri.android.data.remote.CloudAccountStore
import app.zuri.android.data.remote.CloudApi
import app.zuri.android.domain.cloud.CloudAvatars
import com.google.crypto.tink.Aead
import com.google.crypto.tink.KeyTemplates
import com.google.crypto.tink.RegistryConfiguration
import com.google.crypto.tink.aead.AeadConfig
import com.google.crypto.tink.integration.android.AndroidKeysetManager
import java.io.ByteArrayOutputStream
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

/**
 * WhatsApp profile pictures on the phone (Signals, chat headers, Orbits). Fetched from the server's
 * avatar endpoint, downscaled to [SIDE]px, kept encrypted under filesDir/avatars as
 * `<contact>-<tag>.bin`, and refetched only when the feed's avatarTag changes.
 */
class AvatarStore(
    private val context: Context,
    private val db: ZuriDatabase,
    private val api: CloudApi,
    private val account: CloudAccountStore,
) : CloudAvatars {
    private val dao = db.cloudSyncDao()
    private val dir get() = File(context.filesDir, "avatars").apply { mkdirs() }
    private val memory = LruCache<String, ByteArray>(4 * 1024 * 1024).also { }
    private val locks = Mutex()
    /** Contacts whose picture the server said doesn't exist, by tag, so we don't ask again this run. */
    private val missing = mutableSetOf<String>()

    private val aead: Aead by lazy {
        AeadConfig.register()
        AndroidKeysetManager.Builder()
            .withSharedPref(context, "avatars", "zuri_avatar_keyset")
            .withKeyTemplate(KeyTemplates.get("AES256_GCM"))
            .withMasterKeyUri("android-keystore://zuri_avatar_master_v1")
            .build().keysetHandle.getPrimitive(RegistryConfiguration.get(), Aead::class.java)
    }

    override suspend fun forConversation(conversationId: String): ByteArray? {
        val ref = dao.avatarFor(conversationId) ?: return null
        return load(ref, fetch = true)
    }

    override suspend fun forContact(contactId: String, tag: String?): ByteArray? =
        tag?.let { load(AvatarRef(contactId, it), fetch = true) }

    /** After a sync run: fetch pictures for the most recent chats that don't have theirs yet. */
    suspend fun prefetch(limit: Int = 60): Int {
        if (account.token == null) return 0
        var n = 0
        for (ref in dao.recentAvatars(limit)) {
            if (file(ref).exists() || "${ref.contactId}:${ref.tag}" in missing) continue
            if (load(ref, fetch = true) != null) n++
        }
        if (n > 0) ZuriLog.i("SYNC", "avatars", "fetched" to n)
        return n
    }

    private fun file(ref: AvatarRef) = File(dir, "${ref.contactId}-${ref.tag}.bin")

    private suspend fun load(ref: AvatarRef, fetch: Boolean): ByteArray? = withContext(Dispatchers.IO) {
        val key = "${ref.contactId}:${ref.tag}"
        memory.get(key)?.let { return@withContext it }
        val f = file(ref)
        if (f.exists()) {
            return@withContext runCatching { aead.decrypt(f.readBytes(), ref.contactId.toByteArray()) }.getOrNull()?.also { memory.put(key, it) }
        }
        if (!fetch || account.token == null || key in missing) return@withContext null
        locks.withLock {
            if (f.exists()) return@withLock load(ref, fetch = false)
            when (val r = runCatching { api.avatar(ref.contactId, null) }.getOrElse { return@withLock null }) {
                is CloudApi.Avatar.Bytes -> {
                    val small = downscale(r.data) ?: return@withLock null
                    // Older pictures of the same contact go.
                    dir.listFiles { _, name -> name.startsWith("${ref.contactId}-") }?.forEach { it.delete() }
                    f.writeBytes(aead.encrypt(small, ref.contactId.toByteArray()))
                    memory.put(key, small)
                    small
                }
                CloudApi.Avatar.None, CloudApi.Avatar.NotModified -> { missing += key; null }
            }
        }
    }

    suspend fun clear() = withContext(Dispatchers.IO) {
        memory.evictAll()
        dir.listFiles()?.forEach { it.delete() }
    }

    private fun downscale(bytes: ByteArray): ByteArray? = runCatching {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        var sample = 1
        while (minOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= SIDE) sample *= 2
        val bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample }) ?: return null
        val side = minOf(bmp.width, bmp.height)
        val square = Bitmap.createBitmap(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side)
        val scaled = if (side > SIDE) Bitmap.createScaledBitmap(square, SIDE, SIDE, true) else square
        ByteArrayOutputStream().use { out -> scaled.compress(Bitmap.CompressFormat.JPEG, 85, out); out.toByteArray() }
    }.getOrNull()

    private companion object { const val SIDE = 192 }
}
