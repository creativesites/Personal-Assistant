package app.zuri.android.feature.today

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Sensors
import androidx.compose.material.icons.rounded.SensorsOff
import androidx.compose.material.icons.rounded.WbSunny
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.zuri.android.core.ui.components.EmptyState
import app.zuri.android.core.ui.components.IconChip
import app.zuri.android.core.ui.components.SectionHeader
import app.zuri.android.core.ui.components.Tone
import app.zuri.android.core.ui.components.ZuriListGroup
import app.zuri.android.core.ui.components.ZuriListRow
import app.zuri.android.core.ui.theme.Zuri
import app.zuri.android.domain.capture.CaptureHealth

@Composable
fun TodayRoute(onOpenPrivacy: () -> Unit, onOpenSources: () -> Unit, viewModel: TodayViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    TodayContent(state, onOpenPrivacy, onOpenSources)
}

/** P01 in its first-day state: honest about having nothing yet, and about why. */
@Composable
fun TodayContent(state: TodayState, onOpenPrivacy: () -> Unit, onOpenSources: () -> Unit, modifier: Modifier = Modifier) {
    val greeting = stringResource(
        when (state.dayPart) { DayPart.Morning -> R.string.today_morning; DayPart.Afternoon -> R.string.today_afternoon; DayPart.Evening -> R.string.today_evening },
    )
    Column(modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        Column(Modifier.padding(horizontal = 20.dp, vertical = 4.dp)) {
            Text(state.dateLabel, style = MaterialTheme.typography.bodyMedium, color = Zuri.colors.muted)
            Text(greeting, style = MaterialTheme.typography.headlineLarge)
        }
        EmptyState(
            icon = Icons.Rounded.WbSunny,
            title = stringResource(R.string.today_empty_title),
            body = stringResource(R.string.today_empty_body),
        )
        SectionHeader(stringResource(R.string.today_what_now))
        ZuriListGroup(rows = listOf(
            {
                val (t, sub, tone) = when (state.capture) {
                    CaptureHealth.LISTENING -> Triple(R.string.today_sources_on_t, R.string.today_sources_on_s, Tone.Ok)
                    CaptureHealth.NEEDS_ACCESS, CaptureHealth.DISCONNECTED -> Triple(R.string.today_sources_warn_t, R.string.today_sources_warn_s, Tone.Warn)
                    CaptureHealth.OFF -> Triple(R.string.today_sources_t, R.string.today_sources_s, Tone.Neutral)
                }
                ZuriListRow(
                    title = stringResource(t),
                    supporting = if (state.capture == CaptureHealth.LISTENING) stringResource(sub, state.capturedToday) else stringResource(sub),
                    leading = { IconChip(if (state.capture == CaptureHealth.OFF) Icons.Rounded.SensorsOff else Icons.Rounded.Sensors, tone = tone) },
                    trailing = { Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, null, tint = Zuri.colors.muted) },
                    onClick = onOpenSources,
                )
            },
            {
                ZuriListRow(
                    title = stringResource(R.string.today_privacy_t), supporting = stringResource(R.string.today_privacy_s),
                    leading = { IconChip(Icons.Rounded.Lock, tone = Tone.Ok) },
                    trailing = { Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, null, tint = Zuri.colors.muted) },
                    onClick = onOpenPrivacy,
                )
            },
        ))
    }
}
