package app.zuri.android.core.ui.theme

import androidx.compose.material3.ColorScheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

internal object Palette {
    val Brand = Color(0xFF4F46E5)
    val BrandCyan = Color(0xFF06B6D4)

    // Light
    val BgLight = Color(0xFFF6F7FB)
    val SurfaceLight = Color(0xFFFFFFFF)
    val Surface2Light = Color(0xFFEEF1F7)
    val Surface3Light = Color(0xFFE4E8F1)
    val InkLight = Color(0xFF0F1726)
    val MutedLight = Color(0xFF5A6377)
    val FaintLight = Color(0xFF8A92A3)
    val LineLight = Color(0xFFE3E7EF)

    // Dark: the same design at night, not an inversion
    val BgDark = Color(0xFF0D1118)
    val SurfaceDark = Color(0xFF151B25)
    val Surface2Dark = Color(0xFF1C2330)
    val Surface3Dark = Color(0xFF252E3D)
    val InkDark = Color(0xFFE8EBF2)
    val MutedDark = Color(0xFF9AA3B5)
    val FaintDark = Color(0xFF6C7587)
    val LineDark = Color(0xFF262E3C)
}

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

internal fun zuriColors(dark: Boolean, tint: ZuriTint) = if (dark) {
    ZuriColors(
        dark = true, tint = tint, ctx = tint.base, ctxWeak = tint.weakDark, ctxInk = tint.inkDark,
        brand = Palette.Brand, surface2 = Palette.Surface2Dark, surface3 = Palette.Surface3Dark,
        muted = Palette.MutedDark, faint = Palette.FaintDark, line = Palette.LineDark,
        ok = Color(0xFF34D399), okWeak = Color(0xFF11301F),
        warn = Color(0xFFFBBF24), warnWeak = Color(0xFF33260C),
        bad = Color(0xFFF87171), badWeak = Color(0xFF3A1517),
    )
} else {
    ZuriColors(
        dark = false, tint = tint, ctx = tint.base, ctxWeak = tint.weakLight, ctxInk = tint.inkLight,
        brand = Palette.Brand, surface2 = Palette.Surface2Light, surface3 = Palette.Surface3Light,
        muted = Palette.MutedLight, faint = Palette.FaintLight, line = Palette.LineLight,
        ok = Color(0xFF0F8A4E), okWeak = Color(0xFFE3F6EC),
        warn = Color(0xFFB45309), warnWeak = Color(0xFFFDF1DC),
        bad = Color(0xFFC2343B), badWeak = Color(0xFFFBE5E6),
    )
}

/** Material slots follow the context tint, so standard components (switches, nav) show context too. */
internal fun materialScheme(c: ZuriColors): ColorScheme = if (c.dark) {
    darkColorScheme(
        primary = c.ctx, onPrimary = Color.White,
        primaryContainer = c.ctxWeak, onPrimaryContainer = c.ctxInk,
        secondary = c.ctxInk, onSecondary = Palette.BgDark,
        secondaryContainer = c.ctxWeak, onSecondaryContainer = c.ctxInk,
        tertiary = Palette.BrandCyan,
        background = Palette.BgDark, onBackground = Palette.InkDark,
        surface = Palette.BgDark, onSurface = Palette.InkDark,
        surfaceVariant = Palette.Surface2Dark, onSurfaceVariant = Palette.MutedDark,
        surfaceContainerLowest = Palette.BgDark, surfaceContainerLow = Palette.SurfaceDark,
        surfaceContainer = Palette.SurfaceDark, surfaceContainerHigh = Palette.Surface2Dark,
        surfaceContainerHighest = Palette.Surface3Dark,
        outline = Palette.FaintDark, outlineVariant = Palette.LineDark,
        error = c.bad, onError = Color.Black, errorContainer = c.badWeak, onErrorContainer = c.bad,
        inverseSurface = Palette.InkDark, inverseOnSurface = Palette.BgDark,
    )
} else {
    lightColorScheme(
        primary = c.ctx, onPrimary = Color.White,
        primaryContainer = c.ctxWeak, onPrimaryContainer = c.ctxInk,
        secondary = c.ctxInk, onSecondary = Color.White,
        secondaryContainer = c.ctxWeak, onSecondaryContainer = c.ctxInk,
        tertiary = Palette.BrandCyan,
        background = Palette.BgLight, onBackground = Palette.InkLight,
        surface = Palette.BgLight, onSurface = Palette.InkLight,
        surfaceVariant = Palette.Surface2Light, onSurfaceVariant = Palette.MutedLight,
        surfaceContainerLowest = Palette.SurfaceLight, surfaceContainerLow = Palette.SurfaceLight,
        surfaceContainer = Palette.SurfaceLight, surfaceContainerHigh = Palette.Surface2Light,
        surfaceContainerHighest = Palette.Surface3Light,
        outline = Palette.FaintLight, outlineVariant = Palette.LineLight,
        error = c.bad, onError = Color.White, errorContainer = c.badWeak, onErrorContainer = c.bad,
        inverseSurface = Palette.InkLight, inverseOnSurface = Palette.BgLight,
    )
}

val LocalZuriColors = staticCompositionLocalOf { zuriColors(dark = false, tint = ZuriTint.Teal) }
