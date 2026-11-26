package app.zuri.android.feature.ask

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.zuri.android.domain.context.ActiveContext
import app.zuri.android.domain.context.ActiveContextProvider
import app.zuri.android.domain.context.ContextLedger
import app.zuri.android.domain.context.Purpose
import app.zuri.android.domain.memory.AskAnswer
import app.zuri.android.domain.memory.AskZuri
import app.zuri.android.domain.workspace.WorkspaceKind
import app.zuri.android.domain.workspace.WorkspaceRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class AskState(
    val question: String = "",
    val asked: String? = null,
    val thinking: Boolean = false,
    val answer: AskAnswer? = null,
    /** Names of the workspaces this answer may draw on. */
    val scopeLabel: String = "",
    /** The question is about a business workspace; Personal can be added for this question only. */
    val canWiden: Boolean = false,
    /** The owner added Personal for this question (shown as a banner, and logged). */
    val widened: Boolean = false,
)

/**
 * Ask Zuri reads only the active context (§8.2). In a business workspace, "Also look in Personal"
 * widens one question at the owner's tap; that, and every Hybrid question, is logged in the
 * context ledger.
 */
@HiltViewModel
class AskViewModel @Inject constructor(
    private val context: ActiveContextProvider,
    private val workspaces: WorkspaceRepository,
    private val ask: AskZuri,
    private val ledger: ContextLedger,
) : ViewModel() {
    private val _state = MutableStateFlow(AskState())
    val state: StateFlow<AskState> = _state.asStateFlow()
    private var job: Job? = null

    val scopeLabel: StateFlow<String> = context.active.map { it?.label.orEmpty() }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), "")

    fun edit(q: String) = _state.update { it.copy(question = q) }

    fun submit(q: String = _state.value.question) = run(q, widen = false)

    /** Asks the same question again with Personal added. Only ever on the owner's tap. */
    fun widenToPersonal() { _state.value.asked?.let { run(it, widen = true) } }

    private fun run(q: String, widen: Boolean) {
        val question = q.trim()
        if (question.isEmpty()) return
        job?.cancel()
        _state.update { AskState(question = question, asked = question, thinking = true) }
        job = viewModelScope.launch {
            val ctx: ActiveContext = context.active.first()
                ?: return@launch _state.update { it.copy(thinking = false, answer = AskAnswer.NotFound(emptyList())) }
            var scope = ctx.scope(Purpose.ASK)
            var label = ctx.label
            val business = !ctx.hybrid && ctx.primary.kind == WorkspaceKind.BUSINESS
            if (widen && business) {
                val personal = workspaces.observeAll().first().first { it.kind == WorkspaceKind.PERSONAL }
                scope = scope.widenedTo(setOf(personal.id))
                label = ctx.label + " + " + personal.name
                ledger.record(Purpose.ASK, listOf(ctx.primary.name), listOf(personal.name))
            } else if (ctx.hybrid) {
                ledger.record(Purpose.ASK, listOf(ctx.members.first().name), ctx.members.drop(1).map { it.name })
            }
            val answer = ask.ask(scope, question)
            _state.update {
                if (it.asked == question) it.copy(thinking = false, answer = answer, scopeLabel = label, canWiden = business && !widen, widened = widen && business) else it
            }
        }
    }
}
