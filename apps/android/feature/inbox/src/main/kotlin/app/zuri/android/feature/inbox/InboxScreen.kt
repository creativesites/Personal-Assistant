package app.zuri.android.feature.inbox

import androidx.compose.material.icons.rounded.Close

import androidx.compose.material.icons.rounded.Search

import androidx.compose.foundation.border

import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import app.zuri.android.core.ui.theme.SunSkin
import app.zuri.android.core.ui.theme.skinFor
import app.zuri.android.core.ui.universe.Eyebrow
import app.zuri.android.core.ui.universe.LivePill
import app.zuri.android.core.ui.universe.LoadingOrb
import app.zuri.android.core.ui.universe.Orb
import app.zuri.android.core.ui.universe.OrbitBody
import app.zuri.android.core.ui.universe.OrbitRing
import app.zuri.android.core.ui.universe.OrbitSystem
import app.zuri.android.core.ui.universe.PulseRing
import app.zuri.android.core.ui.universe.ScreenTitle
import app.zuri.android.core.ui.universe.UChip
import app.zuri.android.core.ui.universe.glass
import app.zuri.android.core.ui.universe.rise
import app.zuri.android.core.ui.universe.tiltClickable

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
    val avatars by viewModel.avatars.collectAsStateWithLifecycle()
    InboxContent(
        state, TimeContext.system(), viewModel::setFilter, onOpenConversation, onOpenSources, avatars = avatars, onNeedAvatar = viewModel::needAvatar,
        onView = viewModel::setView, onQuery = viewModel::setQuery,
    )
}

@Composable
fun InboxContent(
    state: InboxState,
    time: TimeContext,
    onFilter: (SourceKind?) -> Unit,
    onOpenConversation: (ConversationId) -> Unit,
    onOpenSources: () -> Unit,
    modifier: Modifier = Modifier,
    avatars: Map<String, androidx.compose.ui.graphics.ImageBitmap> = emptyMap(),
    onNeedAvatar: (String) -> Unit = {},
    onView: (InboxView) -> Unit = {},
    onQuery: (String) -> Unit = {},
) {
    Column(modifier.fillMaxSize()) {
        SignalsHeader(state)
        if (state.loading) { LoadingOrb(stringResource(R.string.signals_loading), Modifier.align(Alignment.CenterHorizontally)); return@Column }
        if (state.workspaceKind == WorkspaceKind.BUSINESS && state.conversations.isEmpty()) {
            EmptyState(Icons.Rounded.Work, stringResource(R.string.empty_business_t), stringResource(R.string.empty_business_b), Modifier.padding(top = 16.dp))
            return@Column
        }
        CaptureBanner(state, onOpenSources)
        if (state.conversations.isNotEmpty()) {
            // Search and quick views (web inbox parity): All / Unread / Waiting on you / Groups.
            androidx.compose.material3.TextField(
                value = state.query, onValueChange = onQuery, singleLine = true,
                placeholder = { Text(stringResource(R.string.inbox_search), color = Zuri.universe.inkMuted) },
                leadingIcon = { Icon(Icons.Rounded.Search, null, tint = Zuri.universe.inkMuted) },
                trailingIcon = { if (state.query.isNotEmpty()) androidx.compose.material3.IconButton(onClick = { onQuery("") }) { Icon(Icons.Rounded.Close, stringResource(R.string.close), tint = Zuri.universe.inkMuted) } },
                colors = androidx.compose.material3.TextFieldDefaults.colors(
                    focusedContainerColor = androidx.compose.ui.graphics.Color.Transparent, unfocusedContainerColor = androidx.compose.ui.graphics.Color.Transparent,
                    focusedIndicatorColor = androidx.compose.ui.graphics.Color.Transparent, unfocusedIndicatorColor = androidx.compose.ui.graphics.Color.Transparent,
                ),
                modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 4.dp).glass(RoundedCornerShape(22.dp)),
            )
            Row(
                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                val waiting = state.conversations.count { !it.isGroup && !it.lastFromMe }
                val unread = state.conversations.count { it.unreadCount > 0 }
                listOf(
                    InboxView.ALL to stringResource(R.string.view_all),
                    InboxView.UNREAD to stringResource(R.string.view_unread, unread),
                    InboxView.WAITING to stringResource(R.string.view_waiting, waiting),
                    InboxView.GROUPS to stringResource(R.string.view_groups),
                ).forEach { (v, label) -> FilterChip(selected = state.view == v, onClick = { onView(v) }, label = { Text(label) }) }
            }
        }
        if (state.sources.size > 1) {
            Row(
                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                // Apps: tap to show only that app, tap again to show all (the views row already has "All").
                state.sources.forEach { k ->
                    FilterChip(selected = state.filter == k, onClick = { onFilter(if (state.filter == k) null else k) }, label = { Text(stringResource(k.label())) })
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
        LazyColumn(Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = 16.dp)) {
            item(key = "constellation") { Constellation(state.visible, avatars, onOpenConversation) }
            if (state.visible.isEmpty()) item(key = "nomatch") {
                Text(stringResource(R.string.inbox_no_match), style = MaterialTheme.typography.bodyMedium, color = Zuri.universe.inkMuted, modifier = Modifier.padding(24.dp))
            }
            itemsIndexed(state.visible, key = { _, c -> c.id.value }) { i, c ->
                androidx.compose.runtime.LaunchedEffect(c.id) { onNeedAvatar(c.id.value) }
                ConversationRowView(c, time, showSource = state.sources.size > 1, workspace = state.workspaceNames[c.workspaceId], index = i, photo = avatars[c.id.value]) { onOpenConversation(c.id) }
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

/** A contact as a planet (Universe): the same skin everywhere for the same chat; an ion pulse when it waits on you. */
@Composable
internal fun Avatar(
    seed: String, title: String, isGroup: Boolean, size: androidx.compose.ui.unit.Dp = 48.dp, pulse: Boolean = false,
    photo: androidx.compose.ui.graphics.ImageBitmap? = null,
) {
    Box(Modifier.size(size + 10.dp).clearAndSetSemantics { }, contentAlignment = Alignment.Center) {
        if (pulse) PulseRing(size + 10.dp)
        if (photo != null) {
            // Their WhatsApp picture, ringed in their planet colour so they're recognisable everywhere.
            val skin = skinFor(seed)
            androidx.compose.foundation.Image(
                photo, null, contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                modifier = Modifier.size(size).clip(CircleShape)
                    .border(2.dp, androidx.compose.ui.graphics.Brush.linearGradient(listOf(skin.highlight, skin.body, skin.shadow)), CircleShape),
            )
        } else {
            Orb(size, skinFor(seed), label = if (isGroup) null else initials(title)) {
                if (isGroup) Icon(Icons.Rounded.Groups, null, tint = androidx.compose.ui.graphics.Color.White, modifier = Modifier.size(size * 0.5f))
            }
        }
    }
}

/** Header (spec §4.2): time-of-day eyebrow, "Signals", and a live pill for what's waiting. */
@Composable
private fun SignalsHeader(state: InboxState) {
    val unread = state.conversations.sumOf { it.unreadCount }
    val u = Zuri.universe
    Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 16.dp, top = 2.dp, bottom = 4.dp), verticalAlignment = Alignment.Bottom) {
        Column(Modifier.weight(1f)) {
            Eyebrow(greeting())
            ScreenTitle(stringResource(R.string.inbox_title))
        }
        if (unread > 0) LivePill(stringResource(R.string.signals_unread, unread), color = u.ion)
        else LivePill(stringResource(R.string.signals_quiet), color = u.aurora)
    }
}

/**
 * The constellation (spec §4.2): the owner's sun with the six most relevant chats (unread first,
 * then most recent) on three tilted rings, two per ring; unread planets pulse. Tap a planet to open it.
 */
@Composable
private fun Constellation(chats: List<ConversationSummary>, avatars: Map<String, androidx.compose.ui.graphics.ImageBitmap>, onOpen: (ConversationId) -> Unit) {
    if (chats.isEmpty()) return
    val top = chats.sortedWith(compareByDescending<ConversationSummary> { it.unreadCount > 0 }.thenByDescending { it.lastMessageAtMillis }).take(6)
    val radii = listOf(75.dp, 116.dp, 158.dp)
    val sizes = listOf(34.dp, 30.dp, 28.dp, 26.dp, 24.dp, 22.dp)
    val bodies = top.mapIndexed { i, c ->
        val ring = i / 2
        OrbitBody(
            key = c.id.value, skin = skinFor(c.id.value), size = sizes[i], radius = radii[ring],
            angle0 = (i % 2) * Math.PI.toFloat() + ring * 0.9f, speed = 3 - ring,
            label = if (c.isGroup) "" else initials(c.title).take(1), pulse = c.unreadCount > 0,
            image = avatars[c.id.value],
        )
    }
    val u = Zuri.universe
    OrbitSystem(
        bodies = bodies,
        rings = radii.map { OrbitRing(it, u.inkMuted.copy(alpha = 0.28f)) },
        center = SunSkin, centerSize = 46.dp, centerLabel = stringResource(R.string.you_short),
        description = stringResource(R.string.signals_constellation, top.joinToString { it.title }),
        onBody = { key -> onOpen(ConversationId(key)) },
    )
}

private fun greeting(): String = when (java.time.LocalTime.now().hour) {
    in 0..4 -> "Still up"
    in 5..11 -> "Good morning"
    in 12..16 -> "Good afternoon"
    else -> "Good evening"
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
private fun ConversationRowView(c: ConversationSummary, time: TimeContext, showSource: Boolean, workspace: String? = null, index: Int = 0, photo: androidx.compose.ui.graphics.ImageBitmap? = null, onClick: () -> Unit) {
    val u = Zuri.universe
    Row(
        Modifier.fillMaxWidth().rise(index).padding(horizontal = 14.dp, vertical = 4.dp)
            .glass(RoundedCornerShape(22.dp)).tiltClickable(onClick = onClick)
            .heightIn(min = 72.dp).padding(horizontal = 10.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box {
            Avatar(c.id.value, c.title, c.isGroup, size = 44.dp, pulse = c.unreadCount > 0, photo = photo)
            if (showSource) SourceMark(c.source, Modifier.align(Alignment.BottomEnd), size = 18.dp)
        }
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    c.title, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis, color = u.ink,
                    fontWeight = if (c.unreadCount > 0) FontWeight.ExtraBold else FontWeight.Bold, modifier = Modifier.weight(1f),
                )
                Text(time.short(c.lastMessageAtMillis), style = MaterialTheme.typography.labelMedium, color = if (c.unreadCount > 0) u.ion else u.inkMuted)
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Preview(c, Modifier.weight(1f))
                if (c.unreadCount > 0) {
                    Spacer(Modifier.width(8.dp))
                    Text(
                        c.unreadCount.toString(),
                        modifier = Modifier.clip(CircleShape).background(u.ion).padding(horizontal = 7.dp, vertical = 1.dp),
                        color = u.void, style = MaterialTheme.typography.labelSmall,
                    )
                }
            }
            if (c.isGroup || workspace != null) {
                Row(Modifier.padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    if (c.isGroup) UChip(stringResource(R.string.chip_group), u.nebulaSoft)
                    // Hybrid view: every chat shows which workspace it belongs to.
                    if (workspace != null) UChip(workspace, u.star)
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
            Text(prefix, style = MaterialTheme.typography.bodyMedium, color = Zuri.universe.inkSoft, maxLines = 1)
            Icon(ph.icon(), null, tint = Zuri.colors.muted, modifier = Modifier.size(16.dp))
            Spacer(Modifier.width(4.dp))
            Text(c.lastText ?: stringResource(ph.label()), style = MaterialTheme.typography.bodyMedium, color = Zuri.universe.inkSoft, maxLines = 1, overflow = TextOverflow.Ellipsis)
        } else {
            Text(prefix + (c.lastText ?: ""), style = MaterialTheme.typography.bodyMedium, color = Zuri.universe.inkSoft, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}
