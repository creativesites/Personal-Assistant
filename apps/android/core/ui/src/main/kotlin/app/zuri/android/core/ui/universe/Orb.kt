package app.zuri.android.core.ui.universe

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.zuri.android.core.ui.theme.PlanetSkin
import app.zuri.android.core.ui.theme.SpaceGrotesk

/**
 * A lit sphere: the atom of the universe (spec §5). Every contact, the owner's sun and Zuri's core
 * are orbs: a top-left highlight, the body colour, a terminator shadow bottom-right, and an
 * optional colour-matched glow.
 */
@Composable
fun Orb(
    size: Dp, skin: PlanetSkin, modifier: Modifier = Modifier, label: String? = null, glow: Boolean = false,
    content: @Composable BoxScope.() -> Unit = {},
) {
    Box(modifier.size(size), contentAlignment = Alignment.Center) {
        Canvas(Modifier.size(size)) { drawOrb(center, this.size.minDimension / 2f, skin, glow) }
        if (label != null) {
            val px = size.value
            Text(
                label, color = Color.White,
                style = TextStyle(fontFamily = SpaceGrotesk, fontWeight = FontWeight.Bold, fontSize = maxOf(10f, px * 0.36f).sp,
                    shadow = Shadow(Color(0x80000000), Offset(0f, 1f), 4f)),
            )
        }
        content()
    }
}

/** Draws an orb into any canvas (orbit systems draw many per frame). */
fun DrawScope.drawOrb(c: Offset, r: Float, skin: PlanetSkin, glow: Boolean = false, alpha: Float = 1f) {
    if (glow) drawCircle(Brush.radialGradient(listOf(skin.body.copy(alpha = 0.55f * alpha), Color.Transparent), c, r * 1.9f), r * 1.9f, c)
    drawCircle(
        Brush.radialGradient(
            0f to Color.White.copy(alpha = 0.95f * alpha), 0.12f to skin.highlight.copy(alpha = alpha),
            0.5f to skin.body.copy(alpha = alpha), 1f to skin.shadow.copy(alpha = alpha),
            center = Offset(c.x - r + 0.64f * r, c.y - r + 0.56f * r), radius = r * 1.56f,
        ),
        r, c,
    )
    drawCircle(
        Brush.radialGradient(listOf(Color(0x9903040B).copy(alpha = 0.6f * alpha), Color.Transparent), Offset(c.x + 0.6f * r, c.y + 0.68f * r), r * 1.24f),
        r, c,
    )
}
