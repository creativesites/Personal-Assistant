package app.zuri.android.data.local.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Upsert

/** What the cloud sync engine reads and writes (docs/SYNC_FEED.md, D-21). */
@Dao
interface CloudSyncDao {
    // ── contacts ────────────────────────────────────────────────────────────
    @Upsert suspend fun upsertContact(c: CloudContactEntity)

    @Query("SELECT * FROM cloud_contact WHERE id = :id")
    suspend fun contact(id: String): CloudContactEntity?

    @Query("DELETE FROM cloud_contact WHERE id = :id")
    suspend fun deleteContact(id: String)

    @Query("SELECT * FROM conversation WHERE remote_contact_id = :contactId")
    suspend fun conversationsOfContact(contactId: String): List<ConversationEntity>

    // ── conversations ───────────────────────────────────────────────────────
    @Query("SELECT * FROM conversation WHERE remote_id = :remoteId LIMIT 1")
    suspend fun conversationByRemote(remoteId: String): ConversationEntity?

    /** A chat captured from WhatsApp notifications with the same JID (groups; @lid one-to-one chats once G5 lands). */
    @Query("SELECT * FROM conversation WHERE chat_key = :chatKey AND package_name IN (:packages) AND remote_id IS NULL LIMIT 1")
    suspend fun unlinkedByChatKey(chatKey: String, packages: List<String>): ConversationEntity?

    /** Unlinked one-to-one WhatsApp chats with exactly this title (the phone's saved contact name). */
    @Query("SELECT * FROM conversation WHERE title = :title AND is_group = 0 AND package_name IN (:packages) AND remote_id IS NULL")
    suspend fun unlinkedByTitle(title: String, packages: List<String>): List<ConversationEntity>

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insertConversation(c: ConversationEntity)

    @Query(
        """UPDATE conversation SET remote_id = :remoteId, remote_contact_id = :contactId, remote_seq = :seq, title = :title,
           is_group = :isGroup, last_message_at = MAX(last_message_at, :lastAt), unread_count = :unread, updated_at = :now
           WHERE id = :id""",
    )
    suspend fun linkConversation(id: String, remoteId: String, contactId: String?, seq: Long, title: String, isGroup: Boolean, lastAt: Long, unread: Int, now: Long)

    @Query("UPDATE conversation SET ai_enabled = :on WHERE id = :id")
    suspend fun setAiEnabled(id: String, on: Boolean)

    @Query("UPDATE cloud_contact SET is_partner = :on WHERE id = :id")
    suspend fun setPartner(id: String, on: Boolean)

    /** The linked chat of a contact known by its @lid (G5): notifications key one-to-one chats by lid. */
    @Query("SELECT v.* FROM conversation v JOIN cloud_contact cc ON cc.id = v.remote_contact_id WHERE cc.lid = :lid AND v.package_name = :pkg LIMIT 1")
    suspend fun linkedByLid(lid: String, pkg: String): ConversationEntity?

    @Query("UPDATE conversation SET title = :title, updated_at = :now WHERE id = :id")
    suspend fun retitle(id: String, title: String, now: Long)

    @Query("UPDATE conversation SET last_message_at = MAX(last_message_at, :at), updated_at = :now WHERE id = :id")
    suspend fun bumpLastMessage(id: String, at: Long, now: Long)

    @Query("DELETE FROM conversation WHERE remote_id = :remoteId AND origin = 'CLOUD'")
    suspend fun deleteCloudConversation(remoteId: String)

    /** A chat that came from a device capture and was later linked keeps its rows but loses the link. */
    @Query("UPDATE conversation SET remote_id = NULL, remote_contact_id = NULL, remote_seq = NULL WHERE remote_id = :remoteId")
    suspend fun unlinkConversation(remoteId: String)

    // ── messages ────────────────────────────────────────────────────────────
    @Query("SELECT * FROM message WHERE remote_id = :remoteId LIMIT 1")
    suspend fun messageByRemote(remoteId: String): MessageEntity?

    @Query("SELECT * FROM message WHERE conversation_id = :conversationId AND wa_id = :waId LIMIT 1")
    suspend fun messageByWaId(conversationId: String, waId: String): MessageEntity?

    /** Notification captures that may be this cloud message (same chat and side, within the window). */
    @Query(
        """SELECT * FROM message WHERE conversation_id = :conversationId AND remote_id IS NULL AND direction = :direction
           AND sent_at BETWEEN :from AND :to ORDER BY ABS(sent_at - :at)""",
    )
    suspend fun captureCandidates(conversationId: String, direction: String, at: Long, from: Long, to: Long): List<MessageEntity>

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insertMessage(m: MessageEntity)

    @Query(
        """UPDATE message SET remote_id = :remoteId, wa_id = :waId, origin = 'CLOUD', sync_state = 'SYNCED',
           sent_at = :sentAt, exact_time = 1, sort_order = :order, remote_seq = :seq,
           sender_name = COALESCE(:senderName, sender_name),
           text = :text, placeholder_kind = :placeholder, placeholder_detail = :detail, edited = :edited,
           delivery_status = :status, quoted = :quoted, media = :media, reactions = :reactions, location = :location,
           forwarded = :forwarded, starred = :starred, source_package = :sourcePackage, fingerprint = :fingerprint,
           perceived_at = CASE WHEN text IS :text THEN perceived_at ELSE NULL END, updated_at = :now
           WHERE id = :id""",
    )
    suspend fun applyCloud(
        id: String, remoteId: String, waId: String, sentAt: Long, order: Long, seq: Long, senderName: String?,
        text: String?, placeholder: String?, detail: String?, edited: Boolean, status: String?,
        quoted: String?, media: String?, reactions: String?, location: String?, forwarded: Boolean, starred: Boolean,
        sourcePackage: String, fingerprint: String, now: Long,
    )

    @Query("DELETE FROM message WHERE remote_id = :remoteId")
    suspend fun deleteMessageByRemote(remoteId: String)

    @Query("SELECT * FROM message WHERE conversation_id = :conversationId AND remote_id IS NOT NULL ORDER BY sent_at, sort_order LIMIT 1")
    suspend fun oldestCloudMessage(conversationId: String): MessageEntity?

    @Query("SELECT COUNT(*) FROM message WHERE remote_id IS NOT NULL")
    suspend fun cloudMessageCount(): Int

    @Query("SELECT media FROM message WHERE id = :id")
    suspend fun mediaJson(id: String): String?

    @Query("SELECT remote_id FROM message WHERE id = :id")
    suspend fun remoteIdOf(id: String): String?

    // ── messages waiting for their chat ─────────────────────────────────────
    @Upsert suspend fun stashPending(p: CloudPendingMessageEntity)

    @Query("SELECT * FROM cloud_pending_message WHERE conversation_remote_id = :conversationRemoteId ORDER BY seq")
    suspend fun pendingFor(conversationRemoteId: String): List<CloudPendingMessageEntity>

    @Query("SELECT DISTINCT conversation_remote_id FROM cloud_pending_message")
    suspend fun pendingConversations(): List<String>

    @Query("DELETE FROM cloud_pending_message WHERE conversation_remote_id = :conversationRemoteId")
    suspend fun clearPending(conversationRemoteId: String)

    @Query("DELETE FROM cloud_pending_message WHERE remote_id = :remoteId")
    suspend fun dropPending(remoteId: String)

    // ── disconnect ──────────────────────────────────────────────────────────
    @Query("DELETE FROM conversation WHERE origin = 'CLOUD'")
    suspend fun deleteCloudConversations()

    @Query("DELETE FROM message WHERE origin = 'CLOUD' AND remote_id IS NOT NULL")
    suspend fun deleteCloudMessages()

    @Query("UPDATE conversation SET remote_id = NULL, remote_contact_id = NULL, remote_seq = NULL WHERE remote_id IS NOT NULL")
    suspend fun unlinkAll()

    @Query("DELETE FROM cloud_contact")
    suspend fun deleteContacts()

    @Query("DELETE FROM cloud_pending_message")
    suspend fun deleteAllPending()

    /** A one-to-one chat linked to the cloud whose title is exactly this (captures with a different chat key). */
    @Query("SELECT * FROM conversation WHERE title = :title AND is_group = 0 AND package_name = :pkg AND remote_id IS NOT NULL")
    suspend fun linkedByTitle(title: String, pkg: String): List<ConversationEntity>

    @Query("SELECT EXISTS(SELECT 1 FROM media_file WHERE message_id = :messageId)")
    fun observeMediaStored(messageId: String): kotlinx.coroutines.flow.Flow<Boolean>

    // ── profile pictures ────────────────────────────────────────────────────
    @Query("SELECT cc.id AS contactId, cc.avatar_tag AS tag FROM conversation v JOIN cloud_contact cc ON cc.id = v.remote_contact_id WHERE v.id = :conversationId AND cc.avatar_tag IS NOT NULL")
    suspend fun avatarFor(conversationId: String): AvatarRef?

    /** Contacts with a picture, by the chat's latest message (prefetch order). */
    @Query(
        """SELECT cc.id AS contactId, cc.avatar_tag AS tag FROM conversation v JOIN cloud_contact cc ON cc.id = v.remote_contact_id
           WHERE cc.avatar_tag IS NOT NULL AND v.deleted_at IS NULL GROUP BY cc.id ORDER BY MAX(v.last_message_at) DESC LIMIT :limit""",
    )
    suspend fun recentAvatars(limit: Int): List<AvatarRef>

    // ── merging a duplicate captured chat into its cloud chat (G5) ──────────
    @Query("SELECT * FROM message WHERE conversation_id = :conversationId AND remote_id IS NULL ORDER BY sent_at")
    suspend fun capturedIn(conversationId: String): List<MessageEntity>

    @Query("UPDATE memory_item SET source_message_id = :to WHERE source_message_id = :from")
    suspend fun repointMemories(from: String, to: String)

    @Query("DELETE FROM message_embedding WHERE message_id = :messageId")
    suspend fun dropEmbedding(messageId: String)

    @Query("UPDATE message SET conversation_id = :to, workspace_id = :ws WHERE id = :id")
    suspend fun moveMessage(id: String, to: String, ws: String)

    @Query("UPDATE memory_item SET conversation_id = :to, workspace_id = :ws WHERE conversation_id = :from")
    suspend fun moveMemories(from: String, to: String, ws: String)

    @Query("UPDATE auto_reply_event SET conversation_id = :to WHERE conversation_id = :from")
    suspend fun moveAutoReplyEvents(from: String, to: String)

    @Query("UPDATE draft_feedback SET conversation_id = :to WHERE conversation_id = :from")
    suspend fun moveDraftFeedback(from: String, to: String)

    @Query("UPDATE mission SET conversation_id = :to, workspace_id = :ws WHERE conversation_id = :from")
    suspend fun moveMissions(from: String, to: String, ws: String)

    @Query("UPDATE OR IGNORE goal_person SET conversation_id = :to WHERE conversation_id = :from")
    suspend fun moveGoalPeople(from: String, to: String)

    @Query("UPDATE health_log SET conversation_id = :to WHERE conversation_id = :from")
    suspend fun moveHealthLog(from: String, to: String)

    @Query("SELECT * FROM message WHERE conversation_id = :conversationId AND remote_id IS NOT NULL AND direction = :direction AND sent_at BETWEEN :from AND :to")
    suspend fun cloudTwins(conversationId: String, direction: String, from: Long, to: Long): List<MessageEntity>

    @Query("DELETE FROM message WHERE id = :id")
    suspend fun deleteMessageById(id: String)

    @Query("DELETE FROM conversation WHERE id = :id")
    suspend fun deleteConversationById(id: String)

    @Query("UPDATE conversation SET auto_reply = 1 WHERE id = :id")
    suspend fun enableAutoReply(id: String)

    @Query("SELECT * FROM conversation WHERE chat_key = :chatKey AND package_name IN (:packages) AND remote_id IS NULL")
    suspend fun unlinkedAllByChatKey(chatKey: String, packages: List<String>): List<ConversationEntity>

    // ── G5 upload of phone captures (only with the owner's consent) ─────────
    @Query(
        """SELECT m.*, c.chat_key AS c_chat_key, c.is_group AS c_is_group, c.package_name AS c_package FROM message m JOIN conversation c ON c.id = m.conversation_id
           WHERE m.remote_id IS NULL AND m.sync_state = 'LOCAL_ONLY' AND m.source_package IN (:packages) AND m.sent_at > :since
           ORDER BY m.sent_at LIMIT :limit""",
    )
    suspend fun capturesToUpload(packages: List<String>, since: Long, limit: Int): List<CaptureUpload>

    @Query("UPDATE message SET sync_state = :state WHERE id = :id AND remote_id IS NULL")
    suspend fun setSyncState(id: String, state: String)

    // ── media cache ─────────────────────────────────────────────────────────
    @Upsert suspend fun upsertMedia(m: MediaFileEntity)

    @Query("SELECT * FROM media_file WHERE message_id = :messageId")
    suspend fun media(messageId: String): MediaFileEntity?

    @Query("UPDATE media_file SET last_used_at = :now WHERE message_id = :messageId")
    suspend fun touchMedia(messageId: String, now: Long)

    @Query("SELECT COALESCE(SUM(bytes), 0) FROM media_file")
    suspend fun mediaBytes(): Long

    @Query("SELECT * FROM media_file ORDER BY last_used_at ASC LIMIT :limit")
    suspend fun leastRecentMedia(limit: Int): List<MediaFileEntity>

    @Query("DELETE FROM media_file WHERE message_id = :messageId")
    suspend fun deleteMedia(messageId: String)

    @Query("SELECT * FROM media_file")
    suspend fun allMedia(): List<MediaFileEntity>
}

data class AvatarRef(val contactId: String, val tag: String)

data class CaptureUpload(
    @androidx.room.Embedded val message: MessageEntity,
    @androidx.room.ColumnInfo(name = "c_chat_key") val chatKey: String,
    @androidx.room.ColumnInfo(name = "c_is_group") val isGroup: Boolean,
    @androidx.room.ColumnInfo(name = "c_package") val packageName: String,
)
