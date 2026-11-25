package app.zuri.android.feature.inbox

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Forum
import androidx.compose.material.icons.rounded.Groups
import androidx.compose.material.icons.rounded.Sensors
import androidx.compose.material.icons.rounded.WarningAmber
import androidx.compose.material.icons.rounded.Work
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.zuri.android.core.ui.capture.SourceMark
import app.zuri.android.core.ui.capture.icon
import app.zuri.android.core.ui.capture.label
import app.zuri.android.core.ui.components.CardStyle
import app.zuri.android.core.ui.components.EmptyState
import app.zuri.android.core.ui.components.ZuriCard
import app.zuri.android.core.ui.theme.Zuri
import app.zuri.android.domain.capture.CaptureHealth
import app.zuri.android.domain.capture.SourceKind
import app.zuri.android.domain.inbox.ConversationId
import app.zuri.android.domain.inbox.ConversationSummary
import app.zuri.android.domain.workspace.WorkspaceKind

/** P02 Inbox: every captured conversation in the active workspace, newest first. */
@Composable
fun InboxRoute(onOpenConversation: (ConversationId) -> Unit, onOpenSources: () -> Unit, viewModel: InboxViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LifecycleResumeEffect(Unit) {
        viewModel.refresh()
        onPauseOrDispose { }
    }
    InboxContent(state, TimeContext.system(), viewModel::setFilter, onOpenConversation, onOpenSources)
}

@Composable
fun InboxContent(
    state: InboxState,
    time: TimeContext,
    onFilter: (SourceKind?) -> Unit,
    onOpenConversation: (ConversationId) -> Unit,
    onOpenSources: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier.fillMaxSize()) {
        Text(stringResource(R.string.inbox_title), style = MaterialTheme.typography.headlineLarge, modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp))
        if (state.loading) return@Column
        if (state.workspaceKind == WorkspaceKind.BUSINESS) {
            EmptyState(Icons.Rounded.Work, stringResource(R.string.empty_business_t), stringResource(R.string.empty_business_b), Modifier.padding(top = 16.dp))
            return@Column
        }
        CaptureBanner(state, onOpenSources)
        if (state.sources.size > 1) {
            Row(
                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                FilterChip(selected = state.filter == null, onClick = { onFilter(null) }, label = { Text(stringResource(R.string.filter_all)) })
                state.sources.forEach { k ->
                    FilterChip(selected = state.filter == k, onClick = { onFilter(k) }, label = { Text(stringResource(k.label())) })
                }
            }
        }
        if (state.conversations.isEmpty()) {
            val enabled = state.status.enabledSources
            if (enabled.isEmpty()) {
                EmptyState(
                    Icons.Rounded.Forum, stringResource(R.string.empty_off_t), stringResource(R.string.empty_off_b), Modifier.padding(top = 16.dp),
                    action = { Button(onClick = onOpenSources) { Text(stringResource(R.string.empty_off_cta)) } },
                )
            } else {
                val names = enabled.sortedBy { it.ordinal }.map { stringResource(it.label()) }.joinToString(", ")
                EmptyState(Icons.Rounded.Sensors, stringResource(R.string.empty_waiting_t), stringResource(R.string.empty_waiting_b, names), Modifier.padding(top = 16.dp))
            }
            return@Column
        }
        LazyColumn(Modifier.fillMaxSize()) {
            items(state.visible, key = { it.id.value }) { c ->
                ConversationRowView(c, time, showSource = state.sources.size > 1) { onOpenConversation(c.id) }
                HorizontalDivider(Modifier.padding(start = 76.dp), color = Zuri.colors.line)
            }
        }
    }
}

@Composable
private fun CaptureBanner(state: InboxState, onFix: () -> Unit) {
    val s = state.status
    if (s.enabledSources.isEmpty()) return
    val text = when {
        s.paused -> R.string.banner_paused
        s.state == CaptureHealth.NEEDS_ACCESS -> R.string.banner_access
        s.state == CaptureHealth.DISCONNECTED -> R.string.banner_disconnected
        else -> return
    }
    ZuriCard(style = CardStyle.Flat) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Rounded.WarningAmber, null, tint = Zuri.colors.warn)
            Spacer(Modifier.width(10.dp))
            Text(stringResource(text), style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
            TextButton(onClick = onFix) { Text(stringResource(R.string.banner_fix)) }
        }
    }
}

@Composable
internal fun Avatar(title: String, isGroup: Boolean, size: androidx.compose.ui.unit.Dp = 48.dp) {
    val c = Zuri.colors
    Box(Modifier.size(size).clip(CircleShape).background(c.ctxWeak).clearAndSetSemantics { }, contentAlignment = Alignment.Center) {
        if (isGroup) Icon(Icons.Rounded.Groups, null, tint = c.ctxInk)
        else Text(initials(title), color = c.ctxInk, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
    }
}

internal fun initials(title: String): String {
    val words = title.split(Regex("\\s+")).filter { w -> w.firstOrNull()?.isLetterOrDigit() == true }
    return when {
        words.isEmpty() -> "#"
        words.size == 1 -> words[0].take(1).uppercase()
        else -> (words[0].take(1) + words[1].take(1)).uppercase()
    }
}

@Composable
private fun ConversationRowView(c: ConversationSummary, time: TimeContext, showSource: Boolean, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = 72.dp).clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box {
            Avatar(c.title, c.isGroup)
            if (showSource) SourceMark(c.source, Modifier.align(Alignment.BottomEnd), size = 18.dp)
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    c.title, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    fontWeight = if (c.unreadCount > 0) FontWeight.Bold else FontWeight.SemiBold, modifier = Modifier.weight(1f),
                )
                Text(time.short(c.lastMessageAtMillis), style = MaterialTheme.typography.labelMedium, color = if (c.unreadCount > 0) Zuri.colors.ctx else Zuri.colors.muted)
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Preview(c, Modifier.weight(1f))
                if (c.unreadCount > 0) {
                    Spacer(Modifier.width(8.dp))
                    Text(
                        stringResource(R.string.unread_count, c.unreadCount),
                        modifier = Modifier.clip(CircleShape).background(Zuri.colors.ctx).padding(horizontal = 8.dp, vertical = 2.dp),
                        color = MaterialTheme.colorScheme.onPrimary, style = MaterialTheme.typography.labelSmall,
                    )
                }
            }
        }
    }
}

@Composable
private fun Preview(c: ConversationSummary, modifier: Modifier) {
    val prefix = when {
        c.lastFromMe -> stringResource(R.string.you) + ": "
        c.isGroup && c.lastSenderName != null -> c.lastSenderName + ": "
        else -> ""
    }
    Row(modifier, verticalAlignment = Alignment.CenterVertically) {
        val ph = c.lastPlaceholder
        if (ph != null) {
            Text(prefix, style = MaterialTheme.typography.bodyMedium, color = Zuri.colors.muted, maxLines = 1)
            Icon(ph.icon(), null, tint = Zuri.colors.muted, modifier = Modifier.size(16.dp))
            Spacer(Modifier.width(4.dp))
            Text(c.lastText ?: stringResource(ph.label()), style = MaterialTheme.typography.bodyMedium, color = Zuri.colors.muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
        } else {
            Text(prefix + (c.lastText ?: ""), style = MaterialTheme.typography.bodyMedium, color = Zuri.colors.muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}
