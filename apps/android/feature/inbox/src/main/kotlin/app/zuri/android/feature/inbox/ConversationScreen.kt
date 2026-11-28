package app.zuri.android.feature.inbox

import androidx.compose.foundation.horizontalScroll

import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics

import app.zuri.android.core.ui.universe.WarpTunnel
import app.zuri.android.core.ui.universe.glass
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.automirrored.rounded.ArrowBack

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.MoreVert
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.zuri.android.core.ui.capture.icon
import app.zuri.android.core.ui.capture.label
import app.zuri.android.core.ui.capture.note
import app.zuri.android.core.ui.components.DetailTopBar
import app.zuri.android.core.ui.theme.Zuri
import app.zuri.android.domain.inbox.ConversationDetail
import app.zuri.android.domain.inbox.Direction
import app.zuri.android.domain.inbox.InboxMessage
import app.zuri.android.domain.inbox.MessageId
import app.zuri.android.domain.inbox.PlaceholderKind
import app.zuri.android.domain.inbox.ReplyResult
import app.zuri.android.domain.inbox.SentFromZuri
import androidx.compose.material.icons.automirrored.rounded.Send
import androidx.compose.foundation.layout.imePadding
import kotlinx.coroutines.launch

/** P03 Conversation detail (read-only in M2): bubbles, honest placeholders, per-message provenance. */
@Composable
fun ConversationRoute(onBack: () -> Unit, viewModel: ConversationViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val auto by viewModel.autoReply.collectAsStateWithLifecycle()
    val insight by viewModel.insight.collectAsStateWithLifecycle()
    val allWorkspaces by viewModel.allWorkspaces.collectAsStateWithLifecycle()
    val media by viewModel.media.collectAsStateWithLifecycle()
    val avatars by viewModel.avatars.collectAsStateWithLifecycle()
    val older by viewModel.older.collectAsStateWithLifecycle()
    val detail = state.detail
    LaunchedEffect(detail?.summary?.unreadCount) { if ((detail?.summary?.unreadCount ?: 0) > 0) viewModel.markRead() }
    LaunchedEffect(state.loading, detail == null) { if (!state.loading && detail == null) onBack() }
    if (detail == null) return
    val context = androidx.compose.ui.platform.LocalContext.current
    ConversationContent(
        detail, TimeContext.system(), onBack,
        onDeleteMessage = viewModel::deleteMessage,
        onDeleteConversation = viewModel::deleteConversation,
        onExclude = viewModel::exclude,
        autoReplyOn = auto.enabled && !detail.summary.isGroup,
        insight = insight,
        onSummarize = viewModel::summarize,
        media = media,
        onOpenMedia = viewModel::openMedia,
        photo = avatars[detail.summary.id.value],
        ai = state.ai,
        onSetAi = viewModel::setAiEnabled,
        onSetPartner = viewModel::setPartner,
        onNeedPhoto = { viewModel.needAvatar(detail.summary.id.value) },
        older = older,
        onLoadOlder = viewModel::loadOlder,
        moveSheet = if (allWorkspaces.size > 1) { close ->
            MoveContent(allWorkspaces, detail.summary.workspaceId, preview = viewModel::movePreview, onMove = { viewModel.moveTo(it); close() }, onCancel = close)
        } else null,
        autoReplySheet = {
            AutoReplyContent(auto, detail.summary.isGroup, TimeContext.system(), viewModel::setAutoReply, viewModel::pauseAutoReplies, viewModel::setAutoReplyDelay)
        },
        composer = {
            ReplyComposer(
                state = state,
                onSend = { text, clear -> viewModel.reply(text, clear) },
                onSuggest = viewModel::suggest,
                onDismissDrafts = viewModel::dismissDrafts,
                onPicked = viewModel::picked,
                onCopied = viewModel::copied,
                onPickedCloud = viewModel::pickedCloud,
                onAnswer = viewModel::answer,
                onOpenApp = {
                    detail.summary.source.packages.firstNotNullOfOrNull { context.packageManager.getLaunchIntentForPackage(it) }
                        ?.let { runCatching { context.startActivity(it) } }
                },
            )
        },
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConversationContent(
    detail: ConversationDetail,
    time: TimeContext,
    onBack: () -> Unit,
    onDeleteMessage: (MessageId) -> Unit,
    onDeleteConversation: () -> Unit,
    onExclude: () -> Unit,
    modifier: Modifier = Modifier,
    initiallySelected: MessageId? = null,
    autoReplyOn: Boolean = false,
    autoReplySheet: (@Composable () -> Unit)? = null,
    insight: InsightState? = null,
    onSummarize: () -> Unit = {},
    moveSheet: (@Composable (close: () -> Unit) -> Unit)? = null,
    media: Map<String, MediaUi> = emptyMap(),
    onOpenMedia: (MessageId, Boolean) -> Unit = { _, _ -> },
    older: OlderState = OlderState(exhausted = true),
    onLoadOlder: () -> Unit = {},
    photo: androidx.compose.ui.graphics.ImageBitmap? = null,
    onNeedPhoto: () -> Unit = {},
    ai: app.zuri.android.domain.cloud.ChatAi? = null,
    onSetAi: (Boolean) -> Unit = {},
    onSetPartner: (Boolean) -> Unit = {},
    composer: @Composable () -> Unit = {},
) {
    LaunchedEffect(detail.summary.id) { onNeedPhoto() }
    var viewing by remember { mutableStateOf<Pair<MediaUi.Ready, app.zuri.android.domain.inbox.MediaKind>?>(null) }
    var highlight by remember { mutableStateOf<MessageId?>(null) }
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    var showAuto by remember { mutableStateOf(false) }
    var showInsight by remember { mutableStateOf(false) }
    var showMove by remember { mutableStateOf(false) }
    val s = detail.summary
    val sourceName = stringResource(s.source.label())
    var menu by remember { mutableStateOf(false) }
    var confirm by rememberSaveable { mutableStateOf<String?>(null) }
    var selected by remember { mutableStateOf(initiallySelected?.let { id -> detail.messages.firstOrNull { it.id == id } }) }
    var confirmMessage by remember { mutableStateOf<InboxMessage?>(null) }

    Box(modifier.fillMaxSize()) {
    // Signal Tunnel (spec §4.3): rings rush toward you behind the conversation.
    WarpTunnel()
    Column(Modifier.fillMaxSize()) {
        TunnelHeader(
            id = s.id.value, title = s.title, isGroup = s.isGroup, photo = photo,
            onBack = onBack,
            subtitle = pluralStringResource(R.plurals.conv_coverage, s.messageCount, sourceName, s.messageCount),
            actions = {
                Box {
                    IconButton(onClick = { menu = true }) { Icon(Icons.Rounded.MoreVert, stringResource(R.string.conv_menu)) }
                    DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                        if (insight != null) DropdownMenuItem(text = { Text(stringResource(R.string.insight_menu)) }, onClick = { menu = false; showInsight = true })
                        if (moveSheet != null) DropdownMenuItem(text = { Text(stringResource(R.string.move_menu)) }, onClick = { menu = false; showMove = true })
                        if (autoReplySheet != null) DropdownMenuItem(text = { Text(stringResource(R.string.auto_menu)) }, onClick = { menu = false; showAuto = true })
                        // Server-side switches (docs/AI_API.md): only for one-to-one chats synced with the cloud.
                        if (ai != null && ai.linked && !ai.isGroup) {
                            DropdownMenuItem(
                                text = { Text(stringResource(if (ai.aiEnabled) R.string.menu_ai_on else R.string.menu_ai_off)) },
                                trailingIcon = { androidx.compose.material3.Switch(checked = ai.aiEnabled, onCheckedChange = null) },
                                onClick = { menu = false; onSetAi(!ai.aiEnabled) },
                            )
                            DropdownMenuItem(
                                text = { Text(stringResource(if (ai.partner) R.string.menu_partner_unmark else R.string.menu_partner_mark)) },
                                onClick = { menu = false; onSetPartner(!ai.partner) },
                            )
                        }
                        DropdownMenuItem(text = { Text(stringResource(R.string.conv_exclude)) }, onClick = { menu = false; confirm = "exclude" })
                        DropdownMenuItem(text = { Text(stringResource(R.string.conv_delete)) }, onClick = { menu = false; confirm = "delete" })
                    }
                }
            },
        )
        if (ai != null && ai.linked && !ai.aiEnabled) {
            Text(
                stringResource(R.string.ai_off_banner), style = MaterialTheme.typography.labelMedium, color = Zuri.universe.inkMuted,
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
            )
        }
        if (autoReplyOn) {
            Text(
                stringResource(R.string.auto_on_banner), style = MaterialTheme.typography.labelMedium, color = Zuri.colors.ctx,
                modifier = Modifier.fillMaxWidth().background(Zuri.colors.ctxWeak).clickable { showAuto = true }.padding(horizontal = 16.dp, vertical = 6.dp),
            )
        }
        if (insight != null && insight.insight.worthAStrip()) InsightStrip(insight.insight) { showInsight = true }
        val list = rememberLazyListState(initialFirstVisibleItemIndex = (detail.messages.size - 1).coerceAtLeast(0))
        // Follow the newest message only when a new one arrives at the bottom (older history loads above).
        val lastId = detail.messages.lastOrNull()?.id
        LaunchedEffect(lastId) { if (detail.messages.isNotEmpty()) list.animateScrollToItem(detail.messages.size - 1) }
        // Scrolled to the top of what's on the phone: fetch the next older page from the cloud.
        val atTop by remember { androidx.compose.runtime.derivedStateOf { list.firstVisibleItemIndex <= 2 } }
        LaunchedEffect(atTop, detail.messages.size) { if (atTop) onLoadOlder() }
        val indexOf = remember(detail.messages) { detail.messages.withIndex().associate { it.value.id to it.index } }
        LazyColumn(Modifier.weight(1f).fillMaxWidth(), state = list, contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 12.dp, vertical = 8.dp)) {
            if (older.loading) item(key = "older") {
                Text(stringResource(R.string.load_older), style = MaterialTheme.typography.labelMedium, color = Zuri.colors.muted,
                    modifier = Modifier.fillMaxWidth().padding(8.dp), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
            }
            items(detail.messages.indices.toList(), key = { detail.messages[it].id.value }) { i ->
                val m = detail.messages[i]
                val prev = detail.messages.getOrNull(i - 1)
                if (prev == null || !time.sameDay(prev.sentAtMillis, m.sentAtMillis)) DayLabel(time.day(m.sentAtMillis, stringResource(R.string.today), stringResource(R.string.yesterday)))
                val sameAuthor = prev != null && prev.direction == m.direction && prev.senderName == m.senderName && time.sameDay(prev.sentAtMillis, m.sentAtMillis)
                val showSender = s.isGroup && m.direction == Direction.INCOMING && !sameAuthor
                Bubble(
                    m, showSender, time, grouped = sameAuthor, highlighted = highlight == m.id,
                    media = media[m.id.value],
                    onOpenMedia = { force -> onOpenMedia(m.id, force) },
                    onViewMedia = { r, k -> viewing = r to k },
                    onJumpToQuote = m.cloud?.quoted?.localId?.let { target -> indexOf[target]?.let { idx -> {
                        highlight = target
                        scope.launch { list.animateScrollToItem(idx + if (older.loading) 1 else 0); kotlinx.coroutines.delay(1600); highlight = null }
                    } } },
                ) { selected = m }
            }
        }
        Box(Modifier.navigationBarsPadding().imePadding()) { composer() }
    }
    }

    when (confirm) {
        "exclude" -> ConfirmDialog(
            stringResource(R.string.exclude_title, s.title), stringResource(R.string.exclude_body, s.messageCount), stringResource(R.string.exclude_confirm),
            onConfirm = { confirm = null; onExclude() }, onDismiss = { confirm = null },
        )
        "delete" -> ConfirmDialog(
            stringResource(R.string.delete_conv_title, s.title), stringResource(R.string.delete_conv_body, s.messageCount), stringResource(R.string.delete),
            onConfirm = { confirm = null; onDeleteConversation() }, onDismiss = { confirm = null },
        )
    }

    if (showMove && moveSheet != null) {
        ModalBottomSheet(onDismissRequest = { showMove = false }) { moveSheet { showMove = false } }
    }
    if (showInsight && insight != null) {
        ModalBottomSheet(onDismissRequest = { showInsight = false }) { InsightContent(insight, time, onSummarize) }
    }
    if (showAuto && autoReplySheet != null) {
        ModalBottomSheet(onDismissRequest = { showAuto = false }) { autoReplySheet() }
    }
    viewing?.let { (r, k) -> MediaViewer(r, k) { viewing = null } }
    selected?.let { m ->
        ModalBottomSheet(onDismissRequest = { selected = null }) {
            MessageInfoContent(m, sourceName, time, onDelete = { selected = null; confirmMessage = m }, onClose = { selected = null })
        }
    }
    confirmMessage?.let { m ->
        ConfirmDialog(
            stringResource(R.string.delete_msg_title), stringResource(R.string.delete_msg_body, sourceName), stringResource(R.string.delete),
            onConfirm = { confirmMessage = null; onDeleteMessage(m.id) }, onDismiss = { confirmMessage = null },
        )
    }
}

/** The engine needs something only the owner knows: one tap answers, and Zuri redrafts with it. */
@Composable
private fun QuestionCard(q: app.zuri.android.domain.cloud.ReplyQuestion, onAnswer: (String) -> Unit) {
    val u = Zuri.universe
    Column(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp).glass(RoundedCornerShape(20.dp)).padding(12.dp)) {
        Text(stringResource(R.string.question_eyebrow), style = MaterialTheme.typography.labelSmall, color = u.star)
        Text(q.text, style = MaterialTheme.typography.titleMedium, color = u.ink, modifier = Modifier.padding(vertical = 4.dp))
        Row(Modifier.horizontalScroll(androidx.compose.foundation.rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            q.answers.forEach { a ->
                Text(
                    a, style = MaterialTheme.typography.labelLarge, color = u.ink,
                    modifier = Modifier.clip(RoundedCornerShape(50)).background(u.ion.copy(alpha = 0.18f)).clickable { onAnswer(a) }
                        .padding(horizontal = 14.dp, vertical = 10.dp),
                )
            }
        }
    }
}

/** The tunnel's glass header: back, the contact's planet, name and coverage. */
@Composable
private fun TunnelHeader(id: String, title: String, isGroup: Boolean, photo: androidx.compose.ui.graphics.ImageBitmap?, subtitle: String, onBack: () -> Unit, actions: @Composable androidx.compose.foundation.layout.RowScope.() -> Unit) {
    val u = Zuri.universe
    Row(
        Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 10.dp, vertical = 6.dp)
            .glass(RoundedCornerShape(24.dp)).padding(horizontal = 4.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = stringResource(R.string.back), tint = u.ink) }
        Avatar(id, title, isGroup, size = 38.dp, photo = photo)
        Spacer(Modifier.width(8.dp))
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleLarge, color = u.ink, maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = u.inkMuted, maxLines = 1)
        }
        actions()
    }
}

@Composable
private fun ConfirmDialog(title: String, body: String, confirm: String, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { Text(body) },
        confirmButton = { TextButton(onClick = onConfirm) { Text(confirm, color = Zuri.colors.bad) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.cancel)) } },
    )
}

@Composable
private fun DayLabel(text: String) {
    Box(Modifier.fillMaxWidth().padding(vertical = 10.dp), contentAlignment = Alignment.Center) {
        Text(
            text, style = MaterialTheme.typography.labelMedium, color = Zuri.colors.muted,
            modifier = Modifier.clip(RoundedCornerShape(50)).background(Zuri.colors.surface2).padding(horizontal = 12.dp, vertical = 4.dp),
        )
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun Bubble(
    m: InboxMessage, showSender: Boolean, time: TimeContext,
    grouped: Boolean = false, highlighted: Boolean = false,
    media: MediaUi? = null, onOpenMedia: (Boolean) -> Unit = {}, onViewMedia: (MediaUi.Ready, app.zuri.android.domain.inbox.MediaKind) -> Unit = { _, _ -> },
    onJumpToQuote: (() -> Unit)? = null,
    onLongPress: () -> Unit,
) {
    val mine = m.direction == Direction.OUTGOING
    val c = Zuri.colors
    val u = Zuri.universe
    val tail = if (grouped) 20.dp else 6.dp
    val shape = RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp, bottomStart = if (mine) 20.dp else tail, bottomEnd = if (mine) tail else 20.dp)
    // Theirs are glass; mine are the violet outgoing gradient (spec §4.3).
    val surface = when {
        highlighted -> Modifier.clip(shape).background(u.ion.copy(alpha = 0.3f))
        mine -> Modifier.clip(shape).background(androidx.compose.ui.graphics.Brush.linearGradient(app.zuri.android.core.ui.theme.OutgoingGradient))
        else -> Modifier.glass(shape)
    }
    val ink = if (mine) androidx.compose.ui.graphics.Color.White else u.ink
    val cloud = m.cloud
    Column(Modifier.fillMaxWidth().padding(top = if (grouped) 1.dp else 4.dp), horizontalAlignment = if (mine) Alignment.End else Alignment.Start) {
        androidx.compose.runtime.CompositionLocalProvider(androidx.compose.material3.LocalContentColor provides ink) {
        Column(
            Modifier.widthIn(max = 300.dp).then(surface)
                .combinedClickable(onClick = onLongPress, onLongClick = onLongPress)
                .padding(horizontal = 12.dp, vertical = 8.dp),
        ) {
            if (showSender && m.senderName != null) Text(m.senderName!!, style = MaterialTheme.typography.labelLarge, color = senderColor(m.senderName!!))
            if (cloud?.forwarded == true) Text(stringResource(R.string.forwarded), style = MaterialTheme.typography.labelSmall, color = ink.copy(alpha = 0.75f), fontStyle = FontStyle.Italic)
            cloud?.quoted?.let { QuoteBlock(it, mine, onJumpToQuote) }
            val ph = m.placeholder
            val richMedia = cloud?.media
            when {
                ph == PlaceholderKind.REACTION -> Text(stringResource(R.string.reacted, m.placeholderDetail.orEmpty()), style = MaterialTheme.typography.bodyLarge, color = ink.copy(alpha = 0.75f))
                ph == PlaceholderKind.DELETED -> Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(ph.icon(), null, tint = ink.copy(alpha = 0.75f), modifier = Modifier.size(16.dp)); Spacer(Modifier.size(6.dp))
                    Text(stringResource(ph.label()), style = MaterialTheme.typography.bodyMedium, color = ink.copy(alpha = 0.75f), fontStyle = FontStyle.Italic)
                }
                richMedia != null -> {
                    MediaBlock(richMedia, media, onOpenMedia, onViewMedia)
                    // A voice note's transcript, or a photo's caption.
                    m.text?.let { Text(it, style = MaterialTheme.typography.bodyLarge) }
                }
                cloud?.location != null -> LocationBlock(cloud.location!!)
                ph != null -> {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(ph.icon(), null, tint = ink.copy(alpha = 0.75f), modifier = Modifier.size(18.dp))
                        Spacer(Modifier.size(6.dp))
                        Text(
                            listOfNotNull(stringResource(ph.label()), m.placeholderDetail).joinToString(" · "),
                            style = MaterialTheme.typography.bodyMedium, color = ink.copy(alpha = 0.75f), fontStyle = FontStyle.Italic,
                        )
                    }
                    if (m.text != null) { Spacer(Modifier.height(4.dp)); Text(m.text!!, style = MaterialTheme.typography.bodyLarge) }
                }
                else -> Text(m.text.orEmpty(), style = MaterialTheme.typography.bodyLarge)
            }
            Row(Modifier.align(Alignment.End), verticalAlignment = Alignment.CenterVertically) {
                if (m.provenance.adapterVersion == SentFromZuri.AUTO_REPLY && cloud == null) Text(stringResource(R.string.auto_badge) + " · ", style = MaterialTheme.typography.labelSmall, color = c.ctx)
                if (m.edited) Text(stringResource(R.string.edited) + " · ", style = MaterialTheme.typography.labelSmall, color = ink.copy(alpha = 0.7f))
                Text(time.time(m.sentAtMillis), style = MaterialTheme.typography.labelSmall, color = ink.copy(alpha = 0.7f))
                if (mine) Ticks(cloud?.status)
            }
        }
        }
        if (!cloud?.reactions.isNullOrEmpty()) ReactionChips(cloud!!.reactions, mine)
    }
}

/** A stable colour per group participant, like WhatsApp. */
@Composable
private fun senderColor(name: String): androidx.compose.ui.graphics.Color {
    val palette = listOf(0xFF6366F1, 0xFF0EA5E9, 0xFF10B981, 0xFFF59E0B, 0xFFEC4899, 0xFF8B5CF6, 0xFF14B8A6, 0xFFEF4444)
    return androidx.compose.ui.graphics.Color(palette[(name.hashCode() and 0x7fffffff) % palette.size])
}

/** Long-press sheet: where this exact message came from, and deletion. */
@Composable
fun MessageInfoContent(m: InboxMessage, sourceName: String, time: TimeContext, onDelete: () -> Unit, onClose: () -> Unit) {
    val p = m.provenance
    Column(Modifier.fillMaxWidth().padding(horizontal = 22.dp).navigationBarsPadding()) {
        Text(stringResource(R.string.msg_source), style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(12.dp))
        val note = m.placeholder?.note()
        if (note != null) {
            Text(stringResource(note), style = MaterialTheme.typography.bodyMedium)
            Spacer(Modifier.height(12.dp))
        }
        when (p.adapterVersion) {
            SentFromZuri.TAPPED -> listOf(stringResource(R.string.prov_sent_zuri, sourceName), stringResource(R.string.prov_captured, time.full(p.capturedAtMillis)))
            SentFromZuri.AUTO_REPLY -> listOf(stringResource(R.string.prov_sent_auto, sourceName), stringResource(R.string.prov_captured, time.full(p.capturedAtMillis)))
            else -> listOf(
                stringResource(R.string.prov_from, sourceName),
                stringResource(R.string.prov_posted, time.full(p.notificationPostedAtMillis)),
                stringResource(R.string.prov_captured, time.full(p.capturedAtMillis)),
                stringResource(R.string.prov_adapter, sourceName, p.adapterVersion),
                stringResource(R.string.prov_left),
            )
        }.forEach {
            Text("• $it", style = MaterialTheme.typography.bodyMedium, color = Zuri.colors.muted, modifier = Modifier.padding(vertical = 2.dp))
        }
        Spacer(Modifier.height(16.dp))
        Row {
            TextButton(onClick = onDelete) { Text(stringResource(R.string.msg_delete), color = Zuri.colors.bad, fontWeight = FontWeight.SemiBold) }
            Spacer(Modifier.weight(1f))
            TextButton(onClick = onClose) { Text(stringResource(R.string.close)) }
        }
        Spacer(Modifier.height(12.dp))
    }
}

/**
 * Reply bar: sends through the source app's live notification; otherwise offers to open the app.
 * "Suggest replies" writes drafts on the phone; a tapped draft goes into the box to edit (or, with
 * no reply button, is copied to paste in the app). Nothing is sent without the Send tap.
 */
@Composable
private fun ReplyComposer(
    state: ConversationState,
    onSend: (String, () -> Unit) -> Unit,
    onSuggest: () -> Unit,
    onDismissDrafts: () -> Unit,
    onOpenApp: () -> Unit,
    onPicked: (String) -> Unit = {},
    onCopied: (String) -> Unit = {},
    onPickedCloud: (String, app.zuri.android.domain.cloud.ReplyOption) -> Unit = { _, _ -> },
    onAnswer: (String, String) -> Unit = { _, _ -> },
) {
    var text by rememberSaveable { mutableStateOf("") }
    val sendLabel = stringResource(R.string.reply_send)
    val context = androidx.compose.ui.platform.LocalContext.current
    val copied = stringResource(R.string.drafts_copied)
    Column(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 6.dp)) {
        when (state.lastResult) {
            ReplyResult.NotAvailable -> Text(stringResource(R.string.reply_expired), style = MaterialTheme.typography.bodySmall, color = Zuri.colors.warn, modifier = Modifier.padding(horizontal = 8.dp))
            is ReplyResult.Failed -> Text(stringResource(R.string.reply_failed), style = MaterialTheme.typography.bodySmall, color = Zuri.colors.bad, modifier = Modifier.padding(horizontal = 8.dp))
            else -> Unit
        }
        val copy: (String) -> Unit = { draft ->
            val cm = context.getSystemService(android.content.ClipboardManager::class.java)
            cm?.setPrimaryClip(android.content.ClipData.newPlainText("Reply", draft))
            android.widget.Toast.makeText(context, copied, android.widget.Toast.LENGTH_SHORT).show()
            onCopied(draft)
        }
        DraftsPanel(
            state.drafts, onSuggest, onDismissDrafts,
            // With a way to send, a tapped draft goes in the box to edit; without one it's copied.
            onPick = { draft -> if (state.canSend) { text = draft; onPicked(draft) } else copy(draft) },
            onCopy = copy,
            onPickCloud = { draftId, option ->
                val joined = option.messages.joinToString("\n\n")
                if (state.canSend) { text = joined; onPickedCloud(draftId, option) } else copy(option.messages.joinToString("\n"))
            },
            onAnswer = onAnswer,
        )
        if (state.canSend) {
            // Glass composer with the violet send orb (spec §4.3). Sending is always the owner's tap.
            Row(Modifier.glass(RoundedCornerShape(26.dp)).padding(start = 4.dp, end = 6.dp, top = 4.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                androidx.compose.material3.TextField(
                    value = text, onValueChange = { text = it }, modifier = Modifier.weight(1f),
                    placeholder = { Text(stringResource(R.string.reply_hint), color = Zuri.universe.inkMuted) }, maxLines = 5,
                    colors = androidx.compose.material3.TextFieldDefaults.colors(
                        focusedContainerColor = androidx.compose.ui.graphics.Color.Transparent, unfocusedContainerColor = androidx.compose.ui.graphics.Color.Transparent,
                        disabledContainerColor = androidx.compose.ui.graphics.Color.Transparent,
                        focusedIndicatorColor = androidx.compose.ui.graphics.Color.Transparent, unfocusedIndicatorColor = androidx.compose.ui.graphics.Color.Transparent,
                    ),
                )
                val canSend = text.isNotBlank() && !state.sending
                androidx.compose.foundation.layout.Box(
                    Modifier.size(48.dp).clip(androidx.compose.foundation.shape.CircleShape)
                        .clickable(enabled = canSend, role = androidx.compose.ui.semantics.Role.Button) { onSend(text) { text = "" } }
                        .semantics { contentDescription = sendLabel },
                    contentAlignment = Alignment.Center,
                ) {
                    app.zuri.android.core.ui.universe.Orb(44.dp, app.zuri.android.core.ui.theme.CoreSkin, glow = canSend) {
                        Icon(Icons.AutoMirrored.Rounded.Send, null, tint = androidx.compose.ui.graphics.Color.White.copy(alpha = if (canSend) 1f else 0.5f), modifier = Modifier.size(20.dp))
                    }
                }
            }
        } else {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(horizontal = 8.dp)) {
                Text(stringResource(R.string.reply_unavailable), style = MaterialTheme.typography.bodySmall, color = Zuri.colors.muted, modifier = Modifier.weight(1f))
                androidx.compose.material3.TextButton(onClick = onOpenApp) { Text(stringResource(R.string.reply_open_app)) }
            }
        }
    }
}

@Composable
fun DraftsPanel(
    drafts: DraftsState, onSuggest: () -> Unit, onDismiss: () -> Unit, onPick: (String) -> Unit, onCopy: (String) -> Unit = onPick,
    onPickCloud: (String, app.zuri.android.domain.cloud.ReplyOption) -> Unit = { _, o -> onPick(o.messages.joinToString("\n\n")) },
    onAnswer: (String, String) -> Unit = { _, _ -> },
) {
    val c = Zuri.colors
    when (drafts) {
        DraftsState.Idle -> TextButton(onClick = onSuggest) {
            Icon(Icons.Rounded.AutoAwesome, null, modifier = Modifier.size(18.dp))
            Spacer(Modifier.size(6.dp))
            Text(stringResource(R.string.drafts_suggest))
        }
        DraftsState.Drafting -> Row(Modifier.padding(horizontal = 8.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            androidx.compose.material3.CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp)
            Spacer(Modifier.size(10.dp))
            Text(stringResource(R.string.drafts_working), style = MaterialTheme.typography.bodySmall, color = c.muted, modifier = Modifier.weight(1f))
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.cancel)) }
        }
        DraftsState.NothingToAnswer, DraftsState.Failed -> Row(Modifier.padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(
                stringResource(if (drafts == DraftsState.Failed) R.string.drafts_failed else R.string.drafts_nothing),
                style = MaterialTheme.typography.bodySmall, color = c.muted, modifier = Modifier.weight(1f),
            )
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.close)) }
        }
        DraftsState.AiOff -> Row(Modifier.padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(stringResource(R.string.drafts_ai_off), style = MaterialTheme.typography.bodySmall, color = c.muted, modifier = Modifier.weight(1f))
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.close)) }
        }
        is DraftsState.Cloud -> Column(Modifier.fillMaxWidth()) {
            drafts.question?.let { q -> QuestionCard(q) { a -> onAnswer(q.id, a) } }
            HoloDeck(
                drafts.options.map { HoloCard(it.messages, it.why, it.tone) },
                stringResource(R.string.drafts_by_cloud, drafts.model?.substringAfter('/')?.replace('-', ' ') ?: "Zuri"),
                onPickIndex = { i -> onPickCloud(drafts.draftId, drafts.options[i]) },
                onCopyIndex = { i -> onCopy(drafts.options[i].messages.joinToString("\n")) },
            )
            TextButton(onClick = onDismiss, modifier = Modifier.align(Alignment.CenterHorizontally)) { Text(stringResource(R.string.holo_not_now), color = Zuri.universe.inkMuted) }
        }
        is DraftsState.Ready -> Column(Modifier.fillMaxWidth()) {
            HoloDeck(
                drafts.drafts.map { HoloCard(listOf(it), null, null) }, stringResource(if (drafts.byModel) R.string.drafts_by_model else R.string.drafts_quick),
                onPickIndex = { onPick(drafts.drafts[it]) }, onCopyIndex = { onCopy(drafts.drafts[it]) },
            )
            TextButton(onClick = onDismiss, modifier = Modifier.align(Alignment.CenterHorizontally)) { Text(stringResource(R.string.holo_not_now), color = Zuri.universe.inkMuted) }
        }
    }
}
