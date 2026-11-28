package app.zuri.android.core.ui.universe

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.translate
import app.zuri.android.core.ui.theme.Zuri
import kotlin.math.sin

/** A 0→1 value looping over [baseMs] × the motion setting; frozen at [rest] when animations are off. */
@Composable
fun loop(baseMs: Int, pingPong: Boolean = false, rest: Float = 0f, label: String = "loop"): State<Float> {
    val motion = Zuri.motion
    if (motion.reduced) return remember { mutableFloatStateOf(rest) }
    val t = rememberInfiniteTransition(label)
    return t.animateFloat(
        0f, 1f,
        infiniteRepeatable(tween(motion.ms(baseMs), easing = LinearEasing), if (pingPong) RepeatMode.Reverse else RepeatMode.Restart),
        label = label,
    )
}

private data class Star(val x: Float, val y: Float, val r: Float)

private fun stars(n: Int, seed: Long, size: Float): List<Star> {
    var x = seed
    fun rnd(): Float { x = (x * 16807) % 2147483647; return x / 2147483647f }
    return List(n) { Star(rnd(), rnd() * 2f, size * (0.6f + rnd() * 0.8f)) }
}

/**
 * The sky behind every screen (spec §3.4 layer 1): the gradient, a slowly turning nebula and three
 * twinkling star layers drifting upward. Decorative only: no touch, no semantics.
 */
@Composable
fun SpaceBackground(modifier: Modifier = Modifier, content: @Composable BoxScope.() -> Unit = {}) {
    val u = Zuri.universe
    val layers = remember { listOf(stars(70, 7, 1.4f), stars(36, 29, 2.2f), stars(14, 101, 2.6f)) }
    val tw = listOf(loop(3500, true, 1f, "tw1"), loop(6000, true, 1f, "tw2"), loop(9000, true, 1f, "tw3"))
    val drift = listOf(loop(160_000, label = "d1"), loop(90_000, label = "d2"), loop(160_000, label = "d3"))
    val neb by loop(40_000, true, label = "nebula")
    Box(modifier.fillMaxSize()) {
        Canvas(Modifier.fillMaxSize()) {
            drawRect(Brush.verticalGradient(u.sky))
            drawNebula(u.nebulaClouds, neb)
            val density = density
            layers.forEachIndexed { i, layer ->
                val alpha = 0.35f + 0.65f * tw[i].value
                val dy = drift[i].value * size.height
                val color = u.starColors[i]
                for (s in layer) {
                    var y = s.y * size.height - dy
                    if (y < -4f) y += size.height * 2
                    if (y > size.height + 4f) continue
                    drawCircle(color.copy(alpha = color.alpha * alpha), s.r * density / 2f, Offset(s.x * size.width, y))
                }
            }
        }
        // Text without an explicit colour reads as ink on this sky (the old opaque Surface did this).
        androidx.compose.runtime.CompositionLocalProvider(androidx.compose.material3.LocalContentColor provides u.ink) { content() }
    }
}

private fun DrawScope.drawNebula(clouds: List<Color>, v: Float) {
    val w = size.width; val h = size.height
    translate(-w * 0.08f * v, h * 0.04f * v) {
        rotate(10f * v, Offset(w / 2, h / 2)) {
            val spots = listOf(Offset(0.32f * w, 0.24f * h) to w * 0.62f, Offset(0.82f * w, 0.38f * h) to w * 0.5f, Offset(0.5f * w, 0.88f * h) to w * 0.7f)
            spots.forEachIndexed { i, (c, r) ->
                drawCircle(Brush.radialGradient(listOf(clouds[i], clouds[i].copy(alpha = 0f)), c, r), r, c)
            }
        }
    }
}

/** Phase helper for drawing: sin of a loop value scaled to one revolution. */
internal fun wave(p: Float, speed: Int = 1): Float = sin(p * speed * 2 * Math.PI).toFloat()
