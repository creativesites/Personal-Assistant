package app.zuri.android.feature.life

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AutoStories
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.zuri.android.core.ui.components.EmptyState
import app.zuri.android.core.ui.theme.UniverseColors
import app.zuri.android.core.ui.theme.Zuri
import app.zuri.android.core.ui.universe.Eyebrow
import app.zuri.android.core.ui.universe.rise
import app.zuri.android.domain.people.TimelineEntry
import app.zuri.android.domain.people.TimelineKind
import java.time.temporal.IsoFields

/**
 * Life Timeline (reflection, M6): what actually happened, week by week — goals, check-ins done,
 * promises kept, relationships warming or cooling by 10+ points. A quiet week shows little; nothing is invented.
 */
@Composable
fun TimelineRoute(onBack: () -> Unit, viewModel: TimelineViewModel = hiltViewModel()) {
    val entries by viewModel.entries.collectAsStateWithLifecycle()
    TimelineContent(entries, onBack)
}

@Composable
fun TimelineContent(entries: List<TimelineEntry>?, onBack: () -> Unit) {
    val u = Zuri.universe
    val thisWeek = stringResource(R.string.tl_this_week); val lastWeek = stringResource(R.string.tl_last_week)
    Column(Modifier.fillMaxSize()) {
        LifeHeader(stringResource(R.string.tl_eyebrow), stringResource(R.string.tl_title), onBack)
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
            if (entries != null && entries.isEmpty()) item("empty") {
                EmptyState(Icons.Rounded.AutoStories, stringResource(R.string.tl_empty_t), stringResource(R.string.tl_empty_b), Modifier.padding(top = 16.dp))
            }
            val zone = java.time.ZoneId.systemDefault()
            val now = java.time.LocalDate.now(zone)
            fun week(ms: Long): String {
                val d = java.time.Instant.ofEpochMilli(ms).atZone(zone).toLocalDate()
                val weeks = java.time.temporal.ChronoUnit.WEEKS.between(d.with(java.time.DayOfWeek.MONDAY), now.with(java.time.DayOfWeek.MONDAY))
                return when (weeks) {
                    0L -> thisWeek; 1L -> lastWeek
                    else -> "Week of " + d.with(java.time.DayOfWeek.MONDAY).format(java.time.format.DateTimeFormatter.ofPattern("d MMMM", java.util.Locale.getDefault()))
                }
            }
            entries.orEmpty().withIndex().groupBy { week(it.value.atMillis) }.forEach { (label, group) ->
                item("w-$label") { Eyebrow("$label · ${group.size}", Modifier.padding(start = 22.dp, top = 16.dp, bottom = 4.dp)) }
                items(group, key = { "${it.index}" }) { (i, e) -> TimelineRow(e, i, u) }
            }
        }
    }
}

@Composable
private fun TimelineRow(e: TimelineEntry, index: Int, u: UniverseColors) {
    val color = when (e.kind) {
        TimelineKind.GOAL_ACHIEVED, TimelineKind.PROMISE_KEPT, TimelineKind.WARMER -> u.aurora
        TimelineKind.COOLER -> u.ember
        TimelineKind.MISSION_DONE -> u.ion
        else -> u.nebulaSoft
    }
    val label = stringResource(
        when (e.kind) {
            TimelineKind.GOAL_CREATED -> R.string.tl_goal_created; TimelineKind.GOAL_PROGRESS -> R.string.tl_goal_progress
            TimelineKind.GOAL_ACHIEVED -> R.string.tl_goal_achieved; TimelineKind.GOAL_OTHER -> R.string.tl_goal_other
            TimelineKind.MISSION_DONE -> R.string.tl_mission; TimelineKind.PROMISE_KEPT -> R.string.tl_promise
            TimelineKind.WARMER -> R.string.tl_warmer; TimelineKind.COOLER -> R.string.tl_cooler
        },
    )
    Row(Modifier.fillMaxWidth().rise(index).padding(start = 22.dp, end = 16.dp, top = 6.dp), verticalAlignment = Alignment.Top) {
        // The timeline's spine: a glowing dot in the event's colour.
        Canvas(Modifier.padding(top = 5.dp).size(12.dp)) {
            drawCircle(color.copy(alpha = 0.3f), size.minDimension / 2)
            drawCircle(color, size.minDimension / 4)
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(label, style = MaterialTheme.typography.labelMedium, color = color)
            Text(e.title, style = MaterialTheme.typography.bodyLarge, color = u.ink, maxLines = 3)
            Text(
                listOfNotNull(e.detail, java.time.format.DateTimeFormatter.ofPattern("EEE d MMM", java.util.Locale.getDefault()).format(java.time.Instant.ofEpochMilli(e.atMillis).atZone(java.time.ZoneId.systemDefault()))).joinToString(" · "),
                style = MaterialTheme.typography.bodySmall, color = u.inkMuted,
            )
            Spacer(Modifier.height(6.dp))
        }
    }
}

@Suppress("unused") private val iso = IsoFields.WEEK_OF_WEEK_BASED_YEAR
@Suppress("unused") private val transparent = Color.Transparent
