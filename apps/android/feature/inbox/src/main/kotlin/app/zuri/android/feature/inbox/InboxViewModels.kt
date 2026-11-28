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
import androidx.compose.ui.graphics.asImageBitmap

data class InboxState(
    val loading: Boolean = true,
    val workspaceKind: WorkspaceKind = WorkspaceKind.PERSONAL,
    val conversations: List<ConversationSummary> = emptyList(),
    val filter: SourceKind? = null,
    val status: CaptureStatus = CaptureStatus.Off,
    /** In Hybrid view, each chat's workspace name; empty otherwise. */
    val workspaceNames: Map<app.zuri.android.domain.workspace.WorkspaceId, String> = emptyMap(),
    val view: InboxView = InboxView.ALL,
    val query: String = "",
) {
    val sources: List<SourceKind> get() = conversations.map { it.source }.distinct().sortedBy { it.ordinal }
    val visible: List<ConversationSummary> get() = conversations.filter { c ->
        (filter == null || c.source == filter) &&
            when (view) {
                InboxView.ALL -> true
                InboxView.UNREAD -> c.unreadCount > 0
                // One-to-one chats where they wrote last: the ball is in the owner's court.
                InboxView.WAITING -> !c.isGroup && !c.lastFromMe
                InboxView.GROUPS -> c.isGroup
            } &&
            (query.isBlank() || c.title.contains(query.trim(), ignoreCase = true) || c.lastText?.contains(query.trim(), ignoreCase = true) == true)
    }
}

enum class InboxView { ALL, UNREAD, WAITING, GROUPS }

@HiltViewModel
class InboxViewModel @Inject constructor(
    context: app.zuri.android.domain.context.ActiveContextProvider,
    inbox: InboxRepository,
    private val capture: CaptureStatusProvider,
    private val avatarSource: app.zuri.android.domain.cloud.CloudAvatars,
) : ViewModel() {
    private val filter = MutableStateFlow<SourceKind?>(null)
    private val view = MutableStateFlow(InboxView.ALL)
    private val query = MutableStateFlow("")
    fun setView(v: InboxView) { view.value = v }
    fun setQuery(q: String) { query.value = q }

    /** WhatsApp profile pictures by conversation id, loaded once per chat as rows appear. */
    val avatars: StateFlow<Map<String, androidx.compose.ui.graphics.ImageBitmap>> get() = avatarLoader.photos
    private val avatarLoader = AvatarLoader(avatarSource, viewModelScope)
    fun needAvatar(conversationId: String) = avatarLoader.need(conversationId)

    @OptIn(ExperimentalCoroutinesApi::class)
    private val conversations = context.active.flatMapLatest { ctx ->
        if (ctx == null) flowOf(null to emptyList()) else inbox.observeConversations(ctx.ids).map { ctx to it }
    }

    val state: StateFlow<InboxState> = combine(conversations, filter, capture.status, view, query) { (ctx, list), f, status, v, q ->
        InboxState(
            loading = false,
            workspaceKind = if (ctx?.hybrid == true) WorkspaceKind.PERSONAL else ctx?.primary?.kind ?: WorkspaceKind.PERSONAL,
            workspaceNames = if (ctx?.hybrid == true) ctx.members.associate { it.id to it.name } else emptyMap(),
            conversations = list,
            filter = f?.takeIf { k -> list.any { it.source == k } },
            status = status,
            view = v, query = q,
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
    /** The chat's cloud AI state (linked, AI on, partner). */
    val ai: app.zuri.android.domain.cloud.ChatAi? = null,
) {
    /** The owner can send: through the live notification, or through their cloud WhatsApp session. */
    val canSend: Boolean get() = canReply || ai?.linked == true
}

sealed interface DraftsState {
    data object Idle : DraftsState
    data object Drafting : DraftsState
    data class Ready(val drafts: List<String>, val byModel: Boolean) : DraftsState
    /** From the cloud reply engine: options of 1–3 messages each, maybe a question only the owner can answer. */
    data class Cloud(
        val draftId: String, val model: String?, val options: List<app.zuri.android.domain.cloud.ReplyOption>,
        val question: app.zuri.android.domain.cloud.ReplyQuestion?,
    ) : DraftsState
    /** AI is switched off for this chat (server switch). */
    data object AiOff : DraftsState
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
    private val workspaces: WorkspaceRepository,
    private val cloudSync: app.zuri.android.domain.cloud.CloudSync,
    private val cloudMedia: app.zuri.android.domain.cloud.CloudMedia,
    private val cloudReplies: app.zuri.android.domain.cloud.CloudReplies,
    avatarSource: app.zuri.android.domain.cloud.CloudAvatars,
) : ViewModel() {
    private val avatarLoader = AvatarLoader(avatarSource, viewModelScope)
    val avatars: StateFlow<Map<String, androidx.compose.ui.graphics.ImageBitmap>> get() = avatarLoader.photos
    fun needAvatar(conversationId: String) = avatarLoader.need(conversationId)
    // ── Cloud (D-21): older history on scroll, media on tap ─────────────────
    private val _olderState = MutableStateFlow(OlderState())
    val older: StateFlow<OlderState> = _olderState

    /** Older history for this chat from the server; one page per call. */
    fun loadOlder() {
        val s = _olderState.value
        if (s.loading || s.exhausted) return
        _olderState.value = s.copy(loading = true)
        viewModelScope.launch {
            val more = cloudSync.loadOlder(id.value)
            _olderState.value = OlderState(loading = false, exhausted = !more)
        }
    }

    private val _media = MutableStateFlow<Map<String, MediaUi>>(emptyMap())
    val media: StateFlow<Map<String, MediaUi>> = _media

    fun openMedia(messageId: MessageId, force: Boolean = false) {
        val key = messageId.value
        if (_media.value[key] is MediaUi.Loading) return
        _media.value = _media.value + (key to MediaUi.Loading)
        viewModelScope.launch {
            val r = cloudMedia.open(key, force)
            _media.value = _media.value + (key to when (r) {
                is app.zuri.android.domain.cloud.MediaResult.Ready -> MediaUi.Ready(r.path, r.mime)
                app.zuri.android.domain.cloud.MediaResult.NeedsWifi -> MediaUi.NeedsWifi
                app.zuri.android.domain.cloud.MediaResult.NotAvailable -> MediaUi.Unavailable
                app.zuri.android.domain.cloud.MediaResult.NotConnected -> MediaUi.Failed("Connect Zuri cloud in Settings")
                is app.zuri.android.domain.cloud.MediaResult.Failed -> MediaUi.Failed(r.message)
            })
        }
    }

    init { cloudSync.syncNow() }

    val allWorkspaces: StateFlow<List<Workspace>> = workspaces.observeAll().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    /** What moving this chat would take with it, for the confirmation. */
    suspend fun movePreview() = workspaces.movePreview(id)

    /** Moves the chat and everything understood from it (D-04 §3), after the owner confirmed. */
    fun moveTo(target: app.zuri.android.domain.workspace.WorkspaceId) = viewModelScope.launch { workspaces.moveConversation(id, target) }

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

    val state: StateFlow<ConversationState> = combine(
        combine(inbox.observeConversation(id), replies.observeCanReply(id), sendState, draftState) { detail, can, s, drafts -> listOf(detail, can, s, drafts) },
        cloudReplies.state(id.value),
    ) { parts, ai ->
        val (sending, result) = @Suppress("UNCHECKED_CAST") (parts[2] as Pair<Boolean, ReplyResult?>)
        ConversationState(
            loading = false, detail = parts[0] as ConversationDetail?, canReply = parts[1] as Boolean, sending = sending, lastResult = result,
            drafts = parts[3] as DraftsState, ai = ai,
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), ConversationState())

    /** Sends only on the owner's tap; returns true when the text should be cleared. */
    fun reply(text: String, onSent: () -> Unit) = viewModelScope.launch {
        sendState.value = true to null
        // A cloud option is 1–3 separate WhatsApp messages; blank lines separate them in the box.
        val messages = text.split(Regex("\\n\\s*\\n")).map { it.trim() }.filter { it.isNotEmpty() }.ifEmpty { listOf(text.trim()) }
        val viaNotification = state.value.canReply
        val result = if (viaNotification) {
            var r: ReplyResult = ReplyResult.Sent
            for ((i, m) in messages.withIndex()) {
                r = replies.reply(id, m)
                if (r != ReplyResult.Sent) break
                if (i < messages.lastIndex) kotlinx.coroutines.delay(700)
            }
            r
        } else if (cloudReplies.send(id.value, messages)) ReplyResult.Sent
        else ReplyResult.Failed("Couldn't send through Zuri cloud")
        sendState.value = false to result
        if (result == ReplyResult.Sent) {
            picked?.let { d -> feedback.record(id, d, if (d.trim() == text.trim()) DraftAction.SENT_AS_IS else DraftAction.SENT_EDITED, text.takeIf { d.trim() != it.trim() }) }
            pickedOption?.let { (draftId, o) ->
                val same = o.messages.map { it.trim() } == messages
                cloudReplies.outcome(draftId, o.id, if (same) app.zuri.android.domain.cloud.DraftOutcome.SENT else app.zuri.android.domain.cloud.DraftOutcome.EDITED, messages)
            }
            picked = null; pickedOption = null
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
    /** Cloud reply engine first (docs/AI_API.md); the on-device drafter when the chat isn't synced or the cloud can't draft. */
    fun suggest(answer: Pair<String, String>? = null) {
        if (drafting?.isActive == true) return
        drafting = viewModelScope.launch {
            draftState.value = DraftsState.Drafting
            draftState.value = when (val c = cloudReplies.draft(id.value, answer)) {
                is app.zuri.android.domain.cloud.CloudDraft.Ready -> DraftsState.Cloud(c.draftId, c.model, c.options, c.question)
                is app.zuri.android.domain.cloud.CloudDraft.NothingToAnswer -> DraftsState.NothingToAnswer
                app.zuri.android.domain.cloud.CloudDraft.AiOff -> DraftsState.AiOff
                app.zuri.android.domain.cloud.CloudDraft.Unavailable, is app.zuri.android.domain.cloud.CloudDraft.Failed -> localDraft()
            }
        }
    }

    /** The owner tapped an answer to the engine's question: redraft with it. */
    fun answer(questionId: String, text: String) { drafting?.cancel(); suggest(questionId to text) }

    private suspend fun localDraft(): DraftsState = when (val r = drafter.draft(id)) {
        is DraftResult.Drafts -> DraftsState.Ready(r.drafts, r.byModel)
        DraftResult.NothingToAnswer -> DraftsState.NothingToAnswer
        is DraftResult.Failed, DraftResult.NoModel -> DraftsState.Failed
    }

    /** The cloud option the owner put in the box, to report sent / edited. */
    private var pickedOption: Pair<String, app.zuri.android.domain.cloud.ReplyOption>? = null
    fun pickedCloud(draftId: String, option: app.zuri.android.domain.cloud.ReplyOption) { pickedOption = draftId to option; picked = null }

    fun setAiEnabled(on: Boolean) = viewModelScope.launch { cloudReplies.setAiEnabled(id.value, on); if (!on) draftState.value = DraftsState.Idle }
    fun setPartner(on: Boolean) = viewModelScope.launch { cloudReplies.setPartner(id.value, on) }

    /** Closing the drafts without using one tells Zuri they weren't right (not offered again here for a while). */
    fun dismissDrafts() {
        drafting?.cancel()
        (draftState.value as? DraftsState.Cloud)?.let { c ->
            if (pickedOption == null) viewModelScope.launch { cloudReplies.outcome(c.draftId, null, app.zuri.android.domain.cloud.DraftOutcome.DISMISSED) }
        }
        val shown = draftState.value as? DraftsState.Ready
        draftState.value = DraftsState.Idle
        if (shown != null && picked == null) viewModelScope.launch { shown.drafts.forEach { feedback.record(id, it, DraftAction.DISMISSED) } }
    }

    fun markRead() = viewModelScope.launch { inbox.markRead(id) }
    fun deleteMessage(message: MessageId) = viewModelScope.launch { inbox.deleteMessage(message) }
    fun deleteConversation() = viewModelScope.launch { inbox.deleteConversation(id) }
    fun exclude() = viewModelScope.launch { inbox.excludeConversation(id) }
}

data class OlderState(val loading: Boolean = false, val exhausted: Boolean = false)

sealed interface MediaUi {
    data object Loading : MediaUi
    data class Ready(val path: String, val mime: String?) : MediaUi
    data object NeedsWifi : MediaUi
    data object Unavailable : MediaUi
    data class Failed(val message: String) : MediaUi
}

/** Loads each chat's profile picture once and decodes it for Compose. */
internal class AvatarLoader(private val source: app.zuri.android.domain.cloud.CloudAvatars, private val scope: kotlinx.coroutines.CoroutineScope) {
    private val asked = mutableSetOf<String>()
    private val _photos = MutableStateFlow<Map<String, androidx.compose.ui.graphics.ImageBitmap>>(emptyMap())
    val photos: StateFlow<Map<String, androidx.compose.ui.graphics.ImageBitmap>> = _photos

    fun need(conversationId: String) {
        if (!asked.add(conversationId)) return
        scope.launch {
            val bytes = runCatching { source.forConversation(conversationId) }.getOrNull() ?: return@launch
            val bmp = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.Default) {
                android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
            } ?: return@launch
            _photos.value = _photos.value + (conversationId to bmp.asImageBitmap())
        }
    }
}

