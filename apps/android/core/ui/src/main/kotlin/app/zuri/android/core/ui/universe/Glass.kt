package app.zuri.android.core.ui.universe

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.zuri.android.core.ui.theme.Zuri

/** Frosted glass without blur (spec §3.4): a translucent gradient and a hairline over the moving sky. */
@Composable
fun Modifier.glass(shape: Shape = RoundedCornerShape(24.dp)): Modifier {
    val u = Zuri.universe
    return this.clip(shape).background(Brush.linearGradient(listOf(u.glassTop, u.glassBottom)), shape).border(1.dp, u.glassBorder, shape)
}

/** Opaque deep card (holo drafts, missions, sheets). */
@Composable
fun Modifier.deepCard(shape: Shape = RoundedCornerShape(24.dp)): Modifier {
    val u = Zuri.universe
    return this.clip(shape).background(Brush.verticalGradient(listOf(u.cardTop, u.cardBottom)), shape).border(1.dp, u.glassBorder, shape)
}

@Composable
fun Glass(modifier: Modifier = Modifier, radius: Dp = 24.dp, content: @Composable BoxScope.() -> Unit) {
    Box(modifier.glass(RoundedCornerShape(radius)), content = content)
}
