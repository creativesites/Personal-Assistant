package app.zuri.android.engine.sync

import app.zuri.android.core.common.ZuriLog
import app.zuri.android.data.local.db.SyncState
import app.zuri.android.data.local.db.ZuriDatabase
import app.zuri.android.data.remote.CloudAccountStore
import app.zuri.android.data.remote.CloudApi

/**
 * G5: messages this phone captured from WhatsApp notifications go to the owner's Zuri account,
 * so nothing the cloud session missed is lost. Only with the owner's consent (P4, off by default),
 * only WhatsApp, only from when it was turned on (plus 3 days). The server matches each capture to
 * the real WhatsApp message or keeps it; the feed then brings the canonical copy back, and the
 * local capture is replaced in place (FeedApplier).
 */
class CaptureUploader(private val db: ZuriDatabase, private val api: CloudApi, private val prefs: SyncPrefs, private val account: CloudAccountStore) {
    private val dao = db.cloudSyncDao()

    suspend fun run(maxBatches: Int = 5): Int {
        if (!prefs.upload() || account.token == null) return 0
        var done = 0
        repeat(maxBatches) {
            val rows = dao.capturesToUpload(FeedApplier.WHATSAPP_PACKAGES, prefs.uploadSince(), BATCH)
            if (rows.isEmpty()) return done
            val items = rows.map { r ->
                val m = r.message
                val jid = r.chatKey.removePrefix("s:").takeIf { r.chatKey.startsWith("s:") && it.contains('@') }
                CloudApi.DeviceItem(
                    clientId = m.id, source = if (r.packageName == "com.whatsapp.w4b") "whatsapp_business" else "whatsapp",
                    chatKey = jid ?: db.conversationDao().byId(m.conversationId)?.title.orEmpty(), chatKeyKind = if (jid != null) "jid" else "title",
                    isGroup = r.isGroup, senderKey = m.senderKey, senderName = m.senderName, fromMe = m.direction == "OUTGOING",
                    text = m.text, placeholderKind = placeholder(m.placeholderKind), sentAt = m.sentAt, fingerprint = m.fingerprint,
                )
            }
            val results = runCatching { api.uploadCaptures(CloudApi.DeviceBatch(account.deviceId, items)) }.getOrElse {
                ZuriLog.w("SYNC", "upload_failed", "detail" to (it.message ?: "")); return done
            }
            for (res in results) {
                val state = when (res.status) {
                    "matched", "created" -> SyncState.SYNCED
                    // The server decides within 3 minutes; ask again next run.
                    "pending" -> SyncState.PENDING_PUSH
                    // Never merged automatically: kept for the owner to review.
                    "ambiguous" -> SyncState.CONFLICT
                    else -> SyncState.SYNCED // skipped: unknown chat or empty, nothing to retry
                }
                if (state != SyncState.PENDING_PUSH) dao.setSyncState(res.clientId, state.name)
            }
            // Pending ones stay LOCAL_ONLY and are offered again (the server is idempotent per clientId).
            done += results.count { it.status == "matched" || it.status == "created" }
            if (results.all { it.status == "pending" }) return done
        }
        return done
    }

    private fun placeholder(kind: String?): String? = when (kind) {
        "PHOTO" -> "photo"; "VIDEO", "GIF" -> "video"; "VOICE_NOTE", "AUDIO" -> "voice"; "STICKER" -> "sticker"
        "DOCUMENT" -> "document"; "LOCATION" -> "location"; "CONTACT_CARD" -> "contact"; else -> null
    }

    private companion object { const val BATCH = 200 }
}
