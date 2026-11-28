package app.zuri.android.feature.people

import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.Send
import androidx.compose.material.icons.rounded.Groups
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.zuri.android.core.ui.components.EmptyState
import app.zuri.android.core.ui.theme.OutgoingGradient
import app.zuri.android.core.ui.theme.Zuri
import app.zuri.android.core.ui.theme.initialOf
import app.zuri.android.core.ui.theme.skinFor
import app.zuri.android.core.ui.universe.Eyebrow
import app.zuri.android.core.ui.universe.LaunchButton
import app.zuri.android.core.ui.universe.LoadingOrb
import app.zuri.android.core.ui.universe.Orb
import app.zuri.android.core.ui.universe.ScreenTitle
import app.zuri.android.core.ui.universe.UChip
import app.zuri.android.core.ui.universe.deepCard
import app.zuri.android.core.ui.universe.glass
import app.zuri.android.core.ui.universe.rise
import app.zuri.android.core.ui.universe.tiltClickable
import app.zuri.android.domain.cloud.CloudAvatars
import app.zuri.android.domain.cloud.KeepWarmNudge
import app.zuri.android.domain.cloud.NetworkContact
import app.zuri.android.domain.cloud.NetworkOverview
import app.zuri.android.domain.cloud.NetworkSuggestion
import app.zuri.android.domain.cloud.Networking
import app.zuri.android.domain.cloud.Warmth
import app.zuri.android.domain.inbox.ConversationId
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class NetworkState(val loading: Boolean = true, val overview: NetworkOverview? = null, val busy: Set<String> = emptySet(), val notice: String? = null)

@HiltViewModel
class NetworkViewModel @Inject constructor(private val net: Networking, val avatars: CloudAvatars) : ViewModel() {
    private val _state = MutableStateFlow(NetworkState())
    val state: StateFlow<NetworkState> = _state

    fun load() = viewModelScope.launch { _state.value = _state.value.copy(loading = false, overview = net.overview()) }
    private fun act(key: String, block: suspend () -> Unit) = viewModelScope.launch {
        _state.value = _state.value.copy(busy = _state.value.busy + key)
        runCatching { block() }.onFailure { _state.value = _state.value.copy(notice = it.message) }
        _state.value = _state.value.copy(busy = _state.value.busy - key, overview = net.overview())
    }
    fun send(n: KeepWarmNudge) = act(n.id) { if (!net.sendNudge(n, n.messages)) error("Couldn't send. Open the chat and send it from there.") }
    fun snooze(n: KeepWarmNudge) = act(n.id) { net.snooze(n.id) }
    fun dismiss(n: KeepWarmNudge) = act(n.id) { net.dismissNudge(n.id) }
    fun add(s: NetworkSuggestion, key: Boolean) = act(s.contactId) { net.add(s.contactId, key, null) }
    fun notThem(s: NetworkSuggestion) = act(s.contactId) { net.dismissSuggestion(s.contactId) }
    fun remove(c: NetworkContact) = act(c.contactId) { net.remove(c.contactId) }
    fun makeNow() = act("run") { net.makeNudgesNow() }
}

/**
 * Network (Part C): the people the owner wants to keep warm. Warmth comes from each chat's own
 * rhythm; nudges carry a ready opener in the owner's voice, sent only when the owner taps Send.
 */
@Composable
fun NetworkRoute(onBack: () -> Unit, onOpenConversation: (ConversationId) -> Unit, viewModel: NetworkViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { viewModel.load() }
    val u = Zuri.universe
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().statusBarsPadding().padding(start = 4.dp, end = 12.dp, top = 4.dp), verticalAlignment = Alignment.Bottom) {
            IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, stringResource(R.string.net_back), tint = u.ink) }
            Column(Modifier.weight(1f).padding(start = 4.dp)) {
                Eyebrow(stringResource(R.string.net_eyebrow))
                ScreenTitle(stringResource(R.string.net_title))
            }
        }
        val o = state.overview
        when {
            state.loading -> LoadingOrb(stringResource(R.string.net_loading), Modifier.align(Alignment.CenterHorizontally))
            o == null -> EmptyState(Icons.Rounded.Groups, stringResource(R.string.net_offline_t), stringResource(R.string.net_offline_b), Modifier.padding(top = 16.dp))
            else -> NetworkContent(o, state, viewModel, onOpenConversation)
        }
    }
}

@Composable
private fun NetworkContent(o: NetworkOverview, state: NetworkState, vm: NetworkViewModel, onOpen: (ConversationId) -> Unit) {
    val u = Zuri.universe
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
        item("counts") {
            Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                UChip(stringResource(R.string.net_warm, o.counts[Warmth.WARM] ?: 0), u.aurora)
                UChip(stringResource(R.string.net_cooling, o.counts[Warmth.COOLING] ?: 0), u.star)
                UChip(stringResource(R.string.net_cold, o.counts[Warmth.COLD] ?: 0), u.ember)
            }
            state.notice?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(horizontal = 20.dp)) }
        }
        if (o.nudges.isNotEmpty()) {
            item("nh") { Eyebrow(stringResource(R.string.net_nudges), Modifier.padding(start = 20.dp, top = 12.dp, bottom = 4.dp), color = u.star) }
            itemsIndexed(o.nudges, key = { _, n -> "n" + n.id }) { i, n -> NudgeCard(n, i, n.id in state.busy, vm, onOpen) }
        } else if (o.contacts.isNotEmpty()) item("run") {
            TextButton(onClick = vm::makeNow, enabled = "run" !in state.busy, modifier = Modifier.padding(horizontal = 12.dp)) { Text(stringResource(R.string.net_make_now)) }
        }
        if (o.contacts.isNotEmpty()) {
            item("wh") { Eyebrow(stringResource(R.string.net_warm_list), Modifier.padding(start = 20.dp, top = 14.dp, bottom = 4.dp)) }
            itemsIndexed(o.contacts, key = { _, c -> "c" + c.contactId }) { i, c -> WarmRow(c, i, vm, onOpen) }
        }
        if (o.suggestions.isNotEmpty()) {
            item("sh") {
                Eyebrow(stringResource(R.string.net_suggestions), Modifier.padding(start = 20.dp, top = 14.dp))
                Text(stringResource(R.string.net_suggestions_b), style = MaterialTheme.typography.bodySmall, color = u.inkMuted, modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp))
            }
            itemsIndexed(o.suggestions, key = { _, s -> "s" + s.contactId }) { i, s -> SuggestionRow(s, i, s.contactId in state.busy, vm) }
        }
        if (o.contacts.isEmpty() && o.suggestions.isEmpty()) item("empty") {
            EmptyState(Icons.Rounded.Groups, stringResource(R.string.net_empty_t), stringResource(R.string.net_empty_b), Modifier.padding(top = 16.dp))
        }
    }
}

@Composable
private fun ContactAvatar(vm: NetworkViewModel, contactId: String, tag: String?, name: String, size: Dp) {
    val photo by produceState<ImageBitmap?>(null, contactId, tag) {
        value = vm.avatars.forContact(contactId, tag)?.let { b -> withContext(Dispatchers.Default) { BitmapFactory.decodeByteArray(b, 0, b.size)?.asImageBitmap() } }
    }
    val skin = skinFor(contactId)
    val p = photo
    if (p != null) Image(p, null, contentScale = ContentScale.Crop, modifier = Modifier.size(size).clip(CircleShape).border(2.dp, Brush.linearGradient(listOf(skin.highlight, skin.body, skin.shadow)), CircleShape))
    else Orb(size, skin, label = initialOf(name))
}

@Composable
private fun warmColor(w: Warmth) = when (w) { Warmth.WARM -> Zuri.universe.aurora; Warmth.COOLING -> Zuri.universe.star; Warmth.COLD -> Zuri.universe.ember; Warmth.NEW -> Zuri.universe.inkMuted }

@Composable
private fun NudgeCard(n: KeepWarmNudge, index: Int, busy: Boolean, vm: NetworkViewModel, onOpen: (ConversationId) -> Unit) {
    val u = Zuri.universe
    Column(Modifier.fillMaxWidth().rise(index).padding(horizontal = 14.dp, vertical = 5.dp).deepCard(RoundedCornerShape(24.dp)).padding(14.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            ContactAvatar(vm, n.contactId, n.avatarTag, n.name, 40.dp)
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(n.name, style = MaterialTheme.typography.titleMedium, color = u.ink, maxLines = 1)
                n.reason?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = u.inkSoft, maxLines = 2) }
            }
            if (n.skippedBefore > 0) UChip(stringResource(R.string.net_skipped, n.skippedBefore), u.ember)
        }
        Spacer(Modifier.height(10.dp))
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            n.messages.forEach { m ->
                Text(m, style = MaterialTheme.typography.bodyMedium, color = Color.White,
                    modifier = Modifier.clip(RoundedCornerShape(16.dp)).background(Brush.linearGradient(OutgoingGradient)).padding(horizontal = 12.dp, vertical = 7.dp))
            }
        }
        Spacer(Modifier.height(10.dp))
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            LaunchButton(stringResource(R.string.net_send), { vm.send(n) }, Modifier.weight(1f), height = 46.dp, loading = busy,
                icon = { Icon(Icons.AutoMirrored.Rounded.Send, null, tint = Color.White, modifier = Modifier.size(18.dp)) })
            n.conversationId?.let { c -> TextButton(onClick = { onOpen(ConversationId(c)) }) { Text(stringResource(R.string.net_edit), color = u.ion) } }
            TextButton(onClick = { vm.snooze(n) }, enabled = !busy) { Text(stringResource(R.string.net_snooze), color = u.inkMuted) }
            TextButton(onClick = { vm.dismiss(n) }, enabled = !busy) { Text(stringResource(R.string.net_skip), color = u.inkMuted) }
        }
    }
}

@Composable
private fun WarmRow(c: NetworkContact, index: Int, vm: NetworkViewModel, onOpen: (ConversationId) -> Unit) {
    val u = Zuri.universe
    val color = warmColor(c.status)
    Row(
        Modifier.fillMaxWidth().rise(index).padding(horizontal = 14.dp, vertical = 4.dp).glass(RoundedCornerShape(22.dp))
            .then(if (c.conversationId != null) Modifier.tiltClickable { onOpen(ConversationId(c.conversationId!!)) } else Modifier)
            .heightIn(min = 72.dp).padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        ContactAvatar(vm, c.contactId, c.avatarTag, c.name, 44.dp)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(c.name, style = MaterialTheme.typography.titleMedium, color = u.ink, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                Text("${c.warmth}", style = MaterialTheme.typography.titleLarge, color = color)
            }
            // The warmth bar.
            LinearProgressIndicator(progress = { c.warmth / 100f }, modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp).height(5.dp).clip(RoundedCornerShape(3.dp)), color = color, trackColor = u.glassBorder)
            c.reasons.firstOrNull()?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = u.inkSoft, maxLines = 2) }
            Row(Modifier.padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                if (c.waitingOnYou) UChip(stringResource(R.string.net_waiting), u.ion)
                c.tier?.let { UChip(if (it == "key") stringResource(R.string.net_key) else stringResource(R.string.net_important), u.nebulaSoft) }
                c.role?.let { UChip(it.replaceFirstChar(Char::uppercase), u.inkMuted) }
            }
        }
    }
}

@Composable
private fun SuggestionRow(s: NetworkSuggestion, index: Int, busy: Boolean, vm: NetworkViewModel) {
    val u = Zuri.universe
    Column(Modifier.fillMaxWidth().rise(index).padding(horizontal = 14.dp, vertical = 4.dp).glass(RoundedCornerShape(22.dp)).padding(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            ContactAvatar(vm, s.contactId, s.avatarTag, s.name, 40.dp)
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(s.name, style = MaterialTheme.typography.titleMedium, color = u.ink, maxLines = 1)
                Text(listOfNotNull(s.subtitle, s.why.firstOrNull()).joinToString(" · "), style = MaterialTheme.typography.bodySmall, color = u.inkSoft, maxLines = 2)
            }
        }
        Row(horizontalArrangement = Arrangement.End, modifier = Modifier.fillMaxWidth()) {
            TextButton(onClick = { vm.notThem(s) }, enabled = !busy) { Text(stringResource(R.string.net_not_them), color = u.inkMuted) }
            TextButton(onClick = { vm.add(s, key = false) }, enabled = !busy) { Text(stringResource(R.string.net_add_important)) }
            TextButton(onClick = { vm.add(s, key = true) }, enabled = !busy) { Text(stringResource(R.string.net_add_key), color = u.aurora) }
        }
    }
}
