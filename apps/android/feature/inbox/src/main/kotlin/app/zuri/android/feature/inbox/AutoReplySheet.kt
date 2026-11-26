package app.zuri.android.feature.inbox

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RangeSlider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.unit.dp
import app.zuri.android.core.ui.theme.Zuri
import app.zuri.android.domain.inbox.AutoReplyEvent
import app.zuri.android.domain.inbox.AutoReplyOutcome
import app.zuri.android.domain.inbox.AutoReplyReason
import app.zuri.android.domain.inbox.AutoReplySettings
import kotlin.math.roundToInt

data class AutoReplyState(
    val enabled: Boolean = false,
    val settings: AutoReplySettings = AutoReplySettings(),
    val events: List<AutoReplyEvent> = emptyList(),
)

/** Auto-replies for one chat (D-22): the switch, the delay range and pause for all chats, and what Zuri did. */
@Composable
fun AutoReplyContent(
    state: AutoReplyState,
    isGroup: Boolean,
    time: TimeContext,
    onEnabled: (Boolean) -> Unit,
    onPaused: (Boolean) -> Unit,
    onDelay: (Int, Int) -> Unit,
) {
    val c = Zuri.colors
    Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 22.dp).navigationBarsPadding()) {
        Text(stringResource(R.string.auto_title), style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(12.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(stringResource(R.string.auto_this_chat), style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
            Switch(checked = state.enabled && !isGroup, onCheckedChange = onEnabled, enabled = !isGroup)
        }
        Text(
            stringResource(if (isGroup) R.string.auto_groups else R.string.auto_explain, AutoReplyLimits.PER_HOUR),
            style = MaterialTheme.typography.bodySmall, color = c.muted,
        )
        Spacer(Modifier.height(16.dp))
        HorizontalDivider()
        Spacer(Modifier.height(12.dp))
        Text(stringResource(R.string.auto_all_chats), style = MaterialTheme.typography.titleSmall)
        Spacer(Modifier.height(8.dp))
        var range by remember(state.settings) { mutableStateOf(state.settings.minDelayMinutes.toFloat()..state.settings.maxDelayMinutes.toFloat()) }
        Text(
            stringResource(R.string.auto_delay, range.start.roundToInt(), range.endInclusive.roundToInt()),
            style = MaterialTheme.typography.bodyMedium,
        )
        RangeSlider(
            value = range, onValueChange = { range = it },
            onValueChangeFinished = { onDelay(range.start.roundToInt(), range.endInclusive.roundToInt()) },
            valueRange = 0f..AutoReplySettings.MAX_DELAY_MINUTES.toFloat(),
        )
        Text(stringResource(R.string.auto_delay_note), style = MaterialTheme.typography.bodySmall, color = c.muted)
        Spacer(Modifier.height(8.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(stringResource(R.string.auto_pause_all), style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
            Switch(checked = state.settings.paused, onCheckedChange = onPaused)
        }
        Spacer(Modifier.height(16.dp))
        HorizontalDivider()
        Spacer(Modifier.height(12.dp))
        Text(stringResource(R.string.auto_activity), style = MaterialTheme.typography.titleSmall)
        Spacer(Modifier.height(6.dp))
        if (state.events.isEmpty()) Text(stringResource(R.string.auto_activity_none), style = MaterialTheme.typography.bodySmall, color = c.muted)
        state.events.forEach { e ->
            Column(Modifier.padding(vertical = 6.dp)) {
                Text(
                    time.full(e.atMillis) + " · " + stringResource(outcomeLabel(e.outcome)) + (e.reason?.let { " · " + stringResource(reasonLabel(it)) } ?: ""),
                    style = MaterialTheme.typography.labelMedium,
                    color = when (e.outcome) { AutoReplyOutcome.SENT -> c.ok; AutoReplyOutcome.FAILED -> c.bad; AutoReplyOutcome.HELD -> c.warn; else -> c.muted },
                )
                e.text?.let { Text("“$it”", style = MaterialTheme.typography.bodySmall, fontStyle = FontStyle.Italic, color = c.muted) }
            }
        }
        Spacer(Modifier.height(20.dp))
    }
}

object AutoReplyLimits { const val PER_HOUR = 3 }

private fun outcomeLabel(o: AutoReplyOutcome) = when (o) {
    AutoReplyOutcome.SENT -> R.string.auto_sent
    AutoReplyOutcome.HELD -> R.string.auto_held
    AutoReplyOutcome.SKIPPED -> R.string.auto_skipped
    AutoReplyOutcome.FAILED -> R.string.auto_failed
}

private fun reasonLabel(r: AutoReplyReason) = when (r) {
    AutoReplyReason.SENSITIVE -> R.string.auto_r_sensitive
    AutoReplyReason.MEDIA_ONLY -> R.string.auto_r_media
    AutoReplyReason.NO_MODEL -> R.string.auto_r_no_model
    AutoReplyReason.NO_SAFE_DRAFT -> R.string.auto_r_no_draft
    AutoReplyReason.NOTIFICATION_GONE -> R.string.auto_r_gone
    AutoReplyReason.ENGINE_STOPPED -> R.string.auto_r_engine
    AutoReplyReason.LIMIT -> R.string.auto_r_limit
    AutoReplyReason.OWNER_REPLIED -> R.string.auto_r_you
    AutoReplyReason.SUPERSEDED -> R.string.auto_r_newer
    AutoReplyReason.PAUSED -> R.string.auto_r_paused
    AutoReplyReason.TURNED_OFF -> R.string.auto_r_off
    AutoReplyReason.SEND_ERROR -> R.string.auto_r_error
}
