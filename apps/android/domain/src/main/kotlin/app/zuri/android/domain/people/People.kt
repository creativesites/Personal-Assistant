package app.zuri.android.domain.people

import app.zuri.android.domain.inbox.ConversationId
import app.zuri.android.domain.workspace.WorkspaceId
import kotlinx.coroutines.flow.Flow

enum class HealthTrend { IMPROVING, STABLE, DECLINING }

/**
 * One person the owner talks to one-to-one, and how that relationship is doing (M6). The score and
 * the learned rhythm are ports of the server's health.py and cadence_learner.py.
 */
data class Relationship(
    val conversationId: ConversationId,
    val workspaceId: WorkspaceId,
    val name: String,
    /** 0–100; healthier relationships orbit closer. */
    val score: Int,
    val trend: HealthTrend,
    /** 1 = closest circle … 5 = wider; drives planet size and the reconnect interval. */
    val tier: Int,
    val lastInteractionAt: Long?,
    /** Their usual gap between messages, in days (null until there is enough history). */
    val usualGapDays: Double?,
    /** When Zuri will suggest getting in touch, from the learned rhythm. */
    val nextCheckAt: Long?,
    /** Why the score is what it is, in plain words (the 1–2 factors that moved it most). */
    val reason: String,
    val messageCount: Int,
)

interface Relationships {
    fun observe(workspaces: List<WorkspaceId>): Flow<List<Relationship>>
    suspend fun setTier(id: ConversationId, tier: Int)
    /** Recomputes every relationship now (also runs hourly and before the morning brief). */
    suspend fun refresh()
}

enum class MissionKind { RECONNECT, PROMISE_OVERDUE }

enum class MissionStatus { OPEN, DONE, DISMISSED, AUTO_RESOLVED }

/** A nudge the owner can act on (spec "Missions"). Nothing is ever sent from a mission. */
data class Mission(
    val id: String,
    val conversationId: ConversationId,
    val workspaceId: WorkspaceId,
    val person: String,
    val kind: MissionKind,
    val title: String,
    val body: String,
    val createdAt: Long,
)

data class MissionTally(val done: Int, val total: Int)

interface Missions {
    fun observeOpen(workspaces: List<WorkspaceId>): Flow<List<Mission>>
    /** Missions finished today (done or resolved by the owner's own reply) against all of today's. */
    fun observeToday(workspaces: List<WorkspaceId>): Flow<MissionTally>
    suspend fun done(id: String)
    suspend fun dismiss(id: String)
}
