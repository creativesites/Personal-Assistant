package app.zuri.android.feature.memory

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.zuri.android.domain.ai.AiTier
import app.zuri.android.domain.memory.MemoryFilter
import app.zuri.android.domain.memory.MemoryId
import app.zuri.android.domain.memory.MemoryItem
import app.zuri.android.domain.memory.MemoryKind
import app.zuri.android.domain.memory.MemoryRepository
import app.zuri.android.domain.memory.MemoryStatus
import app.zuri.android.domain.memory.PerceptionControls
import app.zuri.android.domain.memory.PerceptionStatus
import app.zuri.android.domain.settings.AppPreferencesRepository
import app.zuri.android.domain.workspace.WorkspaceRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/** The Memory screen's tabs. */
enum class MemoryTab(val kinds: Set<MemoryKind>, val statuses: Set<MemoryStatus>) {
    PROMISES(setOf(MemoryKind.MY_PROMISE, MemoryKind.REQUEST_TO_ME), setOf(MemoryStatus.OPEN)),
    OWED(setOf(MemoryKind.THEIR_PROMISE), setOf(MemoryStatus.OPEN)),
    EVENTS(setOf(MemoryKind.EVENT), setOf(MemoryStatus.OPEN)),
    PEOPLE(setOf(MemoryKind.FACT), setOf(MemoryStatus.OPEN)),
    DONE(MemoryKind.entries.toSet(), setOf(MemoryStatus.DONE, MemoryStatus.DISMISSED)),
}

data class MemoryState(
    val loading: Boolean = true,
    val tab: MemoryTab = MemoryTab.PROMISES,
    val items: List<MemoryItem> = emptyList(),
    val status: PerceptionStatus = PerceptionStatus(AiTier.ESSENTIAL, 0, null, false, false),
)

@HiltViewModel
class MemoryViewModel @Inject constructor(
    preferences: AppPreferencesRepository,
    workspaces: WorkspaceRepository,
    private val memory: MemoryRepository,
    private val controls: PerceptionControls,
) : ViewModel() {
    private val tab = MutableStateFlow(MemoryTab.PROMISES)
    private val active = combine(preferences.preferences, workspaces.observeAll()) { p, all ->
        all.firstOrNull { it.id == p.activeWorkspaceId } ?: all.firstOrNull()
    }

    @OptIn(ExperimentalCoroutinesApi::class)
    val state: StateFlow<MemoryState> = combine(active, tab) { ws, t -> ws to t }.flatMapLatest { (ws, t) ->
        if (ws == null) flowOf(MemoryState(loading = false, tab = t))
        else combine(memory.observe(ws.id, MemoryFilter(t.kinds, t.statuses)), controls.observeStatus(ws.id)) { items, status ->
            MemoryState(loading = false, tab = t, items = items, status = status)
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), MemoryState())

    fun select(t: MemoryTab) { tab.value = t }
    fun runNow() = controls.runNow()
    fun setOnlyWhileCharging(on: Boolean) = viewModelScope.launch { controls.setOnlyWhileCharging(on) }
    fun confirm(id: MemoryId) = viewModelScope.launch { memory.confirm(id) }
    fun done(id: MemoryId) = viewModelScope.launch { memory.setStatus(id, MemoryStatus.DONE) }
    fun reopen(id: MemoryId) = viewModelScope.launch { memory.setStatus(id, MemoryStatus.OPEN) }
    fun reject(id: MemoryId) = viewModelScope.launch { memory.reject(id) }
    fun delete(id: MemoryId) = viewModelScope.launch { memory.delete(id) }
    fun edit(id: MemoryId, text: String, dueAtMillis: Long?) = viewModelScope.launch { memory.edit(id, text, dueAtMillis) }
}
