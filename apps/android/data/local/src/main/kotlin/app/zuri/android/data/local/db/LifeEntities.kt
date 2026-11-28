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

/** A goal the owner sets (M6): personal or business, optionally tied to people. */
@Entity(tableName = "goal", indices = [Index("workspace_id")])
data class GoalEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "workspace_id") val workspaceId: String,
    val title: String,
    val why: String?,
    @ColumnInfo(name = "target_at") val targetAt: Long?,
    /** 0–100, set by the owner. */
    val progress: Int,
    /** ACTIVE, ACHIEVED, PAUSED. */
    val status: String,
    @ColumnInfo(name = "created_at") val createdAt: Long,
    @ColumnInfo(name = "updated_at") val updatedAt: Long,
)

@Entity(
    tableName = "goal_person",
    primaryKeys = ["goal_id", "conversation_id"],
    foreignKeys = [
        ForeignKey(entity = GoalEntity::class, parentColumns = ["id"], childColumns = ["goal_id"], onDelete = ForeignKey.CASCADE),
        ForeignKey(entity = ConversationEntity::class, parentColumns = ["id"], childColumns = ["conversation_id"], onDelete = ForeignKey.CASCADE),
    ],
    indices = [Index("conversation_id")],
)
data class GoalPersonEntity(
    @ColumnInfo(name = "goal_id") val goalId: String,
    @ColumnInfo(name = "conversation_id") val conversationId: String,
)

/** What happened to a goal, append-only: CREATED, PROGRESS (detail = new %), ACHIEVED, PAUSED, RESUMED, NOTE. */
@Entity(tableName = "goal_event", indices = [Index("goal_id"), Index("at")],
    foreignKeys = [ForeignKey(entity = GoalEntity::class, parentColumns = ["id"], childColumns = ["goal_id"], onDelete = ForeignKey.CASCADE)])
data class GoalEventEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "goal_id") val goalId: String,
    val kind: String,
    val detail: String?,
    val at: Long,
)

/** The owner's own notes (Knowledge). Stay on the phone. */
@Entity(tableName = "note", indices = [Index("workspace_id"), Index("updated_at")])
data class NoteEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "workspace_id") val workspaceId: String,
    val title: String,
    val body: String,
    @ColumnInfo(name = "pinned", defaultValue = "0") val pinned: Boolean = false,
    @ColumnInfo(name = "created_at") val createdAt: Long,
    @ColumnInfo(name = "updated_at") val updatedAt: Long,
)

/** Relationship health history, one row per change (append-only, like relationship_health_logs). */
@Entity(tableName = "health_log", indices = [Index(value = ["conversation_id", "at"]), Index("at")],
    foreignKeys = [ForeignKey(entity = ConversationEntity::class, parentColumns = ["id"], childColumns = ["conversation_id"], onDelete = ForeignKey.CASCADE)])
data class HealthLogEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    @ColumnInfo(name = "conversation_id") val conversationId: String,
    val score: Int,
    @ColumnInfo(name = "previous_score") val previousScore: Int?,
    val at: Long,
)

data class GoalRow(
    val id: String,
    @ColumnInfo(name = "workspace_id") val workspaceId: String,
    val title: String,
    val why: String?,
    @ColumnInfo(name = "target_at") val targetAt: Long?,
    val progress: Int,
    val status: String,
    @ColumnInfo(name = "updated_at") val updatedAt: Long,
    /** Comma-separated conversation ids:titles of linked people. */
    val people: String?,
)

data class TimelineRow(val kind: String, val title: String, val detail: String?, val at: Long, @ColumnInfo(name = "conversation_id") val conversationId: String?)

@Dao
interface LifeDao {
    // goals
    @Upsert suspend fun upsertGoal(g: GoalEntity)
    @Query("SELECT * FROM goal WHERE id = :id") suspend fun goal(id: String): GoalEntity?
    @Query("DELETE FROM goal WHERE id = :id") suspend fun deleteGoal(id: String)
    @Insert(onConflict = OnConflictStrategy.IGNORE) suspend fun link(p: GoalPersonEntity)
    @Query("DELETE FROM goal_person WHERE goal_id = :goalId AND conversation_id = :conversationId") suspend fun unlink(goalId: String, conversationId: String)
    @Insert suspend fun event(e: GoalEventEntity)

    @Query(
        """SELECT g.id, g.workspace_id, g.title, g.why, g.target_at, g.progress, g.status, g.updated_at,
             (SELECT GROUP_CONCAT(c.id || ':' || REPLACE(c.title, ',', ' '), ',') FROM goal_person gp JOIN conversation c ON c.id = gp.conversation_id WHERE gp.goal_id = g.id) AS people
           FROM goal g WHERE g.workspace_id IN (:ws) ORDER BY CASE g.status WHEN 'ACTIVE' THEN 0 WHEN 'PAUSED' THEN 1 ELSE 2 END, g.updated_at DESC""",
    )
    fun observeGoals(ws: List<String>): Flow<List<GoalRow>>

    @Query("SELECT * FROM goal_event WHERE goal_id = :goalId ORDER BY at DESC") fun observeGoalEvents(goalId: String): Flow<List<GoalEventEntity>>

    // notes
    @Upsert suspend fun upsertNote(n: NoteEntity)
    @Query("DELETE FROM note WHERE id = :id") suspend fun deleteNote(id: String)
    @Query("SELECT * FROM note WHERE id = :id") suspend fun note(id: String): NoteEntity?
    @Query("SELECT * FROM note WHERE workspace_id IN (:ws) ORDER BY pinned DESC, updated_at DESC") fun observeNotes(ws: List<String>): Flow<List<NoteEntity>>
    @Query("SELECT * FROM note WHERE workspace_id IN (:ws) AND (title LIKE '%' || :q || '%' OR body LIKE '%' || :q || '%') ORDER BY updated_at DESC LIMIT :limit")
    suspend fun searchNotes(ws: List<String>, q: String, limit: Int): List<NoteEntity>

    // health history
    @Insert suspend fun log(h: HealthLogEntity)

    /**
     * The life timeline (reflection, M6): what actually happened, newest first. Only real events:
     * goals created/achieved/moved, missions completed, promises kept, and relationship health moving
     * by 10 points or more. Never padded.
     */
    @Query(
        """SELECT * FROM (
             SELECT ge.kind AS kind, g.title AS title, ge.detail AS detail, ge.at AS at, NULL AS conversation_id
               FROM goal_event ge JOIN goal g ON g.id = ge.goal_id WHERE g.workspace_id IN (:ws) AND ge.at >= :since
             UNION ALL
             SELECT 'MISSION_' || mi.status AS kind, mi.title AS title, mi.resolved_reason AS detail, mi.resolved_at AS at, mi.conversation_id
               FROM mission mi WHERE mi.workspace_id IN (:ws) AND mi.status IN ('DONE','AUTO_RESOLVED') AND mi.resolved_at >= :since
             UNION ALL
             SELECT 'PROMISE_KEPT' AS kind, m.text AS title, m.person_name AS detail, m.updated_at AS at, m.conversation_id
               FROM memory_item m WHERE m.workspace_id IN (:ws) AND m.kind = 'MY_PROMISE' AND m.status = 'DONE' AND m.updated_at >= :since
             UNION ALL
             SELECT CASE WHEN h.score > h.previous_score THEN 'WARMER' ELSE 'COOLER' END AS kind, c.title AS title,
                    h.previous_score || ' → ' || h.score AS detail, h.at AS at, h.conversation_id
               FROM health_log h JOIN conversation c ON c.id = h.conversation_id
               WHERE c.workspace_id IN (:ws) AND h.at >= :since AND h.previous_score IS NOT NULL AND ABS(h.score - h.previous_score) >= 10
           ) ORDER BY at DESC LIMIT 300""",
    )
    fun observeTimeline(ws: List<String>, since: Long): Flow<List<TimelineRow>>

    // calendar inputs
    @Query(
        """SELECT * FROM memory_item WHERE workspace_id IN (:ws) AND status = 'OPEN' AND review != 'REJECTED'
           AND due_at IS NOT NULL AND due_at BETWEEN :from AND :to ORDER BY due_at""",
    )
    fun observeDue(ws: List<String>, from: Long, to: Long): Flow<List<MemoryEntity>>

    @Query(
        """SELECT r.conversation_id, c.workspace_id, c.title, r.score, r.trend, r.tier, r.last_interaction_at, r.avg_days, r.next_check_at, r.reason, r.message_count
           FROM relationship r JOIN conversation c ON c.id = r.conversation_id
           WHERE c.workspace_id IN (:ws) AND r.next_check_at BETWEEN :from AND :to AND r.message_count >= 6 ORDER BY r.next_check_at""",
    )
    fun observeCheckIns(ws: List<String>, from: Long, to: Long): Flow<List<RelationshipRow>>

    // morning brief counts
    @Query("SELECT COUNT(*) FROM mission WHERE status = 'OPEN'") suspend fun openMissions(): Int
    @Query("SELECT COUNT(*) FROM memory_item WHERE status = 'OPEN' AND review != 'REJECTED' AND due_at BETWEEN :from AND :to") suspend fun dueBetween(from: Long, to: Long): Int
}
