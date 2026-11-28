package app.zuri.android.data.local.life

import androidx.room.withTransaction
import app.zuri.android.core.common.Clock
import app.zuri.android.core.common.UuidV7
import app.zuri.android.data.local.db.GoalEntity
import app.zuri.android.data.local.db.GoalEventEntity
import app.zuri.android.data.local.db.GoalPersonEntity
import app.zuri.android.data.local.db.NoteEntity
import app.zuri.android.data.local.db.ZuriDatabase
import app.zuri.android.domain.inbox.ConversationId
import app.zuri.android.domain.people.DeviceCalendar
import app.zuri.android.domain.people.Encounter
import app.zuri.android.domain.people.Goal
import app.zuri.android.domain.people.GoalEvent
import app.zuri.android.domain.people.GoalPerson
import app.zuri.android.domain.people.GoalStatus
import app.zuri.android.domain.people.Goals
import app.zuri.android.domain.people.LifeTimeline
import app.zuri.android.domain.people.Note
import app.zuri.android.domain.people.Notes
import app.zuri.android.domain.people.TimelineEntry
import app.zuri.android.domain.people.TimelineKind
import app.zuri.android.domain.people.Trajectory
import app.zuri.android.domain.workspace.WorkspaceId
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map

/** Goals (M6): set by the owner, optionally tied to people, with an append-only history. */
class RoomGoals(private val db: ZuriDatabase, private val clock: Clock) : Goals {
    private val dao = db.lifeDao()

    override fun observe(workspaces: List<WorkspaceId>): Flow<List<Goal>> = dao.observeGoals(workspaces.map { it.value }).map { rows ->
        rows.map { r ->
            Goal(
                r.id, WorkspaceId(r.workspaceId), r.title, r.why, r.targetAt, r.progress,
                runCatching { GoalStatus.valueOf(r.status) }.getOrDefault(GoalStatus.ACTIVE),
                r.people.orEmpty().split(',').filter { it.contains(':') }.map { GoalPerson(ConversationId(it.substringBefore(':')), it.substringAfter(':')) },
                r.updatedAt,
            )
        }
    }

    override fun events(goalId: String): Flow<List<GoalEvent>> = dao.observeGoalEvents(goalId).map { l -> l.map { GoalEvent(it.kind, it.detail, it.at) } }

    override suspend fun create(workspace: WorkspaceId, title: String, why: String?, targetAtMillis: Long?): String = db.withTransaction {
        val now = clock.nowMillis()
        val id = UuidV7.generate(clock)
        dao.upsertGoal(GoalEntity(id, workspace.value, title.trim(), why?.trim()?.ifBlank { null }, targetAtMillis, 0, GoalStatus.ACTIVE.name, now, now))
        dao.event(GoalEventEntity(UuidV7.generate(clock), id, "CREATED", null, now))
        id
    }

    override suspend fun setProgress(goalId: String, progress: Int) = change(goalId) { g, now ->
        val p = progress.coerceIn(0, 100)
        if (p == g.progress) return@change
        val achieved = p == 100 && g.status != GoalStatus.ACHIEVED.name
        dao.upsertGoal(g.copy(progress = p, status = if (achieved) GoalStatus.ACHIEVED.name else g.status, updatedAt = now))
        dao.event(GoalEventEntity(UuidV7.generate(clock), goalId, "PROGRESS", "$p%", now))
        if (achieved) dao.event(GoalEventEntity(UuidV7.generate(clock), goalId, "ACHIEVED", null, now))
    }

    override suspend fun setStatus(goalId: String, status: GoalStatus) = change(goalId) { g, now ->
        if (g.status == status.name) return@change
        dao.upsertGoal(g.copy(status = status.name, progress = if (status == GoalStatus.ACHIEVED) 100 else g.progress, updatedAt = now))
        val kind = when (status) { GoalStatus.ACHIEVED -> "ACHIEVED"; GoalStatus.PAUSED -> "PAUSED"; GoalStatus.ACTIVE -> "RESUMED" }
        dao.event(GoalEventEntity(UuidV7.generate(clock), goalId, kind, null, now))
    }

    override suspend fun link(goalId: String, person: ConversationId) = dao.link(GoalPersonEntity(goalId, person.value))
    override suspend fun unlink(goalId: String, person: ConversationId) = dao.unlink(goalId, person.value)
    override suspend fun delete(goalId: String) = dao.deleteGoal(goalId)

    private suspend fun change(goalId: String, block: suspend (GoalEntity, Long) -> Unit) {
        db.withTransaction { dao.goal(goalId)?.let { block(it, clock.nowMillis()) } }
    }
}

/** The owner's notes (Knowledge). Never leave the phone. */
class RoomNotes(private val db: ZuriDatabase, private val clock: Clock) : Notes {
    private val dao = db.lifeDao()

    override fun observe(workspaces: List<WorkspaceId>): Flow<List<Note>> = dao.observeNotes(workspaces.map { it.value }).map { l -> l.map { it.toNote() } }

    override suspend fun save(workspace: WorkspaceId, id: String?, title: String, body: String, pinned: Boolean): String {
        val now = clock.nowMillis()
        val existing = id?.let { dao.note(it) }
        val noteId = id ?: UuidV7.generate(clock)
        val t = title.trim().ifBlank { body.trim().lineSequence().firstOrNull()?.take(60)?.ifBlank { null } ?: "Note" }
        dao.upsertNote(NoteEntity(noteId, existing?.workspaceId ?: workspace.value, t, body, pinned, existing?.createdAt ?: now, now))
        return noteId
    }

    override suspend fun delete(id: String) = dao.deleteNote(id)

    override suspend fun search(workspaces: List<WorkspaceId>, query: String, limit: Int): List<Note> =
        dao.searchNotes(workspaces.map { it.value }, query.trim(), limit).map { it.toNote() }

    private fun NoteEntity.toNote() = Note(id, WorkspaceId(workspaceId), title, body, pinned, updatedAt)
}

/** The life timeline: only what actually happened. */
class RoomTimeline(private val db: ZuriDatabase) : LifeTimeline {
    override fun observe(workspaces: List<WorkspaceId>, sinceMillis: Long): Flow<List<TimelineEntry>> =
        db.lifeDao().observeTimeline(workspaces.map { it.value }, sinceMillis).map { rows ->
            rows.map { r ->
                val kind = when (r.kind) {
                    "CREATED" -> TimelineKind.GOAL_CREATED; "PROGRESS" -> TimelineKind.GOAL_PROGRESS; "ACHIEVED" -> TimelineKind.GOAL_ACHIEVED
                    "MISSION_DONE", "MISSION_AUTO_RESOLVED" -> TimelineKind.MISSION_DONE; "PROMISE_KEPT" -> TimelineKind.PROMISE_KEPT
                    "WARMER" -> TimelineKind.WARMER; "COOLER" -> TimelineKind.COOLER; else -> TimelineKind.GOAL_OTHER
                }
                TimelineEntry(kind, r.title, r.detail, r.at, r.conversationId?.let(::ConversationId))
            }
        }
}

/** The owner's trajectory: events and promises from their chats, check-ins from their rhythm, and the device calendar. */
class RoomTrajectory(private val db: ZuriDatabase, private val device: DeviceCalendar?) : Trajectory {
    override fun observe(workspaces: List<WorkspaceId>, fromMillis: Long, toMillis: Long): Flow<List<Encounter>> {
        val ws = workspaces.map { it.value }
        val dao = db.lifeDao()
        val deviceEvents = flow { emit(if (device?.hasAccess() == true) runCatching { device.events(fromMillis, toMillis) }.getOrDefault(emptyList()) else emptyList()) }
        return combine(dao.observeDue(ws, fromMillis, toMillis), dao.observeCheckIns(ws, fromMillis, toMillis), deviceEvents) { due, checks, dev ->
            val fromChats = due.map { m ->
                if (m.kind == "EVENT") Encounter.Event(m.dueAt!!, m.text, m.personName, m.dueHasTime, ConversationId(m.conversationId))
                else Encounter.PromiseDue(m.dueAt!!, m.text, m.personName, ConversationId(m.conversationId))
            }
            (fromChats + checks.map { Encounter.CheckIn(it.nextCheckAt!!, it.title, ConversationId(it.conversationId)) } + dev).sortedBy { it.atMillis }
        }
    }
}
