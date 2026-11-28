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

private fun variable(res: Int, weight: Int) = Font(
    res, weight = FontWeight(weight),
    variationSettings = FontVariation.Settings(FontVariation.weight(weight)),
)

/** Display: Space Grotesk (titles, the wordmark, numbers). Body and labels: Inter. Both bundled, OFL. */
val SpaceGrotesk = FontFamily(variable(R.font.space_grotesk_variable, 600), variable(R.font.space_grotesk_variable, 700))
val Inter = FontFamily(
    variable(R.font.inter_variable, 400), variable(R.font.inter_variable, 500), variable(R.font.inter_variable, 600),
    variable(R.font.inter_variable, 700), variable(R.font.inter_variable, 800),
)

internal fun zuriTypography(): Typography {
    val base = Typography()
    fun head(size: Double, weight: Int, line: Int, track: Double = -0.03) = TextStyle(
        fontFamily = SpaceGrotesk, fontWeight = FontWeight(weight), fontSize = size.sp,
        lineHeight = line.sp, letterSpacing = track.em,
    )
    fun body(size: Double, weight: Int, line: Double, track: Double = 0.0) = TextStyle(
        fontFamily = Inter, fontWeight = FontWeight(weight), fontSize = size.sp, lineHeight = line.sp, letterSpacing = track.em,
    )
    return base.copy(
        displayLarge = head(66.0, 700, 70, -0.045),
        displayMedium = head(44.0, 700, 48, -0.04),
        displaySmall = head(38.0, 700, 44, -0.04),
        headlineLarge = head(32.0, 700, 38, -0.035),
        headlineMedium = head(26.0, 700, 32),
        headlineSmall = head(22.0, 700, 28, -0.03),
        titleLarge = head(19.0, 700, 24, -0.03),
        titleMedium = body(15.0, 700, 20.0),
        titleSmall = body(14.0, 700, 18.0),
        bodyLarge = body(15.5, 400, 22.5),
        bodyMedium = body(14.0, 400, 20.0),
        bodySmall = body(12.5, 400, 17.0),
        labelLarge = body(14.0, 600, 18.0),
        labelMedium = body(12.0, 600, 16.0),
        labelSmall = body(11.0, 700, 14.0, 0.06),
    )
}
