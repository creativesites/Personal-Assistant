package app.zuri.android.feature.life

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.zuri.android.domain.context.ActiveContextProvider
import app.zuri.android.domain.people.Encounter
import app.zuri.android.domain.people.Goal
import app.zuri.android.domain.people.GoalEvent
import app.zuri.android.domain.people.GoalStatus
import app.zuri.android.domain.people.Goals
import app.zuri.android.domain.people.LifeTimeline
import app.zuri.android.domain.people.Note
import app.zuri.android.domain.people.Notes
import app.zuri.android.domain.people.Relationship
import app.zuri.android.domain.people.Relationships
import app.zuri.android.domain.people.TimelineEntry
import app.zuri.android.domain.people.Trajectory
import app.zuri.android.domain.inbox.ConversationId
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

private const val DAY = 86_400_000L

@HiltViewModel
class TrajectoryViewModel @Inject constructor(context: ActiveContextProvider, trajectory: Trajectory) : ViewModel() {
    private val refreshTick = MutableStateFlow(0)

    @OptIn(ExperimentalCoroutinesApi::class)
    val encounters: StateFlow<List<Encounter>?> = combine(context.active, refreshTick) { ctx, _ -> ctx }.flatMapLatest { ctx ->
        if (ctx == null) flowOf(emptyList())
        else {
            val start = java.time.LocalDate.now().atStartOfDay(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli()
            trajectory.observe(ctx.ids.toList(), start, start + 14 * DAY)
        }
    }.map<List<Encounter>, List<Encounter>?> { it }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    /** After the owner grants calendar access, re-read so device events appear. */
    fun reload() { refreshTick.value++ }
}

@HiltViewModel
class GoalsViewModel @Inject constructor(context: ActiveContextProvider, private val goals: Goals, relationships: Relationships) : ViewModel() {
    private val active = context.active

    @OptIn(ExperimentalCoroutinesApi::class)
    val list: StateFlow<List<Goal>?> = active.flatMapLatest { ctx -> if (ctx == null) flowOf(emptyList()) else goals.observe(ctx.ids.toList()) }
        .map<List<Goal>, List<Goal>?> { it }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    @OptIn(ExperimentalCoroutinesApi::class)
    val people: StateFlow<List<Relationship>> = active.flatMapLatest { ctx -> if (ctx == null) flowOf(emptyList()) else relationships.observe(ctx.ids.toList()) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    fun events(goalId: String): Flow<List<GoalEvent>> = goals.events(goalId)

    fun create(title: String, why: String?, targetAt: Long?) = viewModelScope.launch {
        val ctx = active.first() ?: return@launch
        goals.create(ctx.primary.id, title, why, targetAt)
    }
    fun setProgress(id: String, p: Int) = viewModelScope.launch { goals.setProgress(id, p) }
    fun setStatus(id: String, s: GoalStatus) = viewModelScope.launch { goals.setStatus(id, s) }
    fun link(id: String, person: ConversationId, on: Boolean) = viewModelScope.launch { if (on) goals.link(id, person) else goals.unlink(id, person) }
    fun delete(id: String) = viewModelScope.launch { goals.delete(id) }
}

@HiltViewModel
class TimelineViewModel @Inject constructor(context: ActiveContextProvider, timeline: LifeTimeline) : ViewModel() {
    @OptIn(ExperimentalCoroutinesApi::class)
    val entries: StateFlow<List<TimelineEntry>?> = context.active.flatMapLatest { ctx ->
        if (ctx == null) flowOf(emptyList()) else timeline.observe(ctx.ids.toList(), System.currentTimeMillis() - 180 * DAY)
    }.map<List<TimelineEntry>, List<TimelineEntry>?> { it }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)
}

@HiltViewModel
class NotesViewModel @Inject constructor(context: ActiveContextProvider, private val notes: Notes) : ViewModel() {
    private val active = context.active

    @OptIn(ExperimentalCoroutinesApi::class)
    val list: StateFlow<List<Note>?> = active.flatMapLatest { ctx -> if (ctx == null) flowOf(emptyList()) else notes.observe(ctx.ids.toList()) }
        .map<List<Note>, List<Note>?> { it }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    fun save(id: String?, title: String, body: String, pinned: Boolean) = viewModelScope.launch {
        if (title.isBlank() && body.isBlank()) return@launch
        val ctx = active.first() ?: return@launch
        notes.save(ctx.primary.id, id, title, body, pinned)
    }
    fun delete(id: String) = viewModelScope.launch { notes.delete(id) }
}

@Suppress("unused") private val unused = emptyFlow<Unit>()
