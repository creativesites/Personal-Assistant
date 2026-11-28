package app.zuri.android.core.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.platform.LocalContext

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.remember
import androidx.compose.ui.unit.dp

/** Universe radius scale: controls 18, cards 24, sheets 30 (chips are pills). */
internal val ZuriShapes = Shapes(
    extraSmall = RoundedCornerShape(10.dp),
    small = RoundedCornerShape(14.dp),
    medium = RoundedCornerShape(18.dp),
    large = RoundedCornerShape(24.dp),
    extraLarge = RoundedCornerShape(30.dp),
)

/** The app-wide motion speed (spec §3.5): every ambient loop's duration is multiplied by [multiplier]. */
enum class MotionLevel(val multiplier: Float) { CALM(1.9f), COSMIC(1f), HYPER(0.45f) }

/** [reduced] follows Android's "Remove animations": ambient loops freeze, entrances start finished. */
@Immutable
data class Motion(val level: MotionLevel, val reduced: Boolean) {
    fun ms(base: Int): Int = (base * level.multiplier).toInt().coerceAtLeast(1)
}

val LocalMotion = staticCompositionLocalOf { Motion(MotionLevel.COSMIC, reduced = false) }

/**
 * Zuri's theme. Both light and dark are first-class; [darkTheme] defaults to the system setting and
 * the app passes the user's choice (System / Light / Dark). [tint] is the active workspace's colour.
 * Dynamic colour is deliberately off: the context tint must mean the same thing on every device.
 */
@Composable
fun ZuriTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    tint: ZuriTint = ZuriTint.Teal,
    motionLevel: MotionLevel = MotionLevel.COSMIC,
    content: @Composable () -> Unit,
) {
    val context = LocalContext.current
    val reduced = remember(context) {
        android.provider.Settings.Global.getFloat(context.contentResolver, android.provider.Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
    }
    val colors = remember(darkTheme, tint) { zuriColors(darkTheme, tint) }
    val scheme = remember(colors) { materialScheme(colors) }
    val typography = remember { zuriTypography() }
    CompositionLocalProvider(
        LocalZuriColors provides colors,
        LocalUniverse provides if (darkTheme) NightSky else DaySky,
        LocalMotion provides Motion(motionLevel, reduced),
    ) {
        MaterialTheme(colorScheme = scheme, typography = typography, shapes = ZuriShapes, content = content)
    }
}

object Zuri {
    val colors: ZuriColors
        @Composable @ReadOnlyComposable get() = LocalZuriColors.current
    val universe: UniverseColors
        @Composable @ReadOnlyComposable get() = LocalUniverse.current
    val motion: Motion
        @Composable @ReadOnlyComposable get() = LocalMotion.current
}
