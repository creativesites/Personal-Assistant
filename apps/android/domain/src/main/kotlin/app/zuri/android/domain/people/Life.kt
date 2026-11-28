package app.zuri.android.domain.people

import app.zuri.android.domain.inbox.ConversationId
import app.zuri.android.domain.workspace.WorkspaceId
import kotlinx.coroutines.flow.Flow

enum class GoalStatus { ACTIVE, ACHIEVED, PAUSED }

data class GoalPerson(val conversationId: ConversationId, val name: String)

data class Goal(
    val id: String,
    val workspaceId: WorkspaceId,
    val title: String,
    val why: String?,
    val targetAtMillis: Long?,
    val progress: Int,
    val status: GoalStatus,
    val people: List<GoalPerson>,
    val updatedAtMillis: Long,
)

data class GoalEvent(val kind: String, val detail: String?, val atMillis: Long)

interface Goals {
    fun observe(workspaces: List<WorkspaceId>): Flow<List<Goal>>
    fun events(goalId: String): Flow<List<GoalEvent>>
    suspend fun create(workspace: WorkspaceId, title: String, why: String?, targetAtMillis: Long?): String
    suspend fun setProgress(goalId: String, progress: Int)
    suspend fun setStatus(goalId: String, status: GoalStatus)
    suspend fun link(goalId: String, person: ConversationId)
    suspend fun unlink(goalId: String, person: ConversationId)
    suspend fun delete(goalId: String)
}

data class Note(val id: String, val workspaceId: WorkspaceId, val title: String, val body: String, val pinned: Boolean, val updatedAtMillis: Long)

interface Notes {
    fun observe(workspaces: List<WorkspaceId>): Flow<List<Note>>
    suspend fun save(workspace: WorkspaceId, id: String?, title: String, body: String, pinned: Boolean): String
    suspend fun delete(id: String)
    suspend fun search(workspaces: List<WorkspaceId>, query: String, limit: Int = 5): List<Note>
}

enum class TimelineKind { GOAL_CREATED, GOAL_PROGRESS, GOAL_ACHIEVED, GOAL_OTHER, MISSION_DONE, PROMISE_KEPT, WARMER, COOLER }

data class TimelineEntry(val kind: TimelineKind, val title: String, val detail: String?, val atMillis: Long, val conversationId: ConversationId?)

/** What actually happened (reflection, M6): only real events, newest first. */
interface LifeTimeline {
    fun observe(workspaces: List<WorkspaceId>, sinceMillis: Long): Flow<List<TimelineEntry>>
}

/** One thing on the owner's trajectory: from their chats, their rhythm, or the device calendar. */
sealed interface Encounter {
    val atMillis: Long
    data class Event(override val atMillis: Long, val title: String, val person: String?, val hasTime: Boolean, val conversationId: ConversationId?) : Encounter
    data class PromiseDue(override val atMillis: Long, val title: String, val person: String?, val conversationId: ConversationId?) : Encounter
    data class CheckIn(override val atMillis: Long, val person: String, val conversationId: ConversationId) : Encounter
    data class Device(override val atMillis: Long, val title: String, val allDay: Boolean, val location: String?, val calendar: String?) : Encounter
}

interface Trajectory {
    fun observe(workspaces: List<WorkspaceId>, fromMillis: Long, toMillis: Long): Flow<List<Encounter>>
}

/** The phone's own calendar, read-only, only with the owner's permission (shown and explained first). */
interface DeviceCalendar {
    fun hasAccess(): Boolean
    suspend fun events(fromMillis: Long, toMillis: Long): List<Encounter.Device>
}
