package app.zuri.android.core.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.zuri.android.core.ui.theme.Zuri

enum class Tone { Context, Neutral, Ok, Warn, Bad }

@Composable
private fun toneColors(tone: Tone): Pair<Color, Color> {
    val c = Zuri.colors
    return when (tone) {
        Tone.Context -> Zuri.universe.let { u -> u.nebula.copy(alpha = if (u.night) 0.22f else 0.14f) to if (u.night) u.nebulaSoft else u.nebula }
        Tone.Neutral -> c.surface2 to MaterialTheme.colorScheme.onSurface
        Tone.Ok -> c.okWeak to c.ok
        Tone.Warn -> c.warnWeak to c.warn
        Tone.Bad -> c.badWeak to c.bad
    }
}

/** A soft rounded square holding an icon; the recurring "glanceable icon" atom. */
@Composable
fun IconChip(icon: ImageVector, modifier: Modifier = Modifier, tone: Tone = Tone.Context, size: Dp = 40.dp) {
    val (bg, fg) = toneColors(tone)
    Box(modifier.size(size).clip(RoundedCornerShape(size * 0.35f)).background(bg), contentAlignment = Alignment.Center) {
        Icon(icon, contentDescription = null, tint = fg, modifier = Modifier.size(size * 0.55f))
    }
}

/** A small pill label ("Encrypted", "Off", "3 days"). */
@Composable
fun StatusTag(text: String, modifier: Modifier = Modifier, tone: Tone = Tone.Neutral) {
    val (bg, fg) = toneColors(tone)
    Text(
        text, modifier = modifier.clip(CircleShape).background(bg).padding(horizontal = 9.dp, vertical = 3.dp),
        color = fg, fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
    )
}

/** Confidence on a 0–5 scale, as five bars. Announced to screen readers as "confidence N of 5". */
@Composable
fun ConfidenceMeter(level: Int, modifier: Modifier = Modifier) {
    val c = Zuri.colors
    val l = level.coerceIn(0, 5)
    Row(modifier.semantics { contentDescription = "Confidence $l of 5" }, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
        repeat(5) { i ->
            Box(Modifier.size(width = 5.dp, height = 12.dp).clip(RoundedCornerShape(2.dp)).background(if (i < l) c.ctx else c.surface3))
        }
    }
}

enum class CaptureState { Listening, Degraded, Off }

/** The dot on the capture-status button: green listening, amber degraded, grey off. */
@Composable
fun CaptureStatusDot(state: CaptureState, modifier: Modifier = Modifier) {
    val c = Zuri.colors
    val color = when (state) { CaptureState.Listening -> c.ok; CaptureState.Degraded -> c.warn; CaptureState.Off -> c.faint }
    Box(modifier.size(9.dp).clip(CircleShape).background(color))
}

/** Zuri's mark: the one place the indigo-to-cyan gradient is used. */
@Composable
fun ZuriMark(modifier: Modifier = Modifier, size: Dp = 40.dp) {
    Canvas(modifier.size(size)) {
        val r = this.size.minDimension / 2
        drawCircle(
            brush = Brush.radialGradient(
                listOf(Color(0xFFA5F3FC), Color(0xFF06B6D4), Color(0xFF4F46E5)),
                center = Offset(r * 0.7f, r * 0.6f), radius = r * 1.4f,
            ),
            radius = r,
        )
        drawCircle(Color.White.copy(alpha = 0.55f), radius = r * 0.22f, center = Offset(r * 0.72f, r * 0.68f))
    }
}
