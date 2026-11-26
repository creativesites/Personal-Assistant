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
)

@HiltViewModel
class TodayViewModel @Inject constructor(
    context: app.zuri.android.domain.context.ActiveContextProvider,
    capture: CaptureStatusProvider,
    memory: MemoryRepository,
    insights: ConversationInsights,
    private val clock: Clock,
) : ViewModel() {
    private val active = context.active

    @OptIn(ExperimentalCoroutinesApi::class)
    private val items = active.flatMapLatest { ws ->
        if (ws == null) flowOf(emptyList())
        else memory.observe(ws.ids, MemoryFilter(kinds = setOf(MemoryKind.MY_PROMISE, MemoryKind.REQUEST_TO_ME, MemoryKind.EVENT)))
    }

    @OptIn(ExperimentalCoroutinesApi::class)
    private val waiting = active.flatMapLatest { ws -> if (ws == null) flowOf(emptyList()) else insights.observeWaiting(ws.ids) }

    val state: StateFlow<TodayState> = combine(active, capture.status, items, waiting) { ws, status, list, waitingChats ->
        val now = clock.nowMillis()
        val week = now + 7L * 24 * 60 * 60 * 1000
        snapshot(ws?.label.orEmpty()).copy(
            capture = status.state, capturedToday = status.capturedToday,
            promises = list.filter { it.kind != MemoryKind.EVENT }.take(5),
            // An event with no time is kept through the end of its day.
            waiting = waitingChats.take(5),
            upcoming = list.filter { it.kind == MemoryKind.EVENT && it.dueAtMillis != null && it.dueAtMillis!! in (now - 24L * 60 * 60 * 1000)..week }.take(5),
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), snapshot(""))

    private fun snapshot(workspace: String): TodayState {
        val now = Instant.ofEpochMilli(clock.nowMillis()).atZone(ZoneId.systemDefault())
        val part = when (now.hour) { in 5..11 -> DayPart.Morning; in 12..16 -> DayPart.Afternoon; else -> DayPart.Evening }
        return TodayState(part, now.format(DateTimeFormatter.ofPattern("EEEE, d MMMM", Locale.getDefault())), workspace)
    }
}
