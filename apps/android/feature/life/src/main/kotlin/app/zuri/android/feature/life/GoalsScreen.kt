package app.zuri.android.feature.life

import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Flag
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.zuri.android.core.ui.components.EmptyState
import app.zuri.android.core.ui.theme.Zuri
import app.zuri.android.core.ui.theme.initialOf
import app.zuri.android.core.ui.theme.skinFor
import app.zuri.android.core.ui.universe.Eyebrow
import app.zuri.android.core.ui.universe.GhostButton
import app.zuri.android.core.ui.universe.LaunchButton
import app.zuri.android.core.ui.universe.Orb
import app.zuri.android.core.ui.universe.UChip
import app.zuri.android.core.ui.universe.glass
import app.zuri.android.core.ui.universe.rise
import app.zuri.android.core.ui.universe.tiltClickable
import app.zuri.android.domain.people.Goal
import app.zuri.android.domain.people.GoalStatus
import app.zuri.android.domain.people.Relationship

/** Goals (M6): what the owner is working toward, the people it involves, and how far along it is. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GoalsRoute(onBack: () -> Unit, viewModel: GoalsViewModel = hiltViewModel()) {
    val goals by viewModel.list.collectAsStateWithLifecycle()
    val people by viewModel.people.collectAsStateWithLifecycle()
    var creating by rememberSaveable { mutableStateOf(false) }
    var open by remember { mutableStateOf<String?>(null) }
    GoalsContent(goals, onBack, onNew = { creating = true }, onOpen = { open = it.id })
    if (creating) NewGoalDialog(onDismiss = { creating = false }) { t, w -> viewModel.create(t, w, null); creating = false }
    val g = goals?.firstOrNull { it.id == open }
    if (g != null) ModalBottomSheet(onDismissRequest = { open = null }) {
        GoalSheet(g, people, viewModel, onClose = { open = null })
    }
}

@Composable
fun GoalsContent(goals: List<Goal>?, onBack: () -> Unit, onNew: () -> Unit = {}, onOpen: (Goal) -> Unit = {}) {
    Column(Modifier.fillMaxSize()) {
        LifeHeader(stringResource(R.string.goals_eyebrow), stringResource(R.string.goals_title), onBack)
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
            item("new") { LaunchButton(stringResource(R.string.goals_new), onNew, Modifier.padding(horizontal = 16.dp, vertical = 8.dp), height = 50.dp) }
            if (goals != null && goals.isEmpty()) item("empty") {
                EmptyState(Icons.Rounded.Flag, stringResource(R.string.goals_empty_t), stringResource(R.string.goals_empty_b), Modifier.padding(top = 8.dp))
            }
            itemsIndexed(goals.orEmpty(), key = { _, g -> g.id }) { i, g -> GoalCard(g, i) { onOpen(g) } }
        }
    }
}

@Composable
private fun GoalCard(g: Goal, index: Int, onClick: () -> Unit) {
    val u = Zuri.universe
    Column(
        Modifier.fillMaxWidth().rise(index).padding(horizontal = 14.dp, vertical = 5.dp).glass(RoundedCornerShape(22.dp))
            .tiltClickable(onClick = onClick).padding(16.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(g.title, style = MaterialTheme.typography.titleLarge, color = u.ink, modifier = Modifier.weight(1f), maxLines = 2, overflow = TextOverflow.Ellipsis)
            UChip(stringResource(statusLabel(g.status)), statusColor(g.status))
        }
        g.why?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = u.inkSoft, maxLines = 2, modifier = Modifier.padding(top = 2.dp)) }
        Spacer(Modifier.height(10.dp))
        LinearProgressIndicator(progress = { g.progress / 100f }, modifier = Modifier.fillMaxWidth().height(6.dp), color = statusColor(g.status), trackColor = u.glassBorder)
        Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("${g.progress}%", style = MaterialTheme.typography.labelLarge, color = u.inkMuted, modifier = Modifier.weight(1f))
            g.people.take(5).forEach { p -> Orb(24.dp, skinFor(p.conversationId.value), Modifier.padding(start = 2.dp), label = initialOf(p.name)) }
        }
    }
}

@Composable
private fun statusColor(s: GoalStatus) = when (s) { GoalStatus.ACTIVE -> Zuri.universe.ion; GoalStatus.ACHIEVED -> Zuri.universe.aurora; GoalStatus.PAUSED -> Zuri.universe.inkMuted }
private fun statusLabel(s: GoalStatus) = when (s) { GoalStatus.ACTIVE -> R.string.goal_active; GoalStatus.ACHIEVED -> R.string.goal_achieved; GoalStatus.PAUSED -> R.string.goal_paused }

@Composable
private fun NewGoalDialog(onDismiss: () -> Unit, onCreate: (String, String?) -> Unit) {
    var title by rememberSaveable { mutableStateOf("") }
    var why by rememberSaveable { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.goals_new)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(title, { title = it }, label = { Text(stringResource(R.string.goal_title_hint)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(why, { why = it }, label = { Text(stringResource(R.string.goal_why_hint)) }, maxLines = 3, modifier = Modifier.fillMaxWidth())
            }
        },
        confirmButton = { TextButton(onClick = { onCreate(title, why) }, enabled = title.isNotBlank()) { Text(stringResource(R.string.goal_create)) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.life_cancel)) } },
    )
}

@Composable
private fun GoalSheet(g: Goal, people: List<Relationship>, vm: GoalsViewModel, onClose: () -> Unit) {
    val u = Zuri.universe
    var progress by remember(g.id) { mutableFloatStateOf(g.progress.toFloat()) }
    val events by vm.events(g.id).collectAsStateWithLifecycle(emptyList())
    Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(bottom = 28.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(g.title, style = MaterialTheme.typography.headlineSmall, color = u.ink)
        g.why?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = u.inkSoft) }
        Eyebrow(stringResource(R.string.goal_progress, progress.toInt()))
        Slider(progress, { progress = (it / 5).toInt() * 5f }, valueRange = 0f..100f, onValueChangeFinished = { vm.setProgress(g.id, progress.toInt()) })
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            GoalStatus.entries.forEach { s -> FilterChip(selected = g.status == s, onClick = { vm.setStatus(g.id, s) }, label = { Text(stringResource(statusLabel(s))) }) }
        }
        if (people.isNotEmpty()) {
            Eyebrow(stringResource(R.string.goal_people))
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                people.take(30).forEach { p ->
                    val on = g.people.any { it.conversationId == p.conversationId }
                    FilterChip(selected = on, onClick = { vm.link(g.id, p.conversationId, !on) }, label = { Text(p.name, maxLines = 1) },
                        leadingIcon = { Orb(20.dp, skinFor(p.conversationId.value)) })
                }
            }
        }
        if (events.isNotEmpty()) {
            Eyebrow(stringResource(R.string.goal_history))
            events.take(8).forEach { e ->
                Text(
                    listOfNotNull(stringResource(eventLabel(e.kind)), e.detail).joinToString(" · ") + " — " +
                        java.time.format.DateTimeFormatter.ofPattern("d MMM", java.util.Locale.getDefault()).format(java.time.Instant.ofEpochMilli(e.atMillis).atZone(java.time.ZoneId.systemDefault())),
                    style = MaterialTheme.typography.bodySmall, color = u.inkMuted,
                )
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            GhostButton(stringResource(R.string.life_done), onClose, Modifier.weight(1f))
            TextButton(onClick = { vm.delete(g.id); onClose() }, modifier = Modifier.heightIn(min = 48.dp)) { Text(stringResource(R.string.life_delete), color = MaterialTheme.colorScheme.error) }
        }
    }
}

private fun eventLabel(kind: String) = when (kind) {
    "CREATED" -> R.string.goal_ev_created; "PROGRESS" -> R.string.goal_ev_progress; "ACHIEVED" -> R.string.goal_ev_achieved
    "PAUSED" -> R.string.goal_ev_paused; "RESUMED" -> R.string.goal_ev_resumed; else -> R.string.goal_ev_note
}

