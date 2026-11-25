package app.zuri.android.feature.ask

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.zuri.android.domain.memory.AskAnswer
import app.zuri.android.domain.memory.AskZuri
import app.zuri.android.domain.settings.AppPreferencesRepository
import app.zuri.android.domain.workspace.WorkspaceRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class AskState(
    val question: String = "",
    val asked: String? = null,
    val thinking: Boolean = false,
    val answer: AskAnswer? = null,
)

@HiltViewModel
class AskViewModel @Inject constructor(
    private val preferences: AppPreferencesRepository,
    private val workspaces: WorkspaceRepository,
    private val ask: AskZuri,
) : ViewModel() {
    private val _state = MutableStateFlow(AskState())
    val state: StateFlow<AskState> = _state.asStateFlow()
    private var job: Job? = null

    fun edit(q: String) = _state.update { it.copy(question = q) }

    fun submit(q: String = _state.value.question) {
        val question = q.trim()
        if (question.isEmpty()) return
        job?.cancel()
        _state.update { AskState(question = question, asked = question, thinking = true) }
        job = viewModelScope.launch {
            val ws = combine(preferences.preferences, workspaces.observeAll()) { p, all -> all.firstOrNull { it.id == p.activeWorkspaceId } ?: all.firstOrNull() }.first()
                ?: return@launch _state.update { it.copy(thinking = false, answer = AskAnswer.NotFound(emptyList())) }
            val answer = ask.ask(ws.id, question)
            _state.update { if (it.asked == question) it.copy(thinking = false, answer = answer) else it }
        }
    }
}
