package app.zuri.android.feature.today

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.zuri.android.core.common.Clock
import app.zuri.android.domain.capture.CaptureHealth
import app.zuri.android.domain.capture.CaptureStatusProvider
import app.zuri.android.domain.settings.AppPreferencesRepository
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
)

@HiltViewModel
class TodayViewModel @Inject constructor(
    preferences: AppPreferencesRepository,
    workspaces: WorkspaceRepository,
    capture: CaptureStatusProvider,
    private val clock: Clock,
) : ViewModel() {
    val state: StateFlow<TodayState> = combine(preferences.preferences, workspaces.observeAll(), capture.status) { prefs, all, status ->
        val ws = all.firstOrNull { it.id == prefs.activeWorkspaceId } ?: all.firstOrNull()
        snapshot(ws?.name.orEmpty()).copy(capture = status.state, capturedToday = status.capturedToday)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), snapshot(""))

    private fun snapshot(workspace: String): TodayState {
        val now = Instant.ofEpochMilli(clock.nowMillis()).atZone(ZoneId.systemDefault())
        val part = when (now.hour) { in 5..11 -> DayPart.Morning; in 12..16 -> DayPart.Afternoon; else -> DayPart.Evening }
        return TodayState(part, now.format(DateTimeFormatter.ofPattern("EEEE, d MMMM", Locale.getDefault())), workspace)
    }
}
