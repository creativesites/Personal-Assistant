package app.zuri.android.core.ui.universe

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.zuri.android.core.ui.theme.CoreSkin
import app.zuri.android.core.ui.theme.Inter
import app.zuri.android.core.ui.theme.LaunchGradient
import app.zuri.android.core.ui.theme.Zuri

/** Uppercase eyebrow label: Inter Bold 11, +1.5 tracking. */
@Composable
fun Eyebrow(text: String, modifier: Modifier = Modifier, color: Color = Zuri.universe.inkMuted) {
    Text(text.uppercase(), modifier, color = color, fontFamily = Inter, fontWeight = FontWeight.Bold, fontSize = 11.sp, letterSpacing = 1.5.sp)
}

/** Screen title: Space Grotesk 38 / −1.5. */
@Composable
fun ScreenTitle(text: String, modifier: Modifier = Modifier) {
    Text(text, modifier.semantics { heading() }, color = Zuri.universe.ink, style = MaterialTheme.typography.displaySmall)
}

@Composable
fun LiveDot(color: Color = Zuri.universe.aurora, size: Dp = 7.dp) {
    val v by loop(800, pingPong = true, rest = 1f, label = "live")
    Canvas(Modifier.size(size * 2)) {
        val r = size.toPx() / 2
        drawCircle(Brush.radialGradient(listOf(color.copy(alpha = 0.6f * v), Color.Transparent), center, r * 2), r * 2)
        drawCircle(color.copy(alpha = 0.35f + 0.65f * v), r)
    }
}

/** "Live" status pill: a pulsing dot and a short status. */
@Composable
fun LivePill(text: String, modifier: Modifier = Modifier, color: Color = Zuri.universe.aurora) {
    Row(
        modifier.heightIn(min = 34.dp).glass(RoundedCornerShape(50)).padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        LiveDot(color)
        Text(text, color = Zuri.universe.nebulaSoft, fontFamily = Inter, fontWeight = FontWeight.Bold, fontSize = 12.sp)
    }
}

/** Small tinted chip (health band, Pinned, Group…). */
@Composable
fun UChip(text: String, color: Color, modifier: Modifier = Modifier) {
    Text(
        text, modifier.clip(RoundedCornerShape(50)).background(color.copy(alpha = 0.16f)).padding(horizontal = 9.dp, vertical = 3.dp),
        color = color, fontFamily = Inter, fontWeight = FontWeight.Bold, fontSize = 11.sp, maxLines = 1,
    )
}

/** Primary CTA: the violet → cyan launch gradient with a slow sheen sweeping across. */
@Composable
fun LaunchButton(
    title: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true, loading: Boolean = false,
    height: Dp = 56.dp, icon: (@Composable RowScope.() -> Unit)? = null,
) {
    val haptics = LocalHapticFeedback.current
    val sheen by loop(3200, label = "sheen")
    val src = remember { MutableInteractionSource() }
    val pressed by src.collectIsPressedAsState()
    val scale by animateFloatAsState(if (pressed) 0.97f else 1f, label = "press")
    val shape = RoundedCornerShape(20.dp)
    Row(
        modifier.graphicsLayer { scaleX = scale; scaleY = scale; alpha = if (enabled) 1f else 0.5f }
            .fillMaxWidth().heightIn(min = height).clip(shape).background(Brush.horizontalGradient(LaunchGradient), shape)
            .drawWithContent {
                drawContent()
                val x = -160.dp.toPx() + sheen * (size.width + 320.dp.toPx())
                rotate(18f, Offset(x, size.height / 2)) {
                    drawRect(Color.White.copy(alpha = 0.22f), Offset(x - 30.dp.toPx(), -size.height), androidx.compose.ui.geometry.Size(60.dp.toPx(), size.height * 3))
                }
            }
            .clickable(src, null, enabled = enabled && !loading, role = Role.Button) { haptics.performHapticFeedback(HapticFeedbackType.Confirm); onClick() },
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center,
    ) {
        if (loading) CircularProgressIndicator(Modifier.size(22.dp), color = Color.White, strokeWidth = 2.5.dp)
        else {
            icon?.invoke(this)
            if (icon != null) Box(Modifier.size(10.dp))
            Text(title, color = Color.White, style = MaterialTheme.typography.titleLarge.copy(fontSize = 16.sp, letterSpacing = 0.3.sp))
        }
    }
}

@Composable
fun GhostButton(title: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val haptics = LocalHapticFeedback.current
    Box(
        modifier.heightIn(min = 52.dp).glass(RoundedCornerShape(18.dp))
            .clickable(role = Role.Button) { haptics.performHapticFeedback(HapticFeedbackType.ContextClick); onClick() }
            .padding(horizontal = 18.dp),
        contentAlignment = Alignment.Center,
    ) { Text(title, color = Zuri.universe.inkSoft, fontFamily = Inter, fontWeight = FontWeight.Bold, fontSize = 14.sp) }
}

/** A card that tilts back into the screen while pressed (spec: TiltPressable). */
@OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)
fun Modifier.tiltClickable(onLongClick: (() -> Unit)? = null, onClick: () -> Unit): Modifier = composed {
    val haptics = LocalHapticFeedback.current
    val src = remember { MutableInteractionSource() }
    val pressed by src.collectIsPressedAsState()
    val t by animateFloatAsState(if (pressed) 1f else 0f, spring(dampingRatio = 0.6f, stiffness = Spring.StiffnessMedium), label = "tilt")
    this.graphicsLayer { cameraDistance = 12 * density; rotationX = 7f * t; val s = 1f - 0.035f * t; scaleX = s; scaleY = s }
        .then(
            if (onLongClick == null) Modifier.clickable(src, null, role = Role.Button) { haptics.performHapticFeedback(HapticFeedbackType.ContextClick); onClick() }
            else Modifier.combinedClickable(
                interactionSource = src, indication = null, role = Role.Button,
                onLongClick = { haptics.performHapticFeedback(HapticFeedbackType.LongPress); onLongClick() },
                onClick = { haptics.performHapticFeedback(HapticFeedbackType.ContextClick); onClick() },
            ),
        )
}

/** Entrance (spec "Rise"): +26dp and a 22° tilt settle to rest over 800ms; staggered for the first 8 rows. */
fun Modifier.rise(index: Int = 0, delayMs: Int = 0): Modifier = composed {
    val reduced = Zuri.motion.reduced || index >= 8
    val p = remember { Animatable(if (reduced) 1f else 0f) }
    LaunchedEffect(Unit) { if (!reduced) p.animateTo(1f, tween(800, delayMs + index * 70, CubicBezierEasing(0.2f, 0.8f, 0.2f, 1f))) }
    val lift = with(LocalDensity.current) { 26.dp.toPx() }
    this.graphicsLayer {
        val v = p.value
        alpha = v; translationY = (1 - v) * lift; rotationX = (1 - v) * 22f; cameraDistance = 12 * density
    }
}

/** Loading: Zuri's core breathing in the dark. */
@Composable
fun LoadingOrb(caption: String? = null, modifier: Modifier = Modifier) {
    val v by loop(1400, pingPong = true, rest = 0.5f, label = "breathe")
    Column(modifier.padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(18.dp)) {
        Orb(72.dp, CoreSkin, Modifier.graphicsLayer { val s = 0.9f + 0.18f * v; scaleX = s; scaleY = s }, glow = true)
        caption?.let { Text(it, color = Zuri.universe.inkMuted, fontFamily = Inter, fontWeight = FontWeight.SemiBold, fontSize = 13.sp) }
    }
}

/** An ion ring that expands and fades (unread / waiting on you). */
@Composable
fun PulseRing(size: Dp, color: Color = Zuri.universe.ion, modifier: Modifier = Modifier) {
    val p by loop(1800, label = "pulse")
    Canvas(modifier.size(size)) {
        val r = this.size.minDimension / 2 * (0.62f + 0.38f * p)
        drawCircle(color.copy(alpha = 0.9f * (1 - p)), r, style = androidx.compose.ui.graphics.drawscope.Stroke(2.dp.toPx()))
    }
}

@Suppress("unused") private val circle = CircleShape
