package app.zuri.android.feature.inbox

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

/** P03 Conversation detail (read-only in M2): bubbles, honest placeholders, per-message provenance. */
@Composable
fun ConversationRoute(onBack: () -> Unit, viewModel: ConversationViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val auto by viewModel.autoReply.collectAsStateWithLifecycle()
    val insight by viewModel.insight.collectAsStateWithLifecycle()
    val allWorkspaces by viewModel.allWorkspaces.collectAsStateWithLifecycle()
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
    composer: @Composable () -> Unit = {},
) {
    var showAuto by remember { mutableStateOf(false) }
    var showInsight by remember { mutableStateOf(false) }
    var showMove by remember { mutableStateOf(false) }
    val s = detail.summary
    val sourceName = stringResource(s.source.label())
    var menu by remember { mutableStateOf(false) }
    var confirm by rememberSaveable { mutableStateOf<String?>(null) }
    var selected by remember { mutableStateOf(initiallySelected?.let { id -> detail.messages.firstOrNull { it.id == id } }) }
    var confirmMessage by remember { mutableStateOf<InboxMessage?>(null) }

    Column(modifier.fillMaxSize()) {
        DetailTopBar(
            title = s.title,
            onBack = onBack,
            subtitle = pluralStringResource(R.plurals.conv_coverage, s.messageCount, sourceName, s.messageCount),
            actions = {
                Box {
                    IconButton(onClick = { menu = true }) { Icon(Icons.Rounded.MoreVert, stringResource(R.string.conv_menu)) }
                    DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                        if (insight != null) DropdownMenuItem(text = { Text(stringResource(R.string.insight_menu)) }, onClick = { menu = false; showInsight = true })
                        if (moveSheet != null) DropdownMenuItem(text = { Text(stringResource(R.string.move_menu)) }, onClick = { menu = false; showMove = true })
                        if (autoReplySheet != null) DropdownMenuItem(text = { Text(stringResource(R.string.auto_menu)) }, onClick = { menu = false; showAuto = true })
                        DropdownMenuItem(text = { Text(stringResource(R.string.conv_exclude)) }, onClick = { menu = false; confirm = "exclude" })
                        DropdownMenuItem(text = { Text(stringResource(R.string.conv_delete)) }, onClick = { menu = false; confirm = "delete" })
                    }
                }
            },
        )
        if (autoReplyOn) {
            Text(
                stringResource(R.string.auto_on_banner), style = MaterialTheme.typography.labelMedium, color = Zuri.colors.ctx,
                modifier = Modifier.fillMaxWidth().background(Zuri.colors.ctxWeak).clickable { showAuto = true }.padding(horizontal = 16.dp, vertical = 6.dp),
            )
        }
        if (insight != null && insight.insight.worthAStrip()) InsightStrip(insight.insight) { showInsight = true }
        val list = rememberLazyListState(initialFirstVisibleItemIndex = (detail.messages.size - 1).coerceAtLeast(0))
        LaunchedEffect(detail.messages.size) { if (detail.messages.isNotEmpty()) list.animateScrollToItem(detail.messages.size - 1) }
        LazyColumn(Modifier.weight(1f).fillMaxWidth(), state = list, contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 12.dp, vertical = 8.dp)) {
            items(detail.messages.indices.toList(), key = { detail.messages[it].id.value }) { i ->
                val m = detail.messages[i]
                val prev = detail.messages.getOrNull(i - 1)
                if (prev == null || !time.sameDay(prev.sentAtMillis, m.sentAtMillis)) DayLabel(time.day(m.sentAtMillis, stringResource(R.string.today), stringResource(R.string.yesterday)))
                val showSender = s.isGroup && m.direction == Direction.INCOMING && (prev == null || prev.senderName != m.senderName || prev.direction != m.direction)
                Bubble(m, showSender, time) { selected = m }
            }
        }
        Box(Modifier.navigationBarsPadding().imePadding()) { composer() }
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
private fun Bubble(m: InboxMessage, showSender: Boolean, time: TimeContext, onLongPress: () -> Unit) {
    val mine = m.direction == Direction.OUTGOING
    val c = Zuri.colors
    val bg = if (mine) c.ctxWeak else c.surface2
    val shape = RoundedCornerShape(topStart = 18.dp, topEnd = 18.dp, bottomStart = if (mine) 18.dp else 6.dp, bottomEnd = if (mine) 6.dp else 18.dp)
    Row(Modifier.fillMaxWidth().padding(vertical = 3.dp), horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start) {
        Column(
            Modifier.widthIn(max = 300.dp).clip(shape).background(bg)
                .combinedClickable(onClick = onLongPress, onLongClick = onLongPress)
                .padding(horizontal = 12.dp, vertical = 8.dp),
        ) {
            if (showSender && m.senderName != null) Text(m.senderName!!, style = MaterialTheme.typography.labelLarge, color = c.ctx)
            val ph = m.placeholder
            if (ph == PlaceholderKind.REACTION) {
                Text(stringResource(R.string.reacted, m.placeholderDetail.orEmpty()), style = MaterialTheme.typography.bodyLarge, color = c.muted)
            } else if (ph != null) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(ph.icon(), null, tint = c.muted, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.size(6.dp))
                    Text(
                        listOfNotNull(stringResource(ph.label()), m.placeholderDetail).joinToString(" · "),
                        style = MaterialTheme.typography.bodyMedium, color = c.muted, fontStyle = FontStyle.Italic,
                    )
                }
                if (m.text != null) { Spacer(Modifier.height(4.dp)); Text(m.text!!, style = MaterialTheme.typography.bodyLarge) }
            } else {
                Text(m.text.orEmpty(), style = MaterialTheme.typography.bodyLarge)
            }
            Row(Modifier.align(Alignment.End), verticalAlignment = Alignment.CenterVertically) {
                if (m.provenance.adapterVersion == SentFromZuri.AUTO_REPLY) Text(stringResource(R.string.auto_badge) + " · ", style = MaterialTheme.typography.labelSmall, color = c.ctx)
                if (m.edited) Text(stringResource(R.string.edited) + " · ", style = MaterialTheme.typography.labelSmall, color = c.faint)
                Text(time.time(m.sentAtMillis), style = MaterialTheme.typography.labelSmall, color = c.faint)
            }
        }
    }
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
) {
    var text by rememberSaveable { mutableStateOf("") }
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
            // With a reply button a tapped draft goes in the box to edit; without one it's copied.
            onPick = { draft -> if (state.canReply) { text = draft; onPicked(draft) } else copy(draft) },
            onCopy = copy,
        )
        if (state.canReply) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                androidx.compose.material3.OutlinedTextField(
                    value = text, onValueChange = { text = it }, modifier = Modifier.weight(1f),
                    placeholder = { Text(stringResource(R.string.reply_hint)) }, maxLines = 5, shape = MaterialTheme.shapes.large,
                )
                IconButton(onClick = { onSend(text) { text = "" } }, enabled = text.isNotBlank() && !state.sending) {
                    Icon(Icons.AutoMirrored.Rounded.Send, contentDescription = stringResource(R.string.reply_send))
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
fun DraftsPanel(drafts: DraftsState, onSuggest: () -> Unit, onDismiss: () -> Unit, onPick: (String) -> Unit, onCopy: (String) -> Unit = onPick) {
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
        is DraftsState.Ready -> Column(Modifier.fillMaxWidth()) {
            Row(Modifier.padding(start = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    stringResource(if (drafts.byModel) R.string.drafts_by_model else R.string.drafts_quick),
                    style = MaterialTheme.typography.labelMedium, color = c.muted, modifier = Modifier.weight(1f),
                )
                TextButton(onClick = onDismiss) { Text(stringResource(R.string.close)) }
            }
            drafts.drafts.forEach { d ->
                Row(
                    Modifier.fillMaxWidth().padding(vertical = 3.dp).clip(RoundedCornerShape(14.dp)).background(c.ctxWeak),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        d, style = MaterialTheme.typography.bodyMedium, maxLines = 4,
                        modifier = Modifier.weight(1f).clickable { onPick(d) }.padding(start = 12.dp, top = 10.dp, bottom = 10.dp, end = 4.dp),
                    )
                    IconButton(onClick = { onCopy(d) }) { Icon(Icons.Rounded.ContentCopy, stringResource(R.string.drafts_copy), tint = c.muted, modifier = Modifier.size(20.dp)) }
                }
            }
            Spacer(Modifier.height(4.dp))
        }
    }
}
