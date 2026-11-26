package app.zuri.android.data.local.db

import androidx.room.ColumnInfo
import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface MemoryDao {
    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insert(entity: MemoryEntity)

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insertFeedback(entity: MemoryFeedbackEntity)

    @Query("SELECT * FROM memory_item WHERE id = :id")
    suspend fun byId(id: String): MemoryEntity?

    @Query(
        """SELECT * FROM memory_item WHERE workspace_id = :ws AND review != 'REJECTED'
           AND kind IN (:kinds) AND status IN (:statuses)
           ORDER BY CASE WHEN due_at IS NULL THEN 1 ELSE 0 END, due_at, source_sent_at DESC""",
    )
    fun observe(ws: String, kinds: List<String>, statuses: List<String>): Flow<List<MemoryEntity>>

    @Query(
        """SELECT * FROM memory_item WHERE workspace_id = :ws AND conversation_id = :conversationId AND review != 'REJECTED'
           AND kind IN (:kinds) AND status IN (:statuses)
           ORDER BY CASE WHEN due_at IS NULL THEN 1 ELSE 0 END, due_at, source_sent_at DESC""",
    )
    fun observeIn(ws: String, conversationId: String, kinds: List<String>, statuses: List<String>): Flow<List<MemoryEntity>>

    /** For Ask Zuri: visible items, optionally in some conversations, newest first. */
    @Query(
        """SELECT * FROM memory_item WHERE workspace_id = :ws AND review != 'REJECTED' AND status != 'DISMISSED'
           AND kind IN (:kinds) ORDER BY source_sent_at DESC LIMIT :limit""",
    )
    suspend fun recent(ws: String, kinds: List<String>, limit: Int): List<MemoryEntity>

    @Query(
        """SELECT * FROM memory_item WHERE workspace_id = :ws AND conversation_id IN (:conversationIds) AND review != 'REJECTED'
           AND status != 'DISMISSED' AND kind IN (:kinds) ORDER BY source_sent_at DESC LIMIT :limit""",
    )
    suspend fun recentIn(ws: String, conversationIds: List<String>, kinds: List<String>, limit: Int): List<MemoryEntity>

    @Query("SELECT EXISTS(SELECT 1 FROM memory_item WHERE source_message_id = :messageId AND kind = :kind)")
    suspend fun exists(messageId: String, kind: String): Boolean

    /** Before a changed message is read again, unreviewed items from it are dropped; confirmed ones stay. */
    @Query("DELETE FROM memory_item WHERE source_message_id IN (:messageIds) AND review = 'SUGGESTED'")
    suspend fun deleteSuggestedFrom(messageIds: List<String>): Int

    /** Items whose message text is gone (the sender deleted it) must not keep quoting it. */
    @Query("DELETE FROM memory_item WHERE source_message_id IN (SELECT id FROM message WHERE text IS NULL)")
    suspend fun deleteWhereSourceTextGone(): Int

    @Query("UPDATE memory_item SET review = :review, updated_at = :now WHERE id = :id")
    suspend fun setReview(id: String, review: String, now: Long)

    @Query("UPDATE memory_item SET status = :status, updated_at = :now WHERE id = :id")
    suspend fun setStatus(id: String, status: String, now: Long)

    @Query("UPDATE memory_item SET text = :text, due_at = :dueAt, due_has_time = :hasTime, review = 'CONFIRMED', updated_at = :now WHERE id = :id")
    suspend fun edit(id: String, text: String, dueAt: Long?, hasTime: Boolean, now: Long)

    @Query("DELETE FROM memory_item WHERE id = :id")
    suspend fun delete(id: String)

    /** Texts the owner rejected in a chat: the learning loop doesn't suggest them again. */
    @Query("SELECT text FROM memory_item WHERE conversation_id = :conversationId AND kind = :kind AND review = 'REJECTED'")
    suspend fun rejectedTexts(conversationId: String, kind: String): List<String>

    @Query("SELECT COUNT(*) FROM memory_item WHERE workspace_id = :ws AND review != 'REJECTED' AND status = 'OPEN'")
    fun observeOpenCount(ws: String): Flow<Int>
}

/** A stored message with its conversation, as perception and retrieval read it. */
data class MessageWithConversation(
    val id: String,
    @ColumnInfo(name = "conversation_id") val conversationId: String,
    @ColumnInfo(name = "workspace_id") val workspaceId: String,
    val direction: String,
    @ColumnInfo(name = "sender_name") val senderName: String?,
    val text: String?,
    @ColumnInfo(name = "placeholder_kind") val placeholderKind: String?,
    @ColumnInfo(name = "sent_at") val sentAt: Long,
    val title: String,
    @ColumnInfo(name = "is_group") val isGroup: Boolean,
)

@Dao
interface PerceptionDao {
    @Query(
        """SELECT COUNT(*) FROM message m JOIN conversation c ON c.id = m.conversation_id
           WHERE c.workspace_id = :ws AND c.analyse = 1 AND m.perceived_at IS NULL AND m.text IS NOT NULL AND m.sent_at >= :since""",
    )
    fun observeWaiting(ws: String, since: Long): Flow<Int>

    /** Conversations with unread-by-perception messages, the most recently active first. */
    @Query(
        """SELECT m.conversation_id FROM message m JOIN conversation c ON c.id = m.conversation_id
           WHERE c.analyse = 1 AND m.perceived_at IS NULL AND m.text IS NOT NULL AND m.sent_at >= :since
           GROUP BY m.conversation_id ORDER BY MAX(m.sent_at) DESC LIMIT :limit""",
    )
    suspend fun conversationsWaiting(since: Long, limit: Int): List<String>

    @Query(
        """SELECT m.id, m.conversation_id, m.workspace_id, m.direction, m.sender_name, m.text, m.placeholder_kind, m.sent_at, c.title, c.is_group
           FROM message m JOIN conversation c ON c.id = m.conversation_id
           WHERE m.conversation_id = :conversationId AND m.perceived_at IS NULL AND m.text IS NOT NULL AND m.sent_at >= :since
           ORDER BY m.sent_at, m.id LIMIT :limit""",
    )
    suspend fun waitingIn(conversationId: String, since: Long, limit: Int): List<MessageWithConversation>

    /** The messages just before [beforeSentAt], oldest first: context for reading a batch. */
    @Query(
        """SELECT * FROM (SELECT m.id, m.conversation_id, m.workspace_id, m.direction, m.sender_name, m.text, m.placeholder_kind, m.sent_at, c.title, c.is_group
           FROM message m JOIN conversation c ON c.id = m.conversation_id
           WHERE m.conversation_id = :conversationId AND m.sent_at < :beforeSentAt ORDER BY m.sent_at DESC, m.id DESC LIMIT :limit)
           ORDER BY sent_at, id""",
    )
    suspend fun before(conversationId: String, beforeSentAt: Long, limit: Int): List<MessageWithConversation>

    @Query("UPDATE message SET perceived_at = :at WHERE id IN (:ids)")
    suspend fun markPerceived(ids: List<String>, at: Long)

    /** Full-text search over message text (FTS4 MATCH syntax), newest first. */
    @Query(
        """SELECT m.id, m.conversation_id, m.workspace_id, m.direction, m.sender_name, m.text, m.placeholder_kind, m.sent_at, c.title, c.is_group
           FROM message_fts JOIN message m ON m.rowid = message_fts.rowid JOIN conversation c ON c.id = m.conversation_id
           WHERE message_fts MATCH :query AND c.workspace_id = :ws ORDER BY m.sent_at DESC LIMIT :limit""",
    )
    suspend fun search(ws: String, query: String, limit: Int): List<MessageWithConversation>

    @Query(
        """SELECT m.id, m.conversation_id, m.workspace_id, m.direction, m.sender_name, m.text, m.placeholder_kind, m.sent_at, c.title, c.is_group
           FROM message_fts JOIN message m ON m.rowid = message_fts.rowid JOIN conversation c ON c.id = m.conversation_id
           WHERE message_fts MATCH :query AND c.workspace_id = :ws AND m.conversation_id IN (:conversationIds) ORDER BY m.sent_at DESC LIMIT :limit""",
    )
    suspend fun searchIn(ws: String, conversationIds: List<String>, query: String, limit: Int): List<MessageWithConversation>

    @Query(
        """SELECT m.id, m.conversation_id, m.workspace_id, m.direction, m.sender_name, m.text, m.placeholder_kind, m.sent_at, c.title, c.is_group
           FROM message m JOIN conversation c ON c.id = m.conversation_id
           WHERE m.conversation_id IN (:conversationIds) AND m.text IS NOT NULL ORDER BY m.sent_at DESC LIMIT :limit""",
    )
    suspend fun latestIn(conversationIds: List<String>, limit: Int): List<MessageWithConversation>

    /** A chat's latest messages (placeholders included), oldest first: what a reply answers. */
    @Query(
        """SELECT * FROM (SELECT m.id, m.conversation_id, m.workspace_id, m.direction, m.sender_name, m.text, m.placeholder_kind, m.sent_at, c.title, c.is_group
           FROM message m JOIN conversation c ON c.id = m.conversation_id
           WHERE m.conversation_id = :conversationId AND m.deleted_at IS NULL ORDER BY m.sent_at DESC, m.id DESC LIMIT :limit)
           ORDER BY sent_at, id""",
    )
    suspend fun tail(conversationId: String, limit: Int): List<MessageWithConversation>

    /** The owner's own recent text messages in a workspace, newest first: how they write (voice profile). */
    @Query(
        """SELECT m.id, m.conversation_id, m.workspace_id, m.direction, m.sender_name, m.text, m.placeholder_kind, m.sent_at, c.title, c.is_group
           FROM message m JOIN conversation c ON c.id = m.conversation_id
           WHERE c.workspace_id = :ws AND m.direction = 'OUTGOING' AND m.text IS NOT NULL AND m.deleted_at IS NULL AND c.deleted_at IS NULL
           ORDER BY m.sent_at DESC LIMIT :limit""",
    )
    suspend fun ownerMessages(ws: String, limit: Int): List<MessageWithConversation>

    @Query("SELECT id, title FROM conversation WHERE workspace_id = :ws AND deleted_at IS NULL")
    suspend fun conversationTitles(ws: String): List<ConversationTitle>

    @Query(
        """SELECT m.id, m.conversation_id, m.workspace_id, m.direction, m.sender_name, m.text, m.placeholder_kind, m.sent_at, c.title, c.is_group
           FROM message m JOIN conversation c ON c.id = m.conversation_id WHERE m.id IN (:ids)""",
    )
    suspend fun messages(ids: List<String>): List<MessageWithConversation>
}

data class ConversationTitle(val id: String, val title: String)
