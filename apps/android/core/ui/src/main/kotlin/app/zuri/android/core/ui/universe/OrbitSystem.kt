package app.zuri.android.core.ui.universe

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.zuri.android.core.ui.theme.PlanetSkin
import app.zuri.android.core.ui.theme.SpaceGrotesk
import app.zuri.android.core.ui.theme.Zuri
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.sin

/** One planet on an orbit. [radius] is in dp from the centre; [speed] is whole revolutions per period (seamless loop). */
data class OrbitBody(
    val key: String,
    val skin: PlanetSkin,
    val size: Dp,
    val radius: Dp,
    val angle0: Float,
    val speed: Int = 1,
    val label: String = "",
    val pulse: Boolean = false,
    val selected: Boolean = false,
    /** A real profile picture, drawn inside the planet's rim when present. */
    val image: androidx.compose.ui.graphics.ImageBitmap? = null,
)

data class OrbitRing(val radius: Dp, val color: Color, val dashed: Boolean = false, val width: Dp = 1.dp)

/**
 * Tilted orbits with occlusion (spec §6): each frame projects every body —
 * x = r·cosθ, y = r·sinθ·cos(tilt), depth = sinθ, scale = 1 + 0.16·depth — and draws back arcs and
 * far planets before the centre, near ones after it. A tap hits the nearest drawn body (≥ 44dp target).
 */
@Composable
fun OrbitSystem(
    bodies: List<OrbitBody>,
    rings: List<OrbitRing>,
    center: PlanetSkin,
    centerSize: Dp,
    modifier: Modifier = Modifier,
    height: Dp = 260.dp,
    tiltDeg: Float = 68f,
    periodMs: Int = 42_000,
    centerLabel: String = "",
    description: String = "",
    onBody: (String) -> Unit = {},
    onCenter: () -> Unit = {},
) {
    val p by loop(periodMs, label = "orbit")
    val pulse by loop(1800, label = "orbitPulse")
    val u = Zuri.universe
    val measurer = rememberTextMeasurer()
    val latestBodies by rememberUpdatedState(bodies)
    val latestP by rememberUpdatedState(p)
    val cosT = cos(Math.toRadians(tiltDeg.toDouble())).toFloat()

    fun project(b: OrbitBody, phase: Float, density: Float): Triple<Offset, Float, Float> {
        val th = b.angle0 + 2 * Math.PI.toFloat() * b.speed * phase
        val r = b.radius.value * density
        val depth = sin(th)
        return Triple(Offset(r * cos(th), r * sin(th) * cosT), depth, 1f + 0.16f * depth)
    }

    Canvas(
        modifier.fillMaxWidth().height(height)
            .semantics { if (description.isNotEmpty()) contentDescription = description }
            .pointerInput(Unit) {
                detectTapGestures { tap ->
                    val c = Offset(size.width / 2f, size.height / 2f)
                    val hits = latestBodies.map { b ->
                        val (o, depth, scale) = project(b, latestP, density)
                        Triple(b, hypot(tap.x - (c.x + o.x), tap.y - (c.y + o.y)), maxOf(22.dp.toPx(), b.size.toPx() * scale / 2 + 6.dp.toPx()) to depth)
                    }.filter { it.second <= it.third.first }
                    val best = hits.maxByOrNull { it.third.second }
                    when {
                        best != null -> onBody(best.first.key)
                        hypot(tap.x - c.x, tap.y - c.y) <= maxOf(22.dp.toPx(), centerSize.toPx() / 2) -> onCenter()
                    }
                }
            },
    ) {
        val c = Offset(size.width / 2, size.height / 2)
        val projected = bodies.map { b -> b to project(b, p, density) }
        fun ring(r: OrbitRing, front: Boolean) {
            val rx = r.radius.toPx(); val ry = rx * cosT
            drawArc(
                r.color, if (front) 0f else 180f, 180f, false, Offset(c.x - rx, c.y - ry), Size(rx * 2, ry * 2),
                style = Stroke(r.width.toPx(), pathEffect = if (r.dashed) PathEffect.dashPathEffect(floatArrayOf(6.dp.toPx(), 6.dp.toPx())) else null),
                alpha = if (front) 1f else 0.6f,
            )
        }
        rings.forEach { ring(it, front = false) }
        projected.filter { it.second.second < 0 }.sortedBy { it.second.second }.forEach { (b, t) -> body(b, c + t.first, t.third, 0.78f, pulse, measurer, u.ion) }
        // The centre: the owner's sun with its glow.
        drawOrb(c, centerSize.toPx() / 2, center, glow = true)
        if (centerLabel.isNotEmpty()) label(centerLabel, c, centerSize.toPx() * 0.3f, measurer)
        rings.forEach { ring(it, front = true) }
        projected.filter { it.second.second >= 0 }.sortedBy { it.second.second }.forEach { (b, t) -> body(b, c + t.first, t.third, 1f, pulse, measurer, u.ion) }
    }
}

private fun DrawScope.body(b: OrbitBody, at: Offset, scale: Float, alpha: Float, pulse: Float, measurer: androidx.compose.ui.text.TextMeasurer, ion: Color) {
    val r = b.size.toPx() / 2 * scale
    if (b.pulse) drawCircle(ion.copy(alpha = 0.9f * (1 - pulse) * alpha), r * (1.15f + 0.7f * pulse), at, style = Stroke(2.dp.toPx()))
    if (b.selected) drawCircle(Brush.radialGradient(listOf(ion.copy(alpha = 0.55f), Color.Transparent), at, r * 1.8f), r * 1.8f, at)
    val img = b.image
    if (img != null) {
        // The photo sits in the planet: clipped to the sphere, ringed in the planet's colour.
        val path = androidx.compose.ui.graphics.Path().apply { addOval(androidx.compose.ui.geometry.Rect(at, r)) }
        clipPath(path) {
            drawImage(img, srcSize = androidx.compose.ui.unit.IntSize(img.width, img.height),
                dstOffset = androidx.compose.ui.unit.IntOffset((at.x - r).toInt(), (at.y - r).toInt()),
                dstSize = androidx.compose.ui.unit.IntSize((2 * r).toInt(), (2 * r).toInt()), alpha = alpha)
        }
        drawCircle(Brush.linearGradient(listOf(b.skin.highlight, b.skin.body, b.skin.shadow), at - Offset(r, r), at + Offset(r, r)), r, at, style = Stroke(2.dp.toPx()), alpha = alpha)
    } else {
        drawOrb(at, r, b.skin, glow = b.selected, alpha = alpha)
    }
    if (b.selected) drawCircle(ion, r + 3.dp.toPx(), at, style = Stroke(2.dp.toPx()))
    if (b.label.isNotEmpty() && img == null) label(b.label, at, r * 0.72f, measurer, alpha)
}

private fun DrawScope.label(text: String, at: Offset, sizePx: Float, measurer: androidx.compose.ui.text.TextMeasurer, alpha: Float = 1f) {
    val layout = measurer.measure(
        text, TextStyle(color = Color.White.copy(alpha = alpha), fontFamily = SpaceGrotesk, fontWeight = FontWeight.Bold,
            fontSize = (sizePx / density).sp, shadow = Shadow(Color(0x80000000), Offset(0f, 1f), 4f)),
    )
    drawText(layout, topLeft = Offset(at.x - layout.size.width / 2f, at.y - layout.size.height / 2f))
}
