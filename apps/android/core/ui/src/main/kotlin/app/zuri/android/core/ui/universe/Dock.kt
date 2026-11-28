package app.zuri.android.core.ui.universe

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Badge
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.zuri.android.core.ui.theme.CoreSkin
import app.zuri.android.core.ui.theme.Inter
import app.zuri.android.core.ui.theme.Zuri

data class DockItem(val label: String, val icon: ImageVector, val core: Boolean = false, val badge: Int = 0)

val DockHeight: Dp = 74.dp

/** Bottom padding scrolling content needs so it clears the floating dock. */
@Composable
fun dockClearance(): Dp = DockHeight + WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding().coerceAtLeast(12.dp) + 24.dp

/**
 * The orbit dock (spec "Dock"): a floating glass pill above the gesture bar. Wing tabs show an icon,
 * a label and an ion dot when active; the [DockItem.core] tab is the raised, pulsing violet core.
 */
@Composable
fun Dock(items: List<DockItem>, selected: Int, onSelect: (Int) -> Unit, modifier: Modifier = Modifier) {
    val u = Zuri.universe
    val haptics = LocalHapticFeedback.current
    val bottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding().coerceAtLeast(12.dp) + 6.dp
    Box(modifier.fillMaxWidth().padding(start = 18.dp, end = 18.dp, bottom = bottom), contentAlignment = Alignment.BottomCenter) {
        Row(
            Modifier.fillMaxWidth().height(DockHeight).clip(RoundedCornerShape(30.dp)).background(u.chrome).glass(RoundedCornerShape(30.dp)).padding(horizontal = 6.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceAround,
        ) {
            items.forEachIndexed { i, item ->
                val on = i == selected
                val go = { if (!on) { haptics.performHapticFeedback(HapticFeedbackType.ContextClick); onSelect(i) } }
                if (item.core) {
                    Spacer(Modifier.size(76.dp))
                } else {
                    val c = if (on) u.ink else u.inkMuted
                    Column(
                        Modifier.widthIn(min = 56.dp).heightIn(min = 56.dp).clip(RoundedCornerShape(18.dp))
                            .semantics { this.selected = on; contentDescription = item.label }
                            .clickable(role = Role.Tab, onClick = go),
                        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center,
                    ) {
                        Box {
                            Icon(item.icon, null, tint = c, modifier = Modifier.size(24.dp))
                            if (item.badge > 0) Badge(Modifier.align(Alignment.TopEnd).offset(8.dp, (-4).dp), containerColor = u.ion, contentColor = u.void) {
                                Text(if (item.badge > 99) "99+" else item.badge.toString(), fontSize = 9.sp)
                            }
                        }
                        Text(item.label, color = c, fontFamily = Inter, fontWeight = FontWeight.SemiBold, fontSize = 11.sp, letterSpacing = 0.2.sp, maxLines = 1)
                        Box(Modifier.padding(top = 3.dp).size(4.dp).clip(CircleShape).background(if (on) u.ion else Color.Transparent))
                    }
                }
            }
        }
        // The raised core pokes above the bar.
        items.indexOfFirst { it.core }.takeIf { it >= 0 }?.let { i ->
            val item = items[i]
            CoreButton(item, i == selected, Modifier.align(Alignment.BottomCenter).offset(y = (-DockHeight / 2) - 4.dp)) {
                if (i != selected) { haptics.performHapticFeedback(HapticFeedbackType.ContextClick); onSelect(i) }
            }
        }
    }
}

@Composable
private fun CoreButton(item: DockItem, on: Boolean, modifier: Modifier, onClick: () -> Unit) {
    val u = Zuri.universe
    val p by loop(2800, label = "core")
    Box(
        modifier.size(76.dp).semantics { selected = on; contentDescription = item.label }.clip(CircleShape).clickable(role = Role.Tab, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.size(76.dp)) {
            val halo = if (p < 0.8f) 0.7f * (1 - p / 0.8f) else 0f
            drawCircle(Color(0xCC9B7BFF).copy(alpha = halo), size.minDimension / 2 * 0.87f * (1 + 0.7f * p), style = Stroke(3.dp.toPx()))
            drawCircle(if (u.night) Color(0xEB05060F) else Color(0xF2FFFFFF), size.minDimension / 2 * 0.95f)
        }
        Orb(60.dp, CoreSkin, glow = true) { Icon(item.icon, null, tint = Color.White, modifier = Modifier.size(26.dp)) }
        if (on) Box(Modifier.align(Alignment.BottomCenter).padding(bottom = 1.dp).size(4.dp).clip(CircleShape).background(u.ion))
    }
}
