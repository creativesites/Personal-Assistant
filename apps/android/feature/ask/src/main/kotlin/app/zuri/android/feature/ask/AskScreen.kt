package app.zuri.android.feature.ask

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Send
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.SearchOff
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SuggestionChip
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.zuri.android.core.ui.components.CardStyle
import app.zuri.android.core.ui.components.EmptyState
import app.zuri.android.core.ui.components.SectionHeader
import app.zuri.android.core.ui.components.StatusTag
import app.zuri.android.core.ui.components.Tone
import app.zuri.android.core.ui.components.ZuriCard
import app.zuri.android.core.ui.theme.Zuri
import app.zuri.android.domain.inbox.ConversationId
import app.zuri.android.domain.memory.AskAnswer
import app.zuri.android.domain.memory.AskSource
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

@Composable
fun AskRoute(onOpenSource: (ConversationId) -> Unit, vm: AskViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val scope by vm.scopeLabel.collectAsStateWithLifecycle()
    AskScreen(state, onEdit = vm::edit, onSubmit = { vm.submit(it) }, onOpenSource = onOpenSource, scopeLabel = scope, onWiden = vm::widenToPersonal)
}

@Composable
fun AskScreen(
    state: AskState,
    onEdit: (String) -> Unit,
    onSubmit: (String) -> Unit,
    onOpenSource: (ConversationId) -> Unit,
    scopeLabel: String = "",
    onWiden: () -> Unit = {},
) {
    Column(Modifier.fillMaxSize().imePadding()) {
        val label = state.scopeLabel.ifEmpty { scopeLabel }
        if (label.isNotEmpty()) {
            Text(
                stringResource(if (state.widened) R.string.ask_scope_widened else R.string.ask_scope, label),
                style = MaterialTheme.typography.labelMedium,
                color = if (state.widened) Zuri.colors.warn else Zuri.colors.muted,
                modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 4.dp),
            )
        }
        LazyColumn(Modifier.weight(1f).fillMaxWidth()) {
            when {
                state.asked == null -> item { Intro(onSubmit) }
                else -> {
                    item {
                        Text(state.asked, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(horizontal = 20.dp, vertical = 12.dp))
                    }
                    if (state.thinking) item { Thinking() }
                    when (val a = state.answer) {
                        is AskAnswer.Answered -> {
                            item { AnswerCard(a) }
                            item { SectionHeader(stringResource(R.string.ask_sources)) }
                            items(a.sources, key = { it.number }) { SourceCard(it, onOpenSource) }
                        }
                        is AskAnswer.NotFound -> {
                            item {
                                EmptyState(Icons.Rounded.SearchOff, stringResource(R.string.ask_not_found_title), stringResource(R.string.ask_not_found_body))
                            }
                            if (a.closest.isNotEmpty()) {
                                item { SectionHeader(stringResource(R.string.ask_closest)) }
                                items(a.closest, key = { it.number }) { SourceCard(it, onOpenSource) }
                            }
                        }
                        null -> Unit
                    }
                    if (state.canWiden && !state.thinking && state.answer != null) {
                        item {
                            androidx.compose.material3.TextButton(onClick = onWiden, modifier = Modifier.padding(horizontal = 12.dp)) {
                                Text(stringResource(R.string.ask_widen))
                            }
                        }
                    }
                }
            }
            item { Spacer(Modifier.height(16.dp)) }
        }
        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(
                value = state.question, onValueChange = onEdit, modifier = Modifier.weight(1f),
                placeholder = { Text(stringResource(R.string.ask_hint)) }, maxLines = 4,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                keyboardActions = KeyboardActions(onSend = { onSubmit(state.question) }),
                shape = MaterialTheme.shapes.large,
            )
            IconButton(onClick = { onSubmit(state.question) }, enabled = state.question.isNotBlank() && !state.thinking) {
                Icon(Icons.AutoMirrored.Rounded.Send, contentDescription = stringResource(R.string.ask_send))
            }
        }
    }
}

@Composable
private fun Intro(onSubmit: (String) -> Unit) {
    Column {
        EmptyState(Icons.Rounded.AutoAwesome, stringResource(R.string.ask_intro_title), stringResource(R.string.ask_intro_body))
        FlowRow(Modifier.padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(R.string.ask_suggest_promises, R.string.ask_suggest_owed, R.string.ask_suggest_week).forEach { res ->
                val q = stringResource(res)
                SuggestionChip(onClick = { onSubmit(q) }, label = { Text(q) })
            }
        }
    }
}

@Composable
private fun Thinking() {
    Row(Modifier.padding(horizontal = 20.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
        Text(stringResource(R.string.ask_thinking), modifier = Modifier.padding(start = 10.dp), color = Zuri.colors.muted)
    }
}

@Composable
private fun AnswerCard(a: AskAnswer.Answered) {
    ZuriCard(style = CardStyle.Tinted) {
        Text(a.text, style = MaterialTheme.typography.bodyLarge)
        Spacer(Modifier.height(8.dp))
        StatusTag(stringResource(if (a.byModel) R.string.ask_by_model else R.string.ask_by_rules), tone = Tone.Ok)
    }
}

@Composable
private fun SourceCard(s: AskSource, onOpen: (ConversationId) -> Unit) {
    ZuriCard(onClick = { onOpen(s.conversationId) }) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            StatusTag("${s.number}", tone = Tone.Context)
            Text(
                "  ${s.speaker} · ${s.conversationTitle} · " + DateTimeFormatter.ofPattern("d MMM HH:mm", Locale.getDefault()).format(Instant.ofEpochMilli(s.sentAtMillis).atZone(ZoneId.systemDefault())),
                style = MaterialTheme.typography.labelMedium, color = Zuri.colors.muted,
            )
        }
        Spacer(Modifier.height(4.dp))
        Text(s.text, style = MaterialTheme.typography.bodyMedium, maxLines = 4)
    }
}
