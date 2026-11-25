package app.zuri.android.feature.sources

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.zuri.android.domain.capture.CaptureControls
import app.zuri.android.domain.capture.CaptureStatus
import app.zuri.android.domain.capture.CaptureStatusProvider
import app.zuri.android.domain.capture.SourceKind
import app.zuri.android.domain.capture.SourceSetting
import app.zuri.android.domain.capture.SourceSettingsRepository
import app.zuri.android.domain.inbox.InboxRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class SourceRow(val setting: SourceSetting, val installed: Boolean, val messageCount: Int)

data class SourcesState(
    val status: CaptureStatus = CaptureStatus.Off,
    val rows: List<SourceRow> = emptyList(),
    val batteryOptimised: Boolean = false,
)

@HiltViewModel
class SourcesViewModel @Inject constructor(
    private val settings: SourceSettingsRepository,
    private val capture: CaptureStatusProvider,
    private val controls: CaptureControls,
    private val inbox: InboxRepository,
) : ViewModel() {
    private val platform = MutableStateFlow(Platform())
    private data class Platform(val installed: Set<SourceKind> = emptySet(), val battery: Boolean = false, val counts: Map<SourceKind, Int> = emptyMap())

    val state: StateFlow<SourcesState> = combine(capture.status, settings.settings, platform) { status, list, p ->
        SourcesState(
            status = status,
            rows = list.map { SourceRow(it, it.kind in p.installed || it.enabled, p.counts[it.kind] ?: 0) }
                .sortedWith(compareByDescending<SourceRow> { it.setting.enabled }.thenByDescending { it.installed }),
            batteryOptimised = p.battery,
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), SourcesState())

    /** Re-reads platform facts; called whenever the screen resumes (e.g. back from Android settings). */
    fun refresh() {
        capture.refresh()
        viewModelScope.launch {
            platform.value = Platform(
                installed = controls.installedSources(),
                battery = controls.isBatteryOptimised(),
                counts = SourceKind.entries.associateWith { inbox.messageCount(it) },
            )
        }
    }

    /** Returns true when turning the source on needs the access disclosure next. */
    fun setEnabled(kind: SourceKind, enabled: Boolean): Boolean {
        viewModelScope.launch { settings.setEnabled(kind, enabled) }
        return enabled && !state.value.status.accessGranted
    }

    fun setStoreOnly(kind: SourceKind, storeOnly: Boolean) = viewModelScope.launch { settings.setStoreOnly(kind, storeOnly) }
    fun setRetention(kind: SourceKind, days: Int?) = viewModelScope.launch { settings.setRetention(kind, days) }
    fun setPaused(paused: Boolean) = viewModelScope.launch { settings.setPaused(paused) }
    fun deleteAll(kind: SourceKind) = viewModelScope.launch { inbox.deleteAllFrom(kind); refresh() }

    fun openAccessSettings() = controls.openAccessSettings()
    fun openAppInfo() = controls.openAppInfo()
    fun openBatterySettings() = controls.openBatterySettings()
    fun reconnect() = capture.requestRebind()

}
