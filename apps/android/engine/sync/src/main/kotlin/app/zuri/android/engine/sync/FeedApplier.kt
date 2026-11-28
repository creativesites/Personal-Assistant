package app.zuri.android.engine.sync

import androidx.room.withTransaction
import app.zuri.android.core.common.Clock
import app.zuri.android.core.common.UuidV7
import app.zuri.android.data.local.db.CloudContactEntity
import app.zuri.android.data.local.db.CloudPendingMessageEntity
import app.zuri.android.data.local.db.ConversationEntity
import app.zuri.android.data.local.db.MessageEntity
import app.zuri.android.data.local.db.Origin
import app.zuri.android.data.local.db.SyncState
import app.zuri.android.data.local.db.ZuriDatabase
import app.zuri.android.data.remote.CloudApi
import app.zuri.android.data.remote.SyncContact
import app.zuri.android.data.remote.SyncConversation
import app.zuri.android.data.remote.SyncMessage
import app.zuri.android.domain.capture.SourceKind
import app.zuri.android.domain.inbox.Direction
import app.zuri.android.domain.inbox.PlaceholderKind
import kotlinx.serialization.json.JsonObject

/**
 * Applies sync-feed changes to the phone's database (docs/SYNC_FEED.md, D-21). Every change is a
 * whole-row upsert, so applying one twice is harmless; a change older than the stored row's seq is ignored.
 *
 * Linking: a cloud chat joins the chat already captured from WhatsApp notifications when the chat
 * key matches (groups: `s:<jid>@g.us`), or, for a one-to-one chat, when exactly one unlinked chat has
 * the contact's name as its title. Otherwise it becomes a new chat in the workspace WhatsApp's rule
 * names (else Personal). A cloud message replaces the notification capture of the same message
 * (same chat and side, text equal, within [MATCH_WINDOW_MILLIS]) in place, so memories and other
 * items that point at the capture stay valid.
 *
 * The feed usually delivers a chat's messages before the chat itself (the chat's row changes with
 * every message). Such messages wait in `cloud_pending_message` until their chat arrives.
 */
class FeedApplier(private val db: ZuriDatabase, private val clock: Clock) {
    private val dao = db.cloudSyncDao()
    private val workspaces = db.workspaceDao()

    data class Applied(val contacts: Int = 0, val conversations: Int = 0, val messages: Int = 0, val deletes: Int = 0)

    suspend fun apply(changes: List<CloudApi.Change>): Applied = db.withTransaction {
        var c = 0; var v = 0; var m = 0; var d = 0
        // Contacts name chats, chats hold messages: apply in that order within a page.
        for (ch in changes.filter { it.entity == "contact" }) { if (ch.op == "delete") { dao.deleteContact(ch.id); d++ } else ch.data?.let { contact(decode(it, SyncContact.serializer()), ch.seq.toLong()); c++ } }
        for (ch in changes.filter { it.entity == "conversation" }) { if (ch.op == "delete") { deleteConversation(ch.id); d++ } else ch.data?.let { conversation(decode(it, SyncConversation.serializer()), ch.seq.toLong()); v++ } }
        for (ch in changes.filter { it.entity == "message" }) {
            if (ch.op == "delete") { dao.deleteMessageByRemote(ch.id); dao.dropPending(ch.id); d++ }
            else ch.data?.let { message(decode(it, SyncMessage.serializer()), ch.seq.toLong(), it.toString()); m++ }
        }
        Applied(c, v, m, d)
    }

    /** A page of older history for one chat (exact keyset paging; display order is (timestamp, order)). */
    suspend fun applyHistory(messages: List<SyncMessage>) = db.withTransaction {
        for (msg in messages) message(msg, msg.seq.toLongOrNull() ?: 0L, null)
    }

    // ── contacts ────────────────────────────────────────────────────────────

    private suspend fun contact(s: SyncContact, seq: Long) {
        val existing = dao.contact(s.id)
        if (existing != null && existing.seq > seq) return
        val entity = CloudContactEntity(s.id, s.jid, s.phone, s.name, s.savedName, s.pushName, s.isGroup, s.isBusiness, seq, avatarTag = s.avatarTag)
        dao.upsertContact(entity)
        val title = titleFor(entity) ?: return
        // Chats that came from the cloud take the contact's name; captured chats keep the phone's.
        for (conv in dao.conversationsOfContact(s.id)) {
            if (conv.origin == Origin.CLOUD.name && conv.title != title) dao.retitle(conv.id, title, clock.nowMillis())
        }
    }

    // ── conversations ───────────────────────────────────────────────────────

    private suspend fun conversation(s: SyncConversation, seq: Long): ConversationEntity {
        val now = clock.nowMillis()
        val contact = s.contactId?.let { dao.contact(it) }
        val jid = s.chatJid ?: contact?.jid
        val isGroup = contact?.isGroup ?: (jid?.endsWith("@g.us") == true)
        val existing = dao.conversationByRemote(s.id)
        if (existing != null) {
            if ((existing.remoteSeq ?: 0) > seq) return existing
            val title = if (existing.origin == Origin.CLOUD.name) contact?.let { titleFor(it) } ?: existing.title else existing.title
            dao.linkConversation(existing.id, s.id, s.contactId, seq, title, existing.isGroup || isGroup, s.lastMessageAt ?: 0, s.unreadCount, now)
            drainPending(s.id)
            return checkNotNull(dao.conversationByRemote(s.id))
        }
        val candidate = jid?.let { dao.unlinkedByChatKey(CHAT_KEY_PREFIX + it, WHATSAPP_PACKAGES) }
            ?: if (!isGroup) contact?.let { titleFor(it) }?.let { t -> dao.unlinkedByTitle(t, WHATSAPP_PACKAGES).singleOrNull() } else null
        if (candidate != null) {
            dao.linkConversation(candidate.id, s.id, s.contactId, seq, candidate.title, candidate.isGroup || isGroup, s.lastMessageAt ?: 0, s.unreadCount, now)
        } else {
            val personal = checkNotNull(workspaces.personal()) { "Personal workspace missing" }
            val home = workspaces.ruleFor(SourceKind.WHATSAPP.name) ?: personal.id
            val entity = ConversationEntity(
                id = UuidV7.generate(clock), workspaceId = home, sourceKind = SourceKind.WHATSAPP.name, packageName = WHATSAPP,
                chatKey = jid?.let { CHAT_KEY_PREFIX + it } ?: "cloud:${s.id}",
                title = contact?.let { titleFor(it) } ?: jid?.substringBefore('@') ?: "WhatsApp chat",
                isGroup = isGroup, analyse = !isGroup, lastMessageAt = s.lastMessageAt ?: 0, unreadCount = s.unreadCount,
                createdAt = now, updatedAt = now, origin = Origin.CLOUD.name, remoteId = s.id, syncState = SyncState.SYNCED.name,
                remoteContactId = s.contactId, remoteSeq = seq,
            )
            runCatching { dao.insertConversation(entity) }.getOrElse {
                // The chat key is taken in that workspace by a chat linked elsewhere: keep them apart.
                dao.insertConversation(entity.copy(chatKey = "cloud:${s.id}"))
            }
        }
        drainPending(s.id)
        return checkNotNull(dao.conversationByRemote(s.id))
    }

    private suspend fun deleteConversation(remoteId: String) {
        dao.deleteCloudConversation(remoteId)
        dao.unlinkConversation(remoteId)
        dao.clearPending(remoteId)
    }

    private suspend fun drainPending(conversationRemoteId: String) {
        val waiting = dao.pendingFor(conversationRemoteId)
        if (waiting.isEmpty()) return
        dao.clearPending(conversationRemoteId)
        for (p in waiting) message(CloudApi.JSON.decodeFromString(SyncMessage.serializer(), p.json), p.seq, null)
    }

    // ── messages ────────────────────────────────────────────────────────────

    private suspend fun message(s: SyncMessage, seq: Long, rawJson: String?) {
        val conv = dao.conversationByRemote(s.conversationId)
        if (conv == null) {
            dao.stashPending(CloudPendingMessageEntity(s.id, s.conversationId, seq, rawJson ?: CloudApi.JSON.encodeToString(SyncMessage.serializer(), s)))
            return
        }
        val now = clock.nowMillis()
        val mapped = CloudMessages.map(s)
        val target = dao.messageByRemote(s.id)
            ?: dao.messageByWaId(conv.id, s.waMessageId)
            ?: captureOf(conv, s, mapped)
        if (target != null) {
            if ((target.remoteSeq ?: 0) > seq) return
            dao.applyCloud(
                id = target.id, remoteId = s.id, waId = s.waMessageId, sentAt = s.timestamp, order = mapped.order, seq = seq,
                senderName = mapped.senderName, text = mapped.text, placeholder = mapped.placeholder, detail = mapped.detail,
                edited = s.editedAt != null, status = s.status, quoted = mapped.quoted, media = mapped.media,
                reactions = mapped.reactions, location = mapped.location, forwarded = s.forwarded, starred = s.starred,
                sourcePackage = CLOUD_PACKAGE, fingerprint = "cloud:${s.waMessageId}", now = now,
            )
        } else {
            dao.insertMessage(
                MessageEntity(
                    id = UuidV7.generate(clock), conversationId = conv.id, workspaceId = conv.workspaceId,
                    direction = (if (s.fromMe) Direction.OUTGOING else Direction.INCOMING).name,
                    senderKey = mapped.senderKey(conv), senderName = mapped.senderName, text = mapped.text,
                    placeholderKind = mapped.placeholder, placeholderDetail = mapped.detail,
                    sentAt = s.timestamp, exactTime = true, fingerprint = "cloud:${s.waMessageId}", edited = s.editedAt != null,
                    sourcePackage = CLOUD_PACKAGE, notificationKey = "", notificationPostedAt = 0, capturedAt = now, adapterVersion = 0,
                    // Dated by the message itself so imported history never looks "just arrived" (auto-replies, D-22).
                    createdAt = minOf(now, s.timestamp), updatedAt = now,
                    origin = Origin.CLOUD.name, remoteId = s.id, syncState = SyncState.SYNCED.name,
                    waId = s.waMessageId, sortOrder = mapped.order, remoteSeq = seq, deliveryStatus = s.status,
                    quoted = mapped.quoted, media = mapped.media, reactions = mapped.reactions, location = mapped.location,
                    forwarded = s.forwarded, starred = s.starred,
                ),
            )
        }
        dao.bumpLastMessage(conv.id, s.timestamp, now)
    }

    /** The notification capture of this same message, if there is exactly one plausible one. */
    private suspend fun captureOf(conv: ConversationEntity, s: SyncMessage, mapped: CloudMessages.Mapped): MessageEntity? {
        val direction = (if (s.fromMe) Direction.OUTGOING else Direction.INCOMING).name
        val candidates = dao.captureCandidates(conv.id, direction, s.timestamp, s.timestamp - MATCH_WINDOW_MILLIS, s.timestamp + MATCH_WINDOW_MILLIS)
        return candidates.firstOrNull { CloudMessages.sameContent(it, mapped) }
    }

    private fun titleFor(c: CloudContactEntity): String? = c.displayName() ?: c.phone?.let { "+$it".replace("++", "+") }

    private fun <T> decode(o: JsonObject, de: kotlinx.serialization.DeserializationStrategy<T>): T = CloudApi.JSON.decodeFromJsonElement(de, o)

    companion object {
        const val WHATSAPP = "com.whatsapp"
        val WHATSAPP_PACKAGES = listOf("com.whatsapp", "com.whatsapp.w4b")
        /** Source package of rows that came from the cloud: device source settings (retention, removal) never touch them. */
        const val CLOUD_PACKAGE = "zuri.cloud"
        /** Notification chat keys are `s:` + WhatsApp's shortcut id, which is the chat JID. */
        const val CHAT_KEY_PREFIX = "s:"
        const val MATCH_WINDOW_MILLIS = 120_000L
    }
}
