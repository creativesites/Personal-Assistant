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

/** How a one-to-one relationship is doing (M6): ports of health.py and cadence_learner.py. */
@androidx.room.Entity(
    tableName = "relationship",
    foreignKeys = [androidx.room.ForeignKey(entity = ConversationEntity::class, parentColumns = ["id"], childColumns = ["conversation_id"], onDelete = androidx.room.ForeignKey.CASCADE)],
)
data class RelationshipEntity(
    @androidx.room.PrimaryKey @androidx.room.ColumnInfo(name = "conversation_id") val conversationId: String,
    @androidx.room.ColumnInfo(name = "workspace_id") val workspaceId: String,
    val score: Int,
    @androidx.room.ColumnInfo(name = "previous_score") val previousScore: Int?,
    val trend: String,
    val tier: Int = 3,
    /** True once the owner set the tier themselves; recomputes never change it then. */
    @androidx.room.ColumnInfo(name = "tier_set", defaultValue = "0") val tierSet: Boolean = false,
    @androidx.room.ColumnInfo(name = "last_interaction_at") val lastInteractionAt: Long?,
    @androidx.room.ColumnInfo(name = "avg_days") val avgDays: Double?,
    @androidx.room.ColumnInfo(name = "std_days") val stdDays: Double?,
    @androidx.room.ColumnInfo(name = "next_check_at") val nextCheckAt: Long?,
    val reason: String,
    /** JSON: signals and notes behind the score. */
    val factors: String,
    @androidx.room.ColumnInfo(name = "message_count") val messageCount: Int,
    @androidx.room.ColumnInfo(name = "updated_at") val updatedAt: Long,
)

/** A mission: a nudge with a lifecycle (OPEN → DONE / DISMISSED / AUTO_RESOLVED). */
@androidx.room.Entity(
    tableName = "mission",
    indices = [androidx.room.Index(value = ["dedupe_key"], unique = true), androidx.room.Index("status")],
    foreignKeys = [androidx.room.ForeignKey(entity = ConversationEntity::class, parentColumns = ["id"], childColumns = ["conversation_id"], onDelete = androidx.room.ForeignKey.CASCADE)],
)
data class MissionEntity(
    @androidx.room.PrimaryKey val id: String,
    @androidx.room.ColumnInfo(name = "conversation_id") val conversationId: String,
    @androidx.room.ColumnInfo(name = "workspace_id") val workspaceId: String,
    val kind: String,
    val title: String,
    val body: String,
    /** One open mission per thing: e.g. "RECONNECT:<conv>:<check day>" or "PROMISE:<memory id>". */
    @androidx.room.ColumnInfo(name = "dedupe_key") val dedupeKey: String,
    /** The memory a promise mission is about. */
    @androidx.room.ColumnInfo(name = "memory_id") val memoryId: String? = null,
    val status: String,
    @androidx.room.ColumnInfo(name = "created_at") val createdAt: Long,
    @androidx.room.ColumnInfo(name = "resolved_at") val resolvedAt: Long? = null,
    @androidx.room.ColumnInfo(name = "resolved_reason") val resolvedReason: String? = null,
)

data class RelationshipRow(
    @androidx.room.ColumnInfo(name = "conversation_id") val conversationId: String,
    @androidx.room.ColumnInfo(name = "workspace_id") val workspaceId: String,
    val title: String,
    val score: Int,
    val trend: String,
    val tier: Int,
    @androidx.room.ColumnInfo(name = "last_interaction_at") val lastInteractionAt: Long?,
    @androidx.room.ColumnInfo(name = "avg_days") val avgDays: Double?,
    @androidx.room.ColumnInfo(name = "next_check_at") val nextCheckAt: Long?,
    val reason: String,
    @androidx.room.ColumnInfo(name = "message_count") val messageCount: Int,
)

data class MissionRow(
    val id: String,
    @androidx.room.ColumnInfo(name = "conversation_id") val conversationId: String,
    @androidx.room.ColumnInfo(name = "workspace_id") val workspaceId: String,
    val person: String,
    val kind: String,
    val title: String,
    val body: String,
    @androidx.room.ColumnInfo(name = "created_at") val createdAt: Long,
)

data class PersonConv(
    val id: String,
    @androidx.room.ColumnInfo(name = "workspace_id") val workspaceId: String,
    val title: String,
)

data class TimedMessage(
    @androidx.room.ColumnInfo(name = "sent_at") val sentAt: Long,
    val direction: String,
    val text: String?,
)

@androidx.room.Dao
interface RelateDao {
    @androidx.room.Query("SELECT c.id, c.workspace_id, c.title FROM conversation c WHERE c.is_group = 0 AND c.deleted_at IS NULL AND EXISTS (SELECT 1 FROM message m WHERE m.conversation_id = c.id)")
    suspend fun people(): List<PersonConv>

    @androidx.room.Query("SELECT sent_at FROM message WHERE conversation_id = :conversationId AND deleted_at IS NULL ORDER BY sent_at")
    suspend fun times(conversationId: String): List<Long>

    @androidx.room.Query("SELECT sent_at, direction, text FROM message WHERE conversation_id = :conversationId AND deleted_at IS NULL AND sent_at > :since ORDER BY sent_at")
    suspend fun recent(conversationId: String, since: Long): List<TimedMessage>

    @androidx.room.Query("SELECT * FROM relationship WHERE conversation_id = :conversationId")
    suspend fun get(conversationId: String): RelationshipEntity?

    @androidx.room.Upsert suspend fun upsert(r: RelationshipEntity)

    @androidx.room.Query("UPDATE relationship SET tier = :tier, tier_set = 1 WHERE conversation_id = :conversationId")
    suspend fun setTier(conversationId: String, tier: Int)

    @androidx.room.Query(
        """SELECT r.conversation_id, c.workspace_id, c.title, r.score, r.trend, r.tier, r.last_interaction_at, r.avg_days, r.next_check_at, r.reason, r.message_count
           FROM relationship r JOIN conversation c ON c.id = r.conversation_id
           WHERE c.workspace_id IN (:ws) AND c.deleted_at IS NULL ORDER BY r.score DESC""",
    )
    fun observe(ws: List<String>): kotlinx.coroutines.flow.Flow<List<RelationshipRow>>

    /** Recomputing counts as an owner action for "recent proactive" (health.py's +2 bonus). */
    @androidx.room.Query("SELECT COUNT(*) FROM mission WHERE conversation_id = :conversationId AND status IN ('DONE','AUTO_RESOLVED') AND resolved_at > :since")
    suspend fun recentMissionsDone(conversationId: String, since: Long): Int

    // ── missions ────────────────────────────────────────────────────────────
    @androidx.room.Insert(onConflict = androidx.room.OnConflictStrategy.IGNORE)
    suspend fun insertMission(m: MissionEntity): Long

    @androidx.room.Query(
        """SELECT mi.id, mi.conversation_id, mi.workspace_id, c.title AS person, mi.kind, mi.title, mi.body, mi.created_at
           FROM mission mi JOIN conversation c ON c.id = mi.conversation_id
           WHERE mi.status = 'OPEN' AND mi.workspace_id IN (:ws) ORDER BY mi.created_at""",
    )
    fun observeOpen(ws: List<String>): kotlinx.coroutines.flow.Flow<List<MissionRow>>

    @androidx.room.Query("SELECT COUNT(*) FROM mission WHERE workspace_id IN (:ws) AND created_at >= :since AND status IN ('DONE','AUTO_RESOLVED')")
    fun observeDoneSince(ws: List<String>, since: Long): kotlinx.coroutines.flow.Flow<Int>

    @androidx.room.Query("SELECT COUNT(*) FROM mission WHERE workspace_id IN (:ws) AND (created_at >= :since OR status = 'OPEN')")
    fun observeTotalSince(ws: List<String>, since: Long): kotlinx.coroutines.flow.Flow<Int>

    @androidx.room.Query("UPDATE mission SET status = :status, resolved_at = :now, resolved_reason = :reason WHERE id = :id AND status = 'OPEN'")
    suspend fun resolve(id: String, status: String, now: Long, reason: String?)

    /** Reality Engine L1: an open nudge for a person is resolved once the owner has written to them since. */
    @androidx.room.Query(
        """UPDATE mission SET status = 'AUTO_RESOLVED', resolved_at = :now, resolved_reason = 'You messaged them'
           WHERE status = 'OPEN' AND EXISTS (
             SELECT 1 FROM message m WHERE m.conversation_id = mission.conversation_id AND m.direction = 'OUTGOING' AND m.sent_at > mission.created_at)""",
    )
    suspend fun resolveReplied(now: Long): Int

    /** A promise mission closes when the promise is marked done or the memory is gone. */
    @androidx.room.Query(
        """UPDATE mission SET status = 'AUTO_RESOLVED', resolved_at = :now, resolved_reason = 'Promise kept'
           WHERE status = 'OPEN' AND kind = 'PROMISE_OVERDUE'
             AND NOT EXISTS (SELECT 1 FROM memory_item mm WHERE mm.id = mission.memory_id AND mm.status = 'OPEN')""",
    )
    suspend fun resolvePromisesKept(now: Long): Int

    @androidx.room.Query("SELECT EXISTS(SELECT 1 FROM mission WHERE conversation_id = :conversationId AND status = 'OPEN')")
    suspend fun hasOpen(conversationId: String): Boolean

    /** The owner's own promises past their due date, still open and not rejected. */
    @androidx.room.Query(
        """SELECT * FROM memory_item WHERE kind = 'MY_PROMISE' AND status = 'OPEN' AND review != 'REJECTED'
           AND due_at IS NOT NULL AND due_at < :now ORDER BY due_at""",
    )
    suspend fun overduePromises(now: Long): List<MemoryEntity>

    @androidx.room.Query("SELECT kind FROM workspace WHERE id = :id")
    suspend fun workspaceKind(id: String): String?
}
