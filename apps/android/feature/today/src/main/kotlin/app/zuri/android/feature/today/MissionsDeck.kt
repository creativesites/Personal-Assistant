package app.zuri.android.feature.today

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Forum
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex
import app.zuri.android.core.ui.theme.ClearSkin
import app.zuri.android.core.ui.theme.Zuri
import app.zuri.android.core.ui.theme.initialOf
import app.zuri.android.core.ui.theme.skinFor
import app.zuri.android.core.ui.universe.Eyebrow
import app.zuri.android.core.ui.universe.GhostButton
import app.zuri.android.core.ui.universe.LaunchButton
import app.zuri.android.core.ui.universe.Orb
import app.zuri.android.core.ui.universe.UChip
import app.zuri.android.core.ui.universe.deepCard
import app.zuri.android.core.ui.universe.glass
import app.zuri.android.core.ui.universe.loop
import app.zuri.android.core.ui.universe.rise
import app.zuri.android.domain.people.Mission
import app.zuri.android.domain.people.MissionKind
import app.zuri.android.domain.people.MissionTally

/**
 * Missions (spec §4.5): nudges stacked in depth, the front one facing you. "Open chat" takes the
 * owner to the person (Zuri never sends); the mission resolves itself once they write. "Done" and
 * "Not now" close it by hand. With nothing left: Orbit clear.
 */
@Composable
internal fun MissionsDeck(missions: List<Mission>, tally: MissionTally, onOpen: (Mission) -> Unit, onDone: (Mission) -> Unit, onSkip: (Mission) -> Unit) {
    val u = Zuri.universe
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Eyebrow(stringResource(R.string.missions_title), color = u.star)
                Text(
                    if (missions.isEmpty()) stringResource(R.string.missions_clear_t) else stringResource(R.string.missions_count, missions.size),
                    style = MaterialTheme.typography.titleLarge, color = u.ink,
                )
            }
            ProgressDots(tally, missions.size)
        }
        Spacer(Modifier.height(10.dp))
        if (missions.isEmpty()) { OrbitClear(tally); return@Column }
        val shown = missions.take(4)
        Box(Modifier.fillMaxWidth().height(232.dp)) {
            shown.asReversed().forEachIndexed { revIndex, m ->
                val depth = shown.size - 1 - revIndex
                val d by animateFloatAsState(depth.toFloat(), label = "deck")
                Column(
                    Modifier.zIndex(10f - depth).fillMaxWidth().height(208.dp)
                        .graphicsLayer {
                            translationY = d * 12.dp.toPx(); rotationX = d * 5f; cameraDistance = 14 * density
                            val s = 1f - 0.04f * d; scaleX = s; scaleY = s; alpha = 1f - 0.28f * d
                        }
                        .then(if (depth == 0) Modifier.rise(0) else Modifier.clearAndSetSemantics { })
                        .deepCard(RoundedCornerShape(26.dp)).padding(16.dp),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Orb(40.dp, skinFor(m.conversationId.value), label = initialOf(m.person))
                        Spacer(Modifier.size(10.dp))
                        Text(m.person, style = MaterialTheme.typography.titleMedium, color = u.ink, modifier = Modifier.weight(1f), maxLines = 1)
                        UChip(stringResource(if (m.kind == MissionKind.RECONNECT) R.string.mission_reconnect else R.string.mission_promise), if (m.kind == MissionKind.RECONNECT) u.ion else u.star)
                    }
                    Spacer(Modifier.height(10.dp))
                    Text(m.title, style = MaterialTheme.typography.titleLarge, color = u.ink, maxLines = 1)
                    Text(m.body, style = MaterialTheme.typography.bodyMedium, color = u.inkSoft, maxLines = 3, modifier = Modifier.weight(1f))
                    if (depth == 0) Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        LaunchButton(stringResource(R.string.mission_open), { onOpen(m) }, Modifier.weight(1f), height = 46.dp,
                            icon = { Icon(Icons.Rounded.Forum, null, tint = Color.White, modifier = Modifier.size(18.dp)) })
                        TextButton(onClick = { onDone(m) }) { Text(stringResource(R.string.mission_done), color = u.aurora) }
                        TextButton(onClick = { onSkip(m) }) { Text(stringResource(R.string.mission_skip), color = u.inkMuted) }
                    }
                }
            }
        }
    }
}

/** Progress constellation: aurora = done today, ion = still open (capped at 8). */
@Composable
private fun ProgressDots(tally: MissionTally, open: Int) {
    val u = Zuri.universe
    val dots = (List(tally.done) { u.aurora } + List(open) { u.ion }).take(8)
    if (dots.isEmpty()) return
    Row(horizontalArrangement = Arrangement.spacedBy(5.dp)) {
        dots.forEach { c -> Canvas(Modifier.size(8.dp)) { drawCircle(c) } }
    }
}

/** Orbit clear: a calm green world breathing. */
@Composable
private fun OrbitClear(tally: MissionTally) {
    val u = Zuri.universe
    val v by loop(3000, pingPong = true, rest = 0.5f, label = "clear")
    Row(Modifier.fillMaxWidth().glass(RoundedCornerShape(24.dp)).padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
        Orb(48.dp, ClearSkin, Modifier.graphicsLayer { val s = 0.94f + 0.1f * v; scaleX = s; scaleY = s }, glow = true)
        Spacer(Modifier.size(14.dp))
        Text(
            if (tally.total > 0) stringResource(R.string.missions_clear_done, tally.done, tally.total) else stringResource(R.string.missions_clear_b),
            style = MaterialTheme.typography.bodyMedium, color = u.inkSoft,
        )
    }
}
