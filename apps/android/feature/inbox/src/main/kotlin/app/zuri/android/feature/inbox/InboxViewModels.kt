package app.zuri.android.feature.inbox

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.zuri.android.domain.capture.CaptureStatus
import app.zuri.android.domain.capture.CaptureStatusProvider
import app.zuri.android.domain.capture.SourceKind
import app.zuri.android.domain.inbox.ConversationDetail
import app.zuri.android.domain.inbox.ConversationId
import app.zuri.android.domain.inbox.ConversationSummary
import app.zuri.android.domain.inbox.InboxRepository
import app.zuri.android.domain.inbox.MessageId
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
)

@HiltViewModel
class ConversationViewModel @Inject constructor(
    savedState: SavedStateHandle,
    private val inbox: InboxRepository,
    private val replies: ReplySender,
) : ViewModel() {
    private val id = ConversationId(checkNotNull(savedState.get<String>("id")) { "conversation id missing" })
    private val sendState = MutableStateFlow<Pair<Boolean, ReplyResult?>>(false to null)

    val state: StateFlow<ConversationState> = combine(inbox.observeConversation(id), replies.observeCanReply(id), sendState) { detail, can, (sending, result) ->
        ConversationState(loading = false, detail = detail, canReply = can, sending = sending, lastResult = result)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), ConversationState())

    /** Sends only on the owner's tap; returns true when the text should be cleared. */
    fun reply(text: String, onSent: () -> Unit) = viewModelScope.launch {
        sendState.value = true to null
        val result = replies.reply(id, text)
        sendState.value = false to result
        if (result == ReplyResult.Sent) onSent()
    }

    fun markRead() = viewModelScope.launch { inbox.markRead(id) }
    fun deleteMessage(message: MessageId) = viewModelScope.launch { inbox.deleteMessage(message) }
    fun deleteConversation() = viewModelScope.launch { inbox.deleteConversation(id) }
    fun exclude() = viewModelScope.launch { inbox.excludeConversation(id) }
}
