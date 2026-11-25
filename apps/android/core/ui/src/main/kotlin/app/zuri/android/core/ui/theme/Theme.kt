package app.zuri.android.core.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.remember
import androidx.compose.ui.unit.dp

internal val ZuriShapes = Shapes(
    extraSmall = RoundedCornerShape(8.dp),
    small = RoundedCornerShape(12.dp),
    medium = RoundedCornerShape(16.dp),
    large = RoundedCornerShape(24.dp),
    extraLarge = RoundedCornerShape(28.dp),
)

/**
 * Zuri's theme. Both light and dark are first-class; [darkTheme] defaults to the system setting and
 * the app passes the user's choice (System / Light / Dark). [tint] is the active workspace's colour.
 * Dynamic colour is deliberately off: the context tint must mean the same thing on every device.
 */
@Composable
fun ZuriTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    tint: ZuriTint = ZuriTint.Teal,
    content: @Composable () -> Unit,
) {
    val colors = remember(darkTheme, tint) { zuriColors(darkTheme, tint) }
    val scheme = remember(colors) { materialScheme(colors) }
    val typography = remember { zuriTypography() }
    CompositionLocalProvider(LocalZuriColors provides colors) {
        MaterialTheme(colorScheme = scheme, typography = typography, shapes = ZuriShapes, content = content)
    }
}

object Zuri {
    val colors: ZuriColors
        @Composable @ReadOnlyComposable get() = LocalZuriColors.current
}
