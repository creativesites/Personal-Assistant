package app.zuri.android.feature.inbox

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import app.zuri.android.core.ui.theme.Zuri
import app.zuri.android.domain.inbox.ConversationInsight
import app.zuri.android.domain.inbox.Mood

fun Mood.label(): Int = when (this) {
    Mood.WARM -> R.string.mood_warm
    Mood.NEUTRAL -> R.string.mood_neutral
    Mood.LOW -> R.string.mood_low
    Mood.TENSE -> R.string.mood_tense
}

/** Worth showing above the chat: it's the owner's turn with questions waiting, or the mood has turned. */
fun ConversationInsight.worthAStrip(): Boolean = (yourTurn && unansweredQuestions.isNotEmpty()) || mood == Mood.TENSE || mood == Mood.LOW

/** The one-line strip above the chat; opens the sheet. */
@Composable
fun InsightStrip(insight: ConversationInsight, onOpen: () -> Unit) {
    val parts = buildList {
        if (insight.yourTurn) add(stringResource(R.string.insight_your_turn))
        if (insight.yourTurn && insight.unansweredQuestions.isNotEmpty()) {
            add(pluralStringResource(R.plurals.insight_questions, insight.unansweredQuestions.size, insight.unansweredQuestions.size))
        }
        insight.mood?.takeIf { it == Mood.TENSE || it == Mood.LOW }?.let { add(stringResource(it.label())) }
    }
    Text(
        parts.joinToString(" · "), style = MaterialTheme.typography.labelMedium, color = Zuri.colors.ctx,
        modifier = Modifier.fillMaxWidth().background(Zuri.colors.surface2).clickable(onClick = onOpen).padding(horizontal = 16.dp, vertical = 6.dp),
    )
}

/** "About this chat": the summary (written on request), open questions, what was agreed, and the mood. */
@Composable
fun InsightContent(state: InsightState, time: TimeContext, onSummarize: () -> Unit) {
    val i = state.insight
    val c = Zuri.colors
    Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 22.dp).navigationBarsPadding()) {
        Text(stringResource(R.string.insight_title), style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(12.dp))

        Text(stringResource(R.string.insight_summary), style = MaterialTheme.typography.titleSmall)
        Spacer(Modifier.height(4.dp))
        i.topic?.let { Text(it, style = MaterialTheme.typography.labelLarge, color = c.ctx) }
        if (i.summary != null) {
            Text(i.summary!!, style = MaterialTheme.typography.bodyMedium)
            Text(
                stringResource(if (i.summaryOutdated) R.string.insight_summary_outdated else R.string.insight_summary_note, time.full(i.summaryAtMillis ?: 0)),
                style = MaterialTheme.typography.labelSmall, color = c.faint, modifier = Modifier.padding(top = 4.dp),
            )
        } else {
            Text(stringResource(R.string.insight_summary_none), style = MaterialTheme.typography.bodySmall, color = c.muted)
        }
        when (state.summary) {
            SummaryState.Working -> Row(Modifier.padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp)
                Spacer(Modifier.size(10.dp))
                Text(stringResource(R.string.insight_summary_working), style = MaterialTheme.typography.bodySmall, color = c.muted)
            }
            else -> {
                val note = when (state.summary) {
                    SummaryState.NoModel -> R.string.insight_summary_no_model
                    SummaryState.Nothing -> R.string.insight_summary_nothing
                    SummaryState.Failed -> R.string.insight_summary_failed
                    else -> null
                }
                note?.let { Text(stringResource(it), style = MaterialTheme.typography.bodySmall, color = c.warn, modifier = Modifier.padding(top = 6.dp)) }
                TextButton(onClick = onSummarize) {
                    Text(stringResource(if (i.summary == null) R.string.insight_summarize else R.string.insight_update))
                }
            }
        }

        Spacer(Modifier.height(8.dp))
        Text(stringResource(R.string.insight_waiting), style = MaterialTheme.typography.titleSmall)
        if (i.unansweredQuestions.isEmpty()) {
            Text(stringResource(if (i.yourTurn) R.string.insight_your_turn_only else R.string.insight_nothing_waiting), style = MaterialTheme.typography.bodySmall, color = c.muted)
        } else {
            i.unansweredQuestions.forEach { Text("• $it", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(vertical = 2.dp)) }
        }

        if (i.decisions.isNotEmpty()) {
            Spacer(Modifier.height(12.dp))
            Text(stringResource(R.string.insight_agreed), style = MaterialTheme.typography.titleSmall)
            i.decisions.forEach { Text("• $it", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(vertical = 2.dp)) }
        }

        i.mood?.let {
            Spacer(Modifier.height(12.dp))
            Text(stringResource(R.string.insight_mood), style = MaterialTheme.typography.titleSmall)
            Text(stringResource(it.label()), style = MaterialTheme.typography.bodyMedium)
            Text(stringResource(R.string.insight_mood_note), style = MaterialTheme.typography.labelSmall, color = c.faint)
        }
        Spacer(Modifier.height(20.dp))
    }
}
