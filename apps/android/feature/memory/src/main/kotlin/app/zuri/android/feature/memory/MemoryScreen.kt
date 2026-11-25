package app.zuri.android.feature.memory

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Bookmarks
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.zuri.android.core.ui.components.CardStyle
import app.zuri.android.core.ui.components.ConfidenceMeter
import app.zuri.android.core.ui.components.DetailTopBar
import app.zuri.android.core.ui.components.EmptyState
import app.zuri.android.core.ui.components.StatusTag
import app.zuri.android.core.ui.components.Tone
import app.zuri.android.core.ui.components.ZuriCard
import app.zuri.android.core.ui.theme.Zuri
import app.zuri.android.domain.ai.AiTier
import app.zuri.android.domain.inbox.ConversationId
import app.zuri.android.domain.memory.MemoryItem
import app.zuri.android.domain.memory.MemoryKind
import app.zuri.android.domain.memory.MemoryOrigin
import app.zuri.android.domain.memory.MemoryReview
import app.zuri.android.domain.memory.MemoryStatus
import app.zuri.android.domain.memory.PerceptionStatus
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.roundToInt

@Composable
fun MemoryRoute(onBack: () -> Unit, onOpenSource: (ConversationId) -> Unit, vm: MemoryViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    MemoryScreen(
        state = state, onBack = onBack, onTab = vm::select, onRunNow = vm::runNow, onCharging = { vm.setOnlyWhileCharging(it) },
        actions = ItemActions(
            confirm = { vm.confirm(it.id) }, done = { vm.done(it.id) }, reopen = { vm.reopen(it.id) },
            reject = { vm.reject(it.id) }, delete = { vm.delete(it.id) },
            edit = { item, text -> vm.edit(item.id, text, item.dueAtMillis) }, source = { onOpenSource(it.conversationId) },
        ),
    )
}

class ItemActions(
    val confirm: (MemoryItem) -> Unit,
    val done: (MemoryItem) -> Unit,
    val reopen: (MemoryItem) -> Unit,
    val reject: (MemoryItem) -> Unit,
    val delete: (MemoryItem) -> Unit,
    val edit: (MemoryItem, String) -> Unit,
    val source: (MemoryItem) -> Unit,
)

@Composable
fun MemoryScreen(
    state: MemoryState,
    onBack: () -> Unit,
    onTab: (MemoryTab) -> Unit,
    onRunNow: () -> Unit,
    onCharging: (Boolean) -> Unit,
    actions: ItemActions,
) {
    var editing by remember { mutableStateOf<MemoryItem?>(null) }
    Column(Modifier.fillMaxSize()) {
        DetailTopBar(stringResource(R.string.memory_title), onBack = onBack, subtitle = stringResource(R.string.memory_subtitle))
        LazyColumn(Modifier.fillMaxSize()) {
            item { StatusCard(state.status, onRunNow, onCharging) }
            item {
                LazyRow(contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(MemoryTab.entries) { t ->
                        FilterChip(selected = state.tab == t, onClick = { onTab(t) }, label = { Text(stringResource(tabLabel(t))) })
                    }
                }
            }
            if (!state.loading && state.items.isEmpty()) {
                item {
                    EmptyState(
                        Icons.Rounded.Bookmarks, stringResource(R.string.memory_empty_title),
                        stringResource(if (state.status.waitingMessages > 0) R.string.memory_empty_waiting else R.string.memory_empty_body),
                    )
                }
            }
            items(state.items, key = { it.id.value }) { item -> ItemCard(item, actions, onEdit = { editing = item }) }
            item { Spacer(Modifier.height(24.dp)) }
        }
    }
    editing?.let { item -> EditDialog(item, onDismiss = { editing = null }, onSave = { actions.edit(item, it); editing = null }, onDelete = { actions.delete(item); editing = null }) }
}

@Composable
private fun StatusCard(s: PerceptionStatus, onRunNow: () -> Unit, onCharging: (Boolean) -> Unit) {
    ZuriCard(style = CardStyle.Tinted) {
        Text(
            stringResource(if (s.tier == AiTier.STANDARD) R.string.memory_tier_standard else R.string.memory_tier_essential),
            style = MaterialTheme.typography.titleSmall,
        )
        Spacer(Modifier.height(4.dp))
        val detail = when {
            s.running -> stringResource(R.string.memory_running)
            s.waitingMessages > 0 -> pluralStringResource(R.plurals.memory_waiting, s.waitingMessages, s.waitingMessages)
            else -> stringResource(R.string.memory_up_to_date)
        }
        val last = s.lastRunAtMillis?.let { stringResource(R.string.memory_last_run, stamp(it, "EEE HH:mm")) }
        Text(listOfNotNull(detail, last).joinToString(" · "), style = MaterialTheme.typography.bodySmall, color = Zuri.colors.muted)
        Spacer(Modifier.height(8.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Button(onClick = onRunNow, enabled = !s.running && s.waitingMessages > 0) { Text(stringResource(R.string.memory_run_now)) }
            Spacer(Modifier.weight(1f))
            Text(stringResource(R.string.memory_only_charging), style = MaterialTheme.typography.bodySmall)
            Spacer(Modifier.width(8.dp))
            Switch(checked = s.onlyWhileCharging, onCheckedChange = onCharging)
        }
    }
}

@Composable
private fun ItemCard(item: MemoryItem, actions: ItemActions, onEdit: () -> Unit) {
    ZuriCard {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            StatusTag(stringResource(kindLabel(item.kind)), tone = Tone.Context)
            if (item.review == MemoryReview.SUGGESTED) StatusTag(stringResource(R.string.memory_suggested))
            Spacer(Modifier.weight(1f))
            ConfidenceMeter((item.confidence * 5).roundToInt())
        }
        Spacer(Modifier.height(6.dp))
        Text(item.text, style = MaterialTheme.typography.bodyLarge)
        val due = item.dueAtMillis?.let { stamp(it, if (item.dueHasTime) "EEE d MMM, HH:mm" else "EEE d MMM") } ?: item.dueText
        Text(
            listOfNotNull(item.personName, due?.let { stringResource(R.string.memory_due, it) }).joinToString(" · "),
            style = MaterialTheme.typography.bodySmall, color = Zuri.colors.muted,
        )
        Spacer(Modifier.height(6.dp))
        Text(
            "“${item.sourceQuote}”", style = MaterialTheme.typography.bodySmall, fontStyle = FontStyle.Italic, color = Zuri.colors.muted,
        )
        Text(
            stringResource(
                if (item.origin == MemoryOrigin.MODEL) R.string.memory_origin_model else R.string.memory_origin_rules,
                stamp(item.sourceSentAtMillis, "d MMM HH:mm"),
            ),
            style = MaterialTheme.typography.labelSmall, color = Zuri.colors.faint,
        )
        FlowRow(horizontalArrangement = Arrangement.spacedBy(0.dp)) {
            if (item.status == MemoryStatus.OPEN) {
                TextButton(onClick = { actions.done(item) }) { Text(stringResource(R.string.memory_action_done)) }
                if (item.review == MemoryReview.SUGGESTED) TextButton(onClick = { actions.confirm(item) }) { Text(stringResource(R.string.memory_action_confirm)) }
            } else {
                TextButton(onClick = { actions.reopen(item) }) { Text(stringResource(R.string.memory_action_reopen)) }
            }
            TextButton(onClick = onEdit) { Text(stringResource(R.string.memory_action_edit)) }
            TextButton(onClick = { actions.reject(item) }) { Text(stringResource(R.string.memory_action_wrong)) }
            TextButton(onClick = { actions.source(item) }) { Text(stringResource(R.string.memory_action_source)) }
        }
    }
}

@Composable
private fun EditDialog(item: MemoryItem, onDismiss: () -> Unit, onSave: (String) -> Unit, onDelete: () -> Unit) {
    var text by remember(item.id) { mutableStateOf(item.text) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.memory_edit_title)) },
        text = { OutlinedTextField(text, { text = it }, modifier = Modifier.fillMaxWidth(), minLines = 2) },
        confirmButton = { TextButton(onClick = { onSave(text) }, enabled = text.isNotBlank()) { Text(stringResource(R.string.memory_save)) } },
        dismissButton = {
            Row {
                TextButton(onClick = onDelete) { Text(stringResource(R.string.memory_delete), color = Zuri.colors.bad) }
                TextButton(onClick = onDismiss) { Text(stringResource(R.string.memory_cancel)) }
            }
        },
    )
}

private fun tabLabel(t: MemoryTab) = when (t) {
    MemoryTab.PROMISES -> R.string.memory_tab_promises
    MemoryTab.OWED -> R.string.memory_tab_owed
    MemoryTab.EVENTS -> R.string.memory_tab_events
    MemoryTab.PEOPLE -> R.string.memory_tab_people
    MemoryTab.DONE -> R.string.memory_tab_done
}

private fun kindLabel(k: MemoryKind) = when (k) {
    MemoryKind.MY_PROMISE -> R.string.memory_kind_my_promise
    MemoryKind.THEIR_PROMISE -> R.string.memory_kind_their_promise
    MemoryKind.REQUEST_TO_ME -> R.string.memory_kind_request
    MemoryKind.EVENT -> R.string.memory_kind_event
    MemoryKind.FACT -> R.string.memory_kind_fact
}

private fun stamp(millis: Long, pattern: String): String =
    DateTimeFormatter.ofPattern(pattern, Locale.getDefault()).format(Instant.ofEpochMilli(millis).atZone(ZoneId.systemDefault()))
