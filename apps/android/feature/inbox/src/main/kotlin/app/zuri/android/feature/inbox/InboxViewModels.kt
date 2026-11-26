package app.zuri.android.feature.inbox

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.zuri.android.domain.capture.CaptureStatus
import app.zuri.android.domain.capture.CaptureStatusProvider
import app.zuri.android.domain.capture.SourceKind
import app.zuri.android.domain.inbox.AutoReplies
import app.zuri.android.domain.inbox.ConversationDetail
import app.zuri.android.domain.inbox.ConversationId
import app.zuri.android.domain.inbox.ConversationSummary
import app.zuri.android.domain.inbox.DraftAction
import app.zuri.android.domain.inbox.DraftFeedback
import app.zuri.android.domain.inbox.DraftResult
import app.zuri.android.domain.inbox.ConversationInsight
import app.zuri.android.domain.inbox.ConversationInsights
import app.zuri.android.domain.inbox.SummaryResult
import app.zuri.android.domain.inbox.InboxRepository
import app.zuri.android.domain.inbox.MessageId
import app.zuri.android.domain.inbox.ReplyDrafter
import app.zuri.android.domain.inbox.ReplyResult
import app.zuri.android.domain.inbox.ReplySender
import app.zuri.android.domain.settings.AppPreferencesRepository
import app.zuri.android.domain.workspace.Workspace
import app.zuri.android.domain.workspace.WorkspaceKind
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
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class InboxState(
    val loading: Boolean = true,
    val workspaceKind: WorkspaceKind = WorkspaceKind.PERSONAL,
    val conversations: List<ConversationSummary> = emptyList(),
    val filter: SourceKind? = null,
    val status: CaptureStatus = CaptureStatus.Off,
) {
    val sources: List<SourceKind> get() = conversations.map { it.source }.distinct().sortedBy { it.ordinal }
    val visible: List<ConversationSummary> get() = conversations.filter { filter == null || it.source == filter }
}

@HiltViewModel
class InboxViewModel @Inject constructor(
    preferences: AppPreferencesRepository,
    workspaces: WorkspaceRepository,
    inbox: InboxRepository,
    private val capture: CaptureStatusProvider,
) : ViewModel() {
    private val filter = MutableStateFlow<SourceKind?>(null)

    @OptIn(ExperimentalCoroutinesApi::class)
    private val active = combine(preferences.preferences, workspaces.observeAll()) { p, all ->
        all.firstOrNull { it.id == p.activeWorkspaceId } ?: all.firstOrNull()
    }

    @OptIn(ExperimentalCoroutinesApi::class)
    private val conversations = active.flatMapLatest { ws: Workspace? ->
        if (ws == null) flowOf(null to emptyList()) else inbox.observeConversations(ws.id).map { ws to it }
    }

    val state: StateFlow<InboxState> = combine(conversations, filter, capture.status) { (ws, list), f, status ->
        InboxState(
            loading = false,
            workspaceKind = ws?.kind ?: WorkspaceKind.PERSONAL,
            conversations = list,
            filter = f?.takeIf { k -> list.any { it.source == k } },
            status = status,
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), InboxState())

    fun setFilter(kind: SourceKind?) { filter.value = kind }
    fun refresh() = capture.refresh()
}

data class ConversationState(
    val loading: Boolean = true,
    val detail: ConversationDetail? = null,
    /** A live notification's reply button exists for this chat. */
    val canReply: Boolean = false,
    val sending: Boolean = false,
    val lastResult: ReplyResult? = null,
    val drafts: DraftsState = DraftsState.Idle,
)

sealed interface DraftsState {
    data object Idle : DraftsState
    data object Drafting : DraftsState
    data class Ready(val drafts: List<String>, val byModel: Boolean) : DraftsState
    data object NothingToAnswer : DraftsState
    data object Failed : DraftsState
}

sealed interface SummaryState {
    data object Idle : SummaryState
    data object Working : SummaryState
    data object NoModel : SummaryState
    data object Nothing : SummaryState
    data object Failed : SummaryState
}

data class InsightState(val insight: ConversationInsight = ConversationInsight(), val summary: SummaryState = SummaryState.Idle)

@HiltViewModel
class ConversationViewModel @Inject constructor(
    savedState: SavedStateHandle,
    private val inbox: InboxRepository,
    private val replies: ReplySender,
    private val drafter: ReplyDrafter,
    private val autoReplies: AutoReplies,
    private val insights: ConversationInsights,
    private val feedback: DraftFeedback,
) : ViewModel() {
    private val id = ConversationId(checkNotNull(savedState.get<String>("id")) { "conversation id missing" })
    private val sendState = MutableStateFlow<Pair<Boolean, ReplyResult?>>(false to null)
    private val draftState = MutableStateFlow<DraftsState>(DraftsState.Idle)
    private var drafting: kotlinx.coroutines.Job? = null
    /** The draft the owner put in the reply box, to learn whether it was sent as is or edited. */
    private var picked: String? = null
    private val summarizing = MutableStateFlow<SummaryState>(SummaryState.Idle)
    private var summaryJob: kotlinx.coroutines.Job? = null

    val insight: StateFlow<InsightState> = combine(insights.observe(id), summarizing) { i, s -> InsightState(i, s) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), InsightState())

    fun summarize() {
        if (summaryJob?.isActive == true) return
        summaryJob = viewModelScope.launch {
            summarizing.value = SummaryState.Working
            summarizing.value = when (val r = insights.summarize(id)) {
                SummaryResult.Done -> SummaryState.Idle
                SummaryResult.NoModel -> SummaryState.NoModel
                SummaryResult.NothingToSummarize -> SummaryState.Nothing
                is SummaryResult.Failed -> SummaryState.Failed
            }
        }
    }

    fun picked(draft: String) { picked = draft }

    fun copied(draft: String) = viewModelScope.launch { feedback.record(id, draft, DraftAction.COPIED) }

    val state: StateFlow<ConversationState> = combine(inbox.observeConversation(id), replies.observeCanReply(id), sendState, draftState) { detail, can, (sending, result), drafts ->
        ConversationState(loading = false, detail = detail, canReply = can, sending = sending, lastResult = result, drafts = drafts)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), ConversationState())

    /** Sends only on the owner's tap; returns true when the text should be cleared. */
    fun reply(text: String, onSent: () -> Unit) = viewModelScope.launch {
        sendState.value = true to null
        val result = replies.reply(id, text)
        sendState.value = false to result
        if (result == ReplyResult.Sent) {
            picked?.let { d -> feedback.record(id, d, if (d.trim() == text.trim()) DraftAction.SENT_AS_IS else DraftAction.SENT_EDITED, text.takeIf { d.trim() != it.trim() }) }
            picked = null
            onSent(); draftState.value = DraftsState.Idle
        }
    }

    val autoReply: StateFlow<AutoReplyState> = combine(autoReplies.observeEnabled(id), autoReplies.settings, autoReplies.observeEvents(id)) { on, s, events ->
        AutoReplyState(on, s, events)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), AutoReplyState())

    fun setAutoReply(on: Boolean) = viewModelScope.launch { autoReplies.setEnabled(id, on) }
    fun pauseAutoReplies(paused: Boolean) = viewModelScope.launch { autoReplies.setPaused(paused) }
    fun setAutoReplyDelay(min: Int, max: Int) = viewModelScope.launch { autoReplies.setDelay(min, max) }

    /** Drafts are written only when the owner asks, while the chat is open. */
    fun suggest() {
        if (drafting?.isActive == true) return
        drafting = viewModelScope.launch {
            draftState.value = DraftsState.Drafting
            draftState.value = when (val r = drafter.draft(id)) {
                is DraftResult.Drafts -> DraftsState.Ready(r.drafts, r.byModel)
                DraftResult.NothingToAnswer -> DraftsState.NothingToAnswer
                is DraftResult.Failed, DraftResult.NoModel -> DraftsState.Failed
            }
        }
    }

    /** Closing the drafts without using one tells Zuri they weren't right (not offered again here for a while). */
    fun dismissDrafts() {
        drafting?.cancel()
        val shown = draftState.value as? DraftsState.Ready
        draftState.value = DraftsState.Idle
        if (shown != null && picked == null) viewModelScope.launch { shown.drafts.forEach { feedback.record(id, it, DraftAction.DISMISSED) } }
    }

    fun markRead() = viewModelScope.launch { inbox.markRead(id) }
    fun deleteMessage(message: MessageId) = viewModelScope.launch { inbox.deleteMessage(message) }
    fun deleteConversation() = viewModelScope.launch { inbox.deleteConversation(id) }
    fun exclude() = viewModelScope.launch { inbox.excludeConversation(id) }
}
