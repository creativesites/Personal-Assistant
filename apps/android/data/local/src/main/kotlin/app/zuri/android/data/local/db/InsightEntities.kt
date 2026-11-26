package app.zuri.android.data.local.db

import androidx.room.ColumnInfo
import androidx.room.Dao
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

/**
 * The stored part of a chat's state (M4): the on-demand summary and its topic. Whose turn it is,
 * open questions and mood are worked out from the messages on every read, so they are never stale.
 * Deleted with its conversation.
 */
@Entity(
    tableName = "conversation_insight",
    foreignKeys = [ForeignKey(entity = ConversationEntity::class, parentColumns = ["id"], childColumns = ["conversation_id"], onDelete = ForeignKey.CASCADE)],
    indices = [Index("workspace_id")],
)
data class ConversationInsightEntity(
    @PrimaryKey @ColumnInfo(name = "conversation_id") val conversationId: String,
    @ColumnInfo(name = "workspace_id") val workspaceId: String,
    val topic: String?,
    val summary: String?,
    /** `sent_at` of the newest message the summary covers; newer messages make it out of date. */
    @ColumnInfo(name = "summary_upto") val summaryUpto: Long,
    @ColumnInfo(name = "summary_at") val summaryAt: Long,
    @ColumnInfo(name = "model_id") val modelId: String?,
)

/**
 * The learning loop for reply drafts (ARCHITECTURE.md §8.5): what the owner did with a draft.
 * Turned-down drafts are not offered again in the same chat. Deleted with its conversation.
 */
@Entity(
    tableName = "draft_feedback",
    foreignKeys = [ForeignKey(entity = ConversationEntity::class, parentColumns = ["id"], childColumns = ["conversation_id"], onDelete = ForeignKey.CASCADE)],
    indices = [Index(value = ["conversation_id", "at"]), Index("workspace_id")],
)
data class DraftFeedbackEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "conversation_id") val conversationId: String,
    @ColumnInfo(name = "workspace_id") val workspaceId: String,
    val draft: String,
    /** [app.zuri.android.domain.inbox.DraftAction] name. */
    val action: String,
    /** What was actually sent, when the owner edited the draft first. */
    @ColumnInfo(name = "final_text") val finalText: String?,
    val at: Long,
)

/** A one-to-one chat whose latest message is theirs: the owner's turn. */
data class WaitingRow(
    val id: String,
    @ColumnInfo(name = "workspace_id") val workspaceId: String,
    val title: String,
    @ColumnInfo(name = "last_text") val lastText: String?,
    @ColumnInfo(name = "last_placeholder") val lastPlaceholder: String?,
    @ColumnInfo(name = "last_at") val lastAt: Long,
)

data class DraftActionCount(val action: String, val n: Int)

@Dao
interface InsightDao {
    @Upsert
    suspend fun upsert(entity: ConversationInsightEntity)

    @Query("SELECT * FROM conversation_insight WHERE conversation_id = :conversationId")
    suspend fun byConversation(conversationId: String): ConversationInsightEntity?

    @Query("SELECT * FROM conversation_insight WHERE conversation_id = :conversationId")
    fun observe(conversationId: String): Flow<ConversationInsightEntity?>

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insertFeedback(entity: DraftFeedbackEntity)

    @Query("SELECT draft FROM draft_feedback WHERE conversation_id = :conversationId AND action = 'DISMISSED' AND at >= :since ORDER BY at DESC LIMIT :limit")
    suspend fun dismissedDrafts(conversationId: String, since: Long, limit: Int): List<String>

    @Query("SELECT action, COUNT(*) AS n FROM draft_feedback WHERE workspace_id IN (:workspaces) AND at >= :since GROUP BY action")
    suspend fun draftActionCounts(workspaces: List<String>, since: Long): List<DraftActionCount>

    /**
     * One-to-one chats in the given workspaces whose newest message (not a reaction or a deletion)
     * came from the other person since [since]: the owner hasn't answered yet. Newest first.
     */
    @Query(
        """SELECT c.id, c.workspace_id, c.title, m.text AS last_text, m.placeholder_kind AS last_placeholder, m.sent_at AS last_at
           FROM conversation c JOIN message m ON m.id = (
               SELECT id FROM message WHERE conversation_id = c.id AND deleted_at IS NULL
               AND (placeholder_kind IS NULL OR placeholder_kind NOT IN ('REACTION', 'DELETED'))
               ORDER BY sent_at DESC, id DESC LIMIT 1)
           WHERE c.workspace_id IN (:workspaces) AND c.is_group = 0 AND c.deleted_at IS NULL
           AND m.direction = 'INCOMING' AND m.sent_at >= :since
           ORDER BY m.sent_at DESC LIMIT :limit""",
    )
    fun observeWaiting(workspaces: List<String>, since: Long, limit: Int): Flow<List<WaitingRow>>
}
