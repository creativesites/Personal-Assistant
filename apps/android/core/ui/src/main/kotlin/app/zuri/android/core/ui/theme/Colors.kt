package app.zuri.android.core.ui.theme

import androidx.compose.material3.ColorScheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

/** Colours Material 3 has no slot for: status tones, extra surfaces, and the context tint. */
@Immutable
data class ZuriColors(
    val dark: Boolean,
    val tint: ZuriTint,
    val ctx: Color,
    val ctxWeak: Color,
    val ctxInk: Color,
    val brand: Color,
    val surface2: Color,
    val surface3: Color,
    val muted: Color,
    val faint: Color,
    val line: Color,
    val ok: Color, val okWeak: Color,
    val warn: Color, val warnWeak: Color,
    val bad: Color, val badWeak: Color,
)

/**
 * Zuri's app-wide colours, now drawn from the Universe sky (Universe.kt): [dark] means the night
 * sky. Surfaces are translucent glass so the starfield shows through; the context tint still marks
 * the active workspace.
 */
internal fun zuriColors(dark: Boolean, tint: ZuriTint): ZuriColors {
    val u = if (dark) NightSky else DaySky
    return if (dark) ZuriColors(
        dark = true, tint = tint, ctx = tint.base, ctxWeak = tint.weakDark, ctxInk = tint.inkDark,
        brand = u.nebula, surface2 = Color(0x14FFFFFF), surface3 = Color(0x24FFFFFF),
        muted = u.inkMuted, faint = Color(0xFF7D84A8), line = u.glassBorder,
        ok = u.aurora, okWeak = Color(0x265BF5B0),
        warn = u.star, warnWeak = Color(0x26FFB86B),
        bad = Color(0xFFFF7A85), badWeak = Color(0x29FF7A85),
    ) else ZuriColors(
        dark = false, tint = tint, ctx = tint.base, ctxWeak = tint.weakLight, ctxInk = tint.inkLight,
        brand = u.nebula, surface2 = Color(0xB3FFFFFF), surface3 = Color(0x1A2A2466),
        muted = u.inkMuted, faint = Color(0xFF7A80A0), line = u.glassBorder,
        ok = u.aurora, okWeak = Color(0x1F047857),
        warn = u.star, warnWeak = Color(0x1FB45309),
        bad = Color(0xFFC2343B), badWeak = Color(0x1FC2343B),
    )
}

/** Material slots: violet nebula is the primary; surfaces stay clear so the sky shows; sheets are deep cards. */
internal fun materialScheme(c: ZuriColors): ColorScheme {
    val u = if (c.dark) NightSky else DaySky
    val card = if (c.dark) Color(0xFF15123A) else Color(0xFFFFFFFF)
    val cardHigh = if (c.dark) Color(0xFF1E1A4A) else Color(0xFFF3F1FF)
    return if (c.dark) darkColorScheme(
        primary = u.nebula, onPrimary = Color.White,
        primaryContainer = Color(0x407C5CFF), onPrimaryContainer = u.nebulaSoft,
        secondary = u.ion, onSecondary = u.void,
        secondaryContainer = Color(0x2E7DF9FF), onSecondaryContainer = u.ion,
        tertiary = u.sun,
        background = u.space, onBackground = u.ink,
        surface = Color.Transparent, onSurface = u.ink,
        surfaceVariant = c.surface2, onSurfaceVariant = u.inkMuted,
        surfaceContainerLowest = u.void, surfaceContainerLow = card,
        surfaceContainer = card, surfaceContainerHigh = cardHigh,
        surfaceContainerHighest = cardHigh,
        outline = c.faint, outlineVariant = u.glassBorder,
        error = c.bad, onError = Color.Black, errorContainer = c.badWeak, onErrorContainer = c.bad,
        inverseSurface = u.ink, inverseOnSurface = u.void,
        scrim = Color(0xCC03040B),
    ) else lightColorScheme(
        primary = u.nebula, onPrimary = Color.White,
        primaryContainer = Color(0x265B3DF5), onPrimaryContainer = u.nebulaSoft,
        secondary = u.ion, onSecondary = Color.White,
        secondaryContainer = Color(0x1F0E7490), onSecondaryContainer = u.ion,
        tertiary = u.sun,
        background = u.space, onBackground = u.ink,
        surface = Color.Transparent, onSurface = u.ink,
        surfaceVariant = c.surface2, onSurfaceVariant = u.inkMuted,
        surfaceContainerLowest = Color.White, surfaceContainerLow = card,
        surfaceContainer = card, surfaceContainerHigh = cardHigh,
        surfaceContainerHighest = cardHigh,
        outline = c.faint, outlineVariant = u.glassBorder,
        error = c.bad, onError = Color.White, errorContainer = c.badWeak, onErrorContainer = c.bad,
        inverseSurface = u.ink, inverseOnSurface = Color.White,
    )
}

val LocalZuriColors = staticCompositionLocalOf { zuriColors(dark = false, tint = ZuriTint.Teal) }
