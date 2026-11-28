package app.zuri.android.feature.inbox

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.clickable
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
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import app.zuri.android.core.ui.theme.Zuri
import app.zuri.android.core.ui.universe.Eyebrow
import app.zuri.android.core.ui.universe.deepCard
import app.zuri.android.core.ui.universe.loop
import kotlin.math.abs

/**
 * Reply drafts as holographic cards fanned in 3D (spec §4.3 Holo deck). The front card faces you;
 * neighbours swing ±128dp with rotateY ∓38°, 86% scale, 55% opacity. Tap a side card to swing it
 * forward; tap the front card to put its text in the reply box. Nothing is ever sent from here.
 */
@Composable
internal fun HoloDeck(drafts: List<String>, label: String, onPick: (String) -> Unit, onCopy: (String) -> Unit) {
    var front by remember(drafts) { mutableIntStateOf(0) }
    // Swiping moves the whole fan with the finger; letting go settles on the nearest card.
    var drag by remember(drafts) { androidx.compose.runtime.mutableFloatStateOf(0f) }
    val shimmer by loop(4000, label = "holo")
    val u = Zuri.universe
    val px = with(LocalDensity.current) { 128.dp.toPx() }
    Column(Modifier.fillMaxWidth().padding(top = 4.dp)) {
        Row(Modifier.padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Rounded.AutoAwesome, null, tint = u.star, modifier = Modifier.size(14.dp))
            Spacer(Modifier.size(6.dp))
            Eyebrow(stringResource(R.string.holo_title), color = u.star)
        }
        Text(label, style = MaterialTheme.typography.bodySmall, color = u.inkMuted, modifier = Modifier.padding(horizontal = 12.dp, vertical = 2.dp))
        Box(
            Modifier.fillMaxWidth().height(176.dp)
                .pointerInput(drafts) {
                    detectHorizontalDragGestures(
                        onDragEnd = {
                            val steps = kotlin.math.round(-drag / px).toInt()
                            front = (front + steps).coerceIn(0, drafts.lastIndex)
                            drag = 0f
                        },
                        onDragCancel = { drag = 0f },
                    ) { change, dx ->
                        change.consume()
                        // Resist past the first and last card.
                        val atEdge = (front == 0 && drag + dx > 0) || (front == drafts.lastIndex && drag + dx < 0)
                        drag += if (atEdge) dx * 0.3f else dx
                    }
                },
            contentAlignment = Alignment.Center,
        ) {
            drafts.forEachIndexed { i, d ->
                val target = (i - front).toFloat()
                val settled by animateFloatAsState(target, spring(dampingRatio = 0.7f, stiffness = 300f), label = "holo$i")
                val o = settled + drag / px
                val isFront = i == front
                Column(
                    Modifier.zIndex(10f - abs(o))
                        .graphicsLayer {
                            translationX = o * px
                            rotationY = -38f * o.coerceIn(-1f, 1f)
                            val s = 1f - 0.14f * abs(o).coerceAtMost(1f); scaleX = s; scaleY = s
                            alpha = if (abs(o) > 1.5f) 0f else 1f - 0.45f * abs(o).coerceAtMost(1f)
                            cameraDistance = 14 * density
                        }
                        .size(236.dp, 164.dp)
                        .deepCard(RoundedCornerShape(24.dp))
                        .drawWithContent {
                            drawContent()
                            val x = -size.width + shimmer * size.width * 3
                            drawRect(Brush.linearGradient(listOf(Color.Transparent, u.ion.copy(alpha = 0.10f), Color.Transparent), Offset(x, 0f), Offset(x + size.width * 0.6f, size.height)))
                        }
                        .semantics { selected = isFront; contentDescription = d }
                        .clickable { if (isFront) onPick(d) else front = i }
                        .padding(14.dp),
                ) {
                    Text(d, style = MaterialTheme.typography.bodyMedium, color = u.ink, maxLines = 5, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    if (isFront) Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(stringResource(R.string.holo_tap_to_edit), style = MaterialTheme.typography.labelSmall, color = u.ion, modifier = Modifier.weight(1f))
                        IconButton(onClick = { onCopy(d) }) { Icon(Icons.Rounded.ContentCopy, stringResource(R.string.drafts_copy), tint = u.inkMuted, modifier = Modifier.size(18.dp)) }
                    }
                }
            }
        }
    }
}
