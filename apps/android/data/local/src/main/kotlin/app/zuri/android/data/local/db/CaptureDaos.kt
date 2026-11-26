package app.zuri.android.data.local.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
interface SourceAppDao {
    @Query("SELECT * FROM source_app")
    fun observeAll(): Flow<List<SourceAppEntity>>

    @Query("SELECT * FROM source_app")
    suspend fun all(): List<SourceAppEntity>

    @Upsert
    suspend fun upsert(entity: SourceAppEntity)
}

@Dao
interface CaptureRawDao {
    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insert(entity: CaptureRawEntity)

    @Query("SELECT * FROM capture_raw WHERE state = 'PENDING' ORDER BY captured_at, id LIMIT :limit")
    suspend fun pending(limit: Int): List<CaptureRawEntity>

    @Query("UPDATE capture_raw SET state = :state, detail = :detail, processed_at = :at WHERE id = :id")
    suspend fun mark(id: String, state: String, detail: String?, at: Long)

    @Query("DELETE FROM capture_raw WHERE id = :id")
    suspend fun delete(id: String)

    /** Raw snapshots are reprocessing material only; processed ones expire after the raw window. */
    @Query("DELETE FROM capture_raw WHERE state != 'PENDING' AND captured_at < :before")
    suspend fun deleteProcessedBefore(before: Long): Int

    @Query("DELETE FROM capture_raw WHERE package_name = :pkg AND state != 'PENDING'")
    suspend fun deleteProcessedForPackage(pkg: String): Int

    @Query("DELETE FROM capture_raw WHERE package_name IN (:packages)")
    suspend fun deleteForPackages(packages: List<String>): Int

    @Query("SELECT MAX(captured_at) FROM capture_raw")
    fun observeLastCapture(): Flow<Long?>

    @Query("SELECT COUNT(*) FROM capture_raw WHERE captured_at >= :since")
    fun observeCountSince(since: Long): Flow<Int>

    @Query("SELECT COUNT(*) FROM capture_raw")
    suspend fun count(): Int
}

@Dao
interface CaptureExclusionDao {
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insert(entity: CaptureExclusionEntity)

    @Query("SELECT EXISTS(SELECT 1 FROM capture_exclusion WHERE package_name = :pkg AND chat_key = :chatKey)")
    suspend fun isExcluded(pkg: String, chatKey: String): Boolean

    @Query("SELECT EXISTS(SELECT 1 FROM capture_exclusion WHERE package_name = :pkg AND chat_key = :chatKey)")
    fun observeExcluded(pkg: String, chatKey: String): Flow<Boolean>
}

@Dao
interface ConversationDao {
    @Query("SELECT * FROM conversation WHERE workspace_id = :ws AND package_name = :pkg AND chat_key = :chatKey AND deleted_at IS NULL")
    suspend fun find(ws: String, pkg: String, chatKey: String): ConversationEntity?

    @Query("SELECT * FROM conversation WHERE id = :id AND deleted_at IS NULL")
    suspend fun byId(id: String): ConversationEntity?

    @Query("SELECT * FROM conversation WHERE id = :id AND deleted_at IS NULL")
    fun observeById(id: String): Flow<ConversationEntity?>

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insert(entity: ConversationEntity)

    @Query("UPDATE conversation SET title = :title, last_message_at = MAX(last_message_at, :lastAt), unread_count = unread_count + :unreadDelta, updated_at = :now WHERE id = :id")
    suspend fun touch(id: String, title: String, lastAt: Long, unreadDelta: Int, now: Long)

    @Query("UPDATE conversation SET auto_reply = :on WHERE id = :id AND (is_group = 0 OR :on = 0)")
    suspend fun setAutoReply(id: String, on: Boolean)

    /** Each auto-reply chat's newest incoming message (re-emits whenever messages change). */
    @Query(
        """SELECT m.conversation_id AS conversationId, m.id AS messageId, m.created_at AS createdAt
           FROM message m JOIN conversation c ON c.id = m.conversation_id
           WHERE c.auto_reply = 1 AND c.is_group = 0 AND c.deleted_at IS NULL AND m.direction = 'INCOMING' AND m.deleted_at IS NULL
           AND m.sent_at = (SELECT MAX(m2.sent_at) FROM message m2 WHERE m2.conversation_id = m.conversation_id AND m2.direction = 'INCOMING' AND m2.deleted_at IS NULL)""",
    )
    fun observeAutoReplyTriggers(): Flow<List<AutoReplyTrigger>>

    @Query("UPDATE conversation SET unread_count = 0 WHERE id = :id")
    suspend fun markRead(id: String)

    @Query(
        """
        SELECT c.id, c.source_kind, c.title, c.is_group, c.last_message_at, c.unread_count,
          (SELECT COUNT(*) FROM message m WHERE m.conversation_id = c.id) AS message_count,
          l.text AS last_text, l.placeholder_kind AS last_placeholder, l.sender_name AS last_sender, l.direction AS last_direction
        FROM conversation c
        LEFT JOIN message l ON l.id = (
          SELECT m2.id FROM message m2 WHERE m2.conversation_id = c.id ORDER BY m2.sent_at DESC, m2.id DESC LIMIT 1
        )
        WHERE c.workspace_id = :ws AND c.deleted_at IS NULL
          AND EXISTS (SELECT 1 FROM message m3 WHERE m3.conversation_id = c.id)
        ORDER BY c.last_message_at DESC
        """,
    )
    fun observeRows(ws: String): Flow<List<ConversationRow>>

    @Query("DELETE FROM conversation WHERE id = :id")
    suspend fun delete(id: String)

    @Query("DELETE FROM conversation WHERE id NOT IN (SELECT DISTINCT conversation_id FROM message)")
    suspend fun deleteEmpty(): Int

    @Query("UPDATE conversation SET last_message_at = COALESCE((SELECT MAX(sent_at) FROM message WHERE conversation_id = conversation.id), last_message_at)")
    suspend fun recomputeLastMessageAt()
}

@Dao
interface MessageDao {
    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insert(entity: MessageEntity)

    @Query("SELECT EXISTS(SELECT 1 FROM message WHERE conversation_id = :conversationId AND fingerprint IN (:fingerprints))")
    suspend fun anyFingerprint(conversationId: String, fingerprints: List<String>): Boolean

    /** Same sender and the same exact message timestamp: a re-post, an edit or a deletion of that message. */
    @Query("SELECT * FROM message WHERE conversation_id = :conversationId AND sender_key = :senderKey AND sent_at = :sentAt AND exact_time = 1 LIMIT 1")
    suspend fun findExact(conversationId: String, senderKey: String, sentAt: Long): MessageEntity?

    @Query("UPDATE message SET text = :text, placeholder_kind = :placeholder, placeholder_detail = :detail, fingerprint = :fingerprint, edited = :edited, edit_history = :history, updated_at = :now, perceived_at = NULL WHERE id = :id")
    suspend fun revise(id: String, text: String?, placeholder: String?, detail: String?, fingerprint: String, edited: Boolean, history: String?, now: Long)

    /** A message with no timestamp of its own, from the very same notification (key and post time) already stored. */
    @Query("SELECT * FROM message WHERE conversation_id = :conversationId AND sender_key = :senderKey AND notification_key = :key AND notification_posted_at = :postedAt AND exact_time = 0 LIMIT 1")
    suspend fun findSameNotification(conversationId: String, senderKey: String, key: String, postedAt: Long): MessageEntity?

    @Query("UPDATE message SET text = :text, placeholder_kind = :placeholder, placeholder_detail = :detail, fingerprint = :fingerprint, adapter_version = :adapterVersion, updated_at = :now, perceived_at = NULL WHERE id = :id")
    suspend fun reparse(id: String, text: String?, placeholder: String?, detail: String?, fingerprint: String, adapterVersion: Int, now: Long)

    @Query("SELECT * FROM message WHERE conversation_id = :conversationId ORDER BY sent_at, id")
    fun observeFor(conversationId: String): Flow<List<MessageEntity>>

    @Query("DELETE FROM message WHERE id = :id")
    suspend fun delete(id: String)

    @Query("DELETE FROM message WHERE source_package IN (:packages)")
    suspend fun deleteForPackages(packages: List<String>): Int

    @Query("DELETE FROM message WHERE source_package IN (:packages) AND sent_at < :before")
    suspend fun deleteForPackagesBefore(packages: List<String>, before: Long): Int

    @Query("SELECT COUNT(*) FROM message WHERE source_package IN (:packages)")
    suspend fun countForPackages(packages: List<String>): Int

    @Query("SELECT COUNT(*) FROM message")
    suspend fun count(): Int

    /** The notifications this chat's messages came from, newest first (for replying through one). */
    @Query("SELECT notification_key FROM message WHERE conversation_id = :conversationId GROUP BY notification_key ORDER BY MAX(notification_posted_at) DESC LIMIT 20")
    suspend fun notificationKeys(conversationId: String): List<String>

    @Query("SELECT notification_key FROM message WHERE conversation_id = :conversationId GROUP BY notification_key ORDER BY MAX(notification_posted_at) DESC LIMIT 20")
    fun observeNotificationKeys(conversationId: String): Flow<List<String>>

    @Query("SELECT conversation_id FROM message WHERE id = :id")
    suspend fun conversationOf(id: String): String?
}
