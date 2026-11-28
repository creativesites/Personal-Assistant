package app.zuri.android.feature.today

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.zuri.android.core.common.Clock
import app.zuri.android.domain.capture.CaptureHealth
import app.zuri.android.domain.capture.CaptureStatusProvider
import app.zuri.android.domain.inbox.ConversationInsights
import app.zuri.android.domain.inbox.WaitingChat
import app.zuri.android.domain.memory.MemoryFilter
import app.zuri.android.domain.memory.MemoryItem
import app.zuri.android.domain.memory.MemoryKind
import app.zuri.android.domain.memory.MemoryRepository
import app.zuri.android.domain.settings.AppPreferencesRepository
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import app.zuri.android.domain.workspace.WorkspaceRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import javax.inject.Inject
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

enum class DayPart { Morning, Afternoon, Evening }

data class TodayState(
    val dayPart: DayPart,
    val dateLabel: String,
    val workspaceName: String,
    val capture: CaptureHealth = CaptureHealth.OFF,
    val capturedToday: Int = 0,
    /** Open promises and requests, soonest due first (M4). */
    val promises: List<MemoryItem> = emptyList(),
    /** Events in the next seven days. */
    val upcoming: List<MemoryItem> = emptyList(),
    /** One-to-one chats where they wrote last, newest first. */
    val waiting: List<WaitingChat> = emptyList(),
    /** Open missions (M6), oldest first, and today's progress. */
    val missions: List<app.zuri.android.domain.people.Mission> = emptyList(),
    val tally: app.zuri.android.domain.people.MissionTally = app.zuri.android.domain.people.MissionTally(0, 0),
)

@HiltViewModel
class TodayViewModel @Inject constructor(
    context: app.zuri.android.domain.context.ActiveContextProvider,
    capture: CaptureStatusProvider,
    memory: MemoryRepository,
    insights: ConversationInsights,
    private val clock: Clock,
    private val missionStore: app.zuri.android.domain.people.Missions,
    private val relationships: app.zuri.android.domain.people.Relationships,
) : ViewModel() {
    fun refreshMissions() = viewModelScope.launch { runCatching { relationships.refresh() } }
    fun done(m: app.zuri.android.domain.people.Mission) = viewModelScope.launch { missionStore.done(m.id) }
    fun skip(m: app.zuri.android.domain.people.Mission) = viewModelScope.launch { missionStore.dismiss(m.id) }

    @OptIn(ExperimentalCoroutinesApi::class)
    private val missionFlow = context.active.flatMapLatest { ws ->
        if (ws == null) flowOf(emptyList<app.zuri.android.domain.people.Mission>() to app.zuri.android.domain.people.MissionTally(0, 0))
        else combine(missionStore.observeOpen(ws.ids.toList()), missionStore.observeToday(ws.ids.toList())) { a, b -> a to b }
    }
    private val active = context.active

    @OptIn(ExperimentalCoroutinesApi::class)
    private val items = active.flatMapLatest { ws ->
        if (ws == null) flowOf(emptyList())
        else memory.observe(ws.ids, MemoryFilter(kinds = setOf(MemoryKind.MY_PROMISE, MemoryKind.REQUEST_TO_ME, MemoryKind.EVENT)))
    }

    @OptIn(ExperimentalCoroutinesApi::class)
    private val waiting = active.flatMapLatest { ws -> if (ws == null) flowOf(emptyList()) else insights.observeWaiting(ws.ids) }

    val state: StateFlow<TodayState> = combine(combine(active, capture.status, items, waiting) { a, b, c, d -> listOf(a, b, c, d) }, missionFlow) { parts, mf ->
        @Suppress("UNCHECKED_CAST") val ws = parts[0] as app.zuri.android.domain.context.ActiveContext?
        val status = parts[1] as app.zuri.android.domain.capture.CaptureStatus
        @Suppress("UNCHECKED_CAST") val list = parts[2] as List<MemoryItem>
        @Suppress("UNCHECKED_CAST") val waitingChats = parts[3] as List<WaitingChat>
        val now = clock.nowMillis()
        val week = now + 7L * 24 * 60 * 60 * 1000
        snapshot(ws?.label.orEmpty()).copy(
            capture = status.state, capturedToday = status.capturedToday,
            promises = list.filter { it.kind != MemoryKind.EVENT }.take(5),
            // An event with no time is kept through the end of its day.
            waiting = waitingChats.take(5),
            upcoming = list.filter { it.kind == MemoryKind.EVENT && it.dueAtMillis != null && it.dueAtMillis!! in (now - 24L * 60 * 60 * 1000)..week }.take(5),
            missions = mf.first, tally = mf.second,
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), snapshot(""))

    private fun snapshot(workspace: String): TodayState {
        val now = Instant.ofEpochMilli(clock.nowMillis()).atZone(ZoneId.systemDefault())
        val part = when (now.hour) { in 5..11 -> DayPart.Morning; in 12..16 -> DayPart.Afternoon; else -> DayPart.Evening }
        return TodayState(part, now.format(DateTimeFormatter.ofPattern("EEEE, d MMMM", Locale.getDefault())), workspace)
    }
}
