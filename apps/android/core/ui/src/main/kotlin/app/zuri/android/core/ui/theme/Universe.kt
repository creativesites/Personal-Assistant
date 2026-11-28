package app.zuri.android.core.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

/**
 * Zuri Universe tokens (docs/MOBILE_UNIVERSE_DESIGN.md §3). The owner is the sun, contacts are
 * planets, relationship health is orbital distance. The spec's night sky is the default; the
 * daylight sky is the same roles in light tints, for owners who pick Light (owner decision 2026-11-28).
 */
@Immutable
data class UniverseColors(
    val night: Boolean,
    /** Sky gradient, top to bottom. */
    val sky: List<Color>,
    val void: Color,
    val space: Color,
    /** Text: primary, body, labels (labels keep ≥ 4.5:1 on [space]). */
    val ink: Color,
    val inkSoft: Color,
    val inkMuted: Color,
    val nebula: Color,
    val nebulaSoft: Color,
    val ion: Color,
    val sun: Color,
    val aurora: Color,
    val ember: Color,
    val star: Color,
    /** Glass surfaces: translucent gradient over the sky plus a hairline. */
    val glassTop: Color,
    val glassBottom: Color,
    val glassBorder: Color,
    /** Opaque deep cards: sheets, holo drafts, missions. */
    val cardTop: Color,
    val cardBottom: Color,
    /** Nebula clouds and star colours in the sky. */
    val nebulaClouds: List<Color>,
    val starColors: List<Color>,
    /** Dock / chrome fill. */
    val chrome: Color,
)

/** Primary CTA, the owner's bubbles: violet → purple → cyan. Same in both skies. */
val LaunchGradient = listOf(Color(0xFF6A45FF), Color(0xFF9B5CFF), Color(0xFF3EC6E0))
val OutgoingGradient = listOf(Color(0xFF6A45FF), Color(0xFF9B5CFF))

internal val NightSky = UniverseColors(
    night = true,
    sky = listOf(Color(0xFF140F33), Color(0xFF070818), Color(0xFF03040B)),
    void = Color(0xFF03040B), space = Color(0xFF070818),
    ink = Color(0xFFEEF0FF), inkSoft = Color(0xFFB9BFE0), inkMuted = Color(0xFFA3AACC),
    nebula = Color(0xFF7C5CFF), nebulaSoft = Color(0xFFCFC4FF), ion = Color(0xFF7DF9FF),
    sun = Color(0xFFFF9E4A), aurora = Color(0xFF5BF5B0), ember = Color(0xFFFF966E), star = Color(0xFFFFB86B),
    glassTop = Color(0x1CFFFFFF), glassBottom = Color(0x08FFFFFF), glassBorder = Color(0x21FFFFFF),
    cardTop = Color(0xF21C1842), cardBottom = Color(0xF50A0B1E),
    nebulaClouds = listOf(Color(0x617C5CFF), Color(0x333EE6E0), Color(0x2BFF78AA)),
    starColors = listOf(Color(0xD9FFFFFF), Color(0xE6AAC8FF), Color(0xF2FFD2AA)),
    chrome = Color(0xB80C0C20),
)

/** The daylight sky: the same roles over a pale dawn gradient, with deeper accents for contrast. */
internal val DaySky = UniverseColors(
    night = false,
    sky = listOf(Color(0xFFE7E3FF), Color(0xFFF1F2FF), Color(0xFFFBFBFF)),
    void = Color(0xFFFBFBFF), space = Color(0xFFF1F2FF),
    ink = Color(0xFF12142B), inkSoft = Color(0xFF353A5E), inkMuted = Color(0xFF575E82),
    nebula = Color(0xFF5B3DF5), nebulaSoft = Color(0xFF4A32C9), ion = Color(0xFF0E7490),
    sun = Color(0xFFE8711A), aurora = Color(0xFF047857), ember = Color(0xFFC2410C), star = Color(0xFFB45309),
    glassTop = Color(0xC7FFFFFF), glassBottom = Color(0x8CFFFFFF), glassBorder = Color(0x1F2A2466),
    cardTop = Color(0xFAFFFFFF), cardBottom = Color(0xF5F3F1FF),
    nebulaClouds = listOf(Color(0x4D9B7BFF), Color(0x3366E3F0), Color(0x2EFF9EC4)),
    starColors = listOf(Color(0x597C5CFF), Color(0x4D3EA6E0), Color(0x59FF9E4A)),
    chrome = Color(0xE6FFFFFF),
)

val LocalUniverse = staticCompositionLocalOf { NightSky }

/** A planet's surface: highlight, body, shadow. */
@Immutable
data class PlanetSkin(val highlight: Color, val body: Color, val shadow: Color)

val PlanetSkins = listOf(
    PlanetSkin(Color(0xFFFFD6F0), Color(0xFFFF6FB5), Color(0xFF7A1650)), // rose
    PlanetSkin(Color(0xFFFFF0D0), Color(0xFFFFB86B), Color(0xFF7A3A0A)), // amber
    PlanetSkin(Color(0xFFD8FFFB), Color(0xFF3EE6E0), Color(0xFF0B5A62)), // teal
    PlanetSkin(Color(0xFFE5F9D8), Color(0xFF7BE06A), Color(0xFF1D5A12)), // moss
    PlanetSkin(Color(0xFFE0E6FF), Color(0xFF6F8BFF), Color(0xFF16236E)), // cobalt
    PlanetSkin(Color(0xFFEDE0FF), Color(0xFFA57BFF), Color(0xFF341670)), // amethyst
    PlanetSkin(Color(0xFFFFF6C8), Color(0xFFF5D547), Color(0xFF6E5A06)), // citrine
    PlanetSkin(Color(0xFFFFE0D6), Color(0xFFFF8A6B), Color(0xFF6E200F)), // coral
)
val SunSkin = PlanetSkin(Color(0xFFFFE1A8), Color(0xFFFF9E4A), Color(0xFFB5361E))
val CoreSkin = PlanetSkin(Color(0xFFE9E3FF), Color(0xFF9B7BFF), Color(0xFF1B1150))
val ClearSkin = PlanetSkin(Color(0xFFBFFFE6), Color(0xFF5BF5B0), Color(0xFF0E5E43))

/** Same hash as the mobile app's skinFor, so a person is the same colour everywhere, forever. */
fun skinFor(seed: String): PlanetSkin {
    var h = 0
    for (ch in seed) h = h * 31 + ch.code
    return PlanetSkins[kotlin.math.abs(h % PlanetSkins.size)]
}

fun initialOf(name: String): String = name.trim().removePrefix("+").firstOrNull()?.uppercase() ?: "•"

enum class HealthBand(val label: String) { Thriving("Thriving"), Steady("Steady"), Drifting("Drifting"), Dormant("Dormant") }

/** Health score → band; same thresholds as the web relationship grid. */
fun healthBand(score: Int?): HealthBand = when {
    score == null -> HealthBand.Dormant
    score >= 75 -> HealthBand.Thriving
    score >= 50 -> HealthBand.Steady
    score >= 25 -> HealthBand.Drifting
    else -> HealthBand.Dormant
}

fun UniverseColors.bandColor(b: HealthBand): Color = when (b) {
    HealthBand.Thriving -> aurora
    HealthBand.Steady -> ion
    HealthBand.Drifting -> ember
    HealthBand.Dormant -> if (night) Color(0xFF8F97BD) else Color(0xFF6B7194)
}
