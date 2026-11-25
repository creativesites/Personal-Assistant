package app.zuri.android.core.ui.theme

import androidx.compose.ui.graphics.Color

/**
 * The colour of the active context (DESIGN_REVIEW.md §2). It drives the top-bar band, the context
 * chip, primary buttons and selection, so the workspace is visible from every screen.
 * Each tint has a light and a dark variant: [base] for fills, [weak] for tinted surfaces,
 * [ink] for text and icons on [weak].
 */
enum class ZuriTint(
    val base: Color,
    val weakLight: Color, val inkLight: Color,
    val weakDark: Color, val inkDark: Color,
) {
    Teal(Color(0xFF0F8C7A), Color(0xFFE2F4F1), Color(0xFF0B6B5D), Color(0xFF0F2A27), Color(0xFF5EEAD4)),
    Indigo(Color(0xFF4F46E5), Color(0xFFE9E8FD), Color(0xFF3730A3), Color(0xFF1D1B3F), Color(0xFFA5B4FC)),
    Plum(Color(0xFFA3367F), Color(0xFFF8E6F2), Color(0xFF86275F), Color(0xFF371230), Color(0xFFF0ABFC)),
    Amber(Color(0xFFB45309), Color(0xFFFDF1DC), Color(0xFF92400E), Color(0xFF33260C), Color(0xFFFBBF24)),
    Sky(Color(0xFF0369A1), Color(0xFFE0F2FE), Color(0xFF075985), Color(0xFF0B2536), Color(0xFF7DD3FC)),
    Slate(Color(0xFF475569), Color(0xFFE8ECF2), Color(0xFF334155), Color(0xFF1F2632), Color(0xFFCBD5E1));

    fun weak(dark: Boolean) = if (dark) weakDark else weakLight
    fun ink(dark: Boolean) = if (dark) inkDark else inkLight
}
