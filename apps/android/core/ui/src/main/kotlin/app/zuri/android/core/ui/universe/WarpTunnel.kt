package app.zuri.android.core.ui.universe

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp
import app.zuri.android.core.ui.theme.Zuri

/** The conversation backdrop (spec §4.3): six violet rings rushing out from a point at 38% height. */
@Composable
fun WarpTunnel(modifier: Modifier = Modifier) {
    val p by loop(6000, label = "warp")
    val u = Zuri.universe
    Canvas(modifier.fillMaxSize()) {
        val c = Offset(size.width / 2, size.height * 0.38f)
        val maxR = size.height * 0.9f
        repeat(6) { i ->
            val t = (p + i / 6f) % 1f
            val r = maxR * t * t
            val a = (if (u.night) 0.32f else 0.22f) * (1 - t) * minOf(1f, t * 6)
            drawCircle(u.nebula.copy(alpha = a), r, c, style = Stroke((1 + 2.5f * t).dp.toPx()))
        }
    }
}
