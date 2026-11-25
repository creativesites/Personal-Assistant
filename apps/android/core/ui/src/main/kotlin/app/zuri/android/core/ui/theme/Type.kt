package app.zuri.android.core.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import app.zuri.android.core.ui.R

private fun manrope(weight: Int) = Font(
    R.font.manrope_variable,
    weight = FontWeight(weight),
    variationSettings = FontVariation.Settings(FontVariation.weight(weight)),
)

/** Headings and numbers: Manrope (bundled, OFL). Body: the platform's own sans (Roboto on most devices). */
val Manrope = FontFamily(manrope(500), manrope(600), manrope(700), manrope(800))

internal fun zuriTypography(): Typography {
    val base = Typography()
    fun head(size: Int, weight: Int, line: Int, track: Double = -0.02) = TextStyle(
        fontFamily = Manrope, fontWeight = FontWeight(weight), fontSize = size.sp,
        lineHeight = line.sp, letterSpacing = track.em,
    )
    return base.copy(
        displayLarge = head(44, 800, 48),
        displayMedium = head(36, 800, 40),
        displaySmall = head(30, 750, 34),
        headlineLarge = head(28, 750, 32),
        headlineMedium = head(24, 750, 28),
        headlineSmall = head(20, 700, 26, -0.01),
        titleLarge = head(19, 650, 24, -0.01),
        titleMedium = head(15, 700, 20, 0.0),
        titleSmall = head(14, 700, 18, 0.0),
        bodyLarge = base.bodyLarge.copy(fontSize = 15.sp, lineHeight = 22.sp),
        bodyMedium = base.bodyMedium.copy(fontSize = 14.sp, lineHeight = 20.sp),
        bodySmall = base.bodySmall.copy(fontSize = 12.5.sp, lineHeight = 17.sp),
        labelLarge = base.labelLarge.copy(fontSize = 14.5.sp, fontWeight = FontWeight.SemiBold),
    )
}
