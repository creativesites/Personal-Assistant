package app.zuri.android.feature.people

import androidx.compose.runtime.Composable
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import app.zuri.android.core.ui.theme.ZuriTheme
import app.zuri.android.core.ui.universe.SpaceBackground
import app.zuri.android.domain.inbox.ConversationId
import app.zuri.android.domain.people.HealthTrend
import app.zuri.android.domain.people.Relationship
import app.zuri.android.domain.workspace.WorkspaceId
import com.github.takahirom.roborazzi.captureRoboImage
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** Orbits in both skies. All names are invented. */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w411dp-h891dp-xxhdpi")
class OrbitsScreenshotTest {
    @get:Rule val compose = createComposeRule()

    private fun shot(name: String, dark: Boolean, content: @Composable () -> Unit) {
        compose.setContent { ZuriTheme(darkTheme = dark) { SpaceBackground { content() } } }
        compose.onRoot().captureRoboImage("src/test/screenshots/$name.png")
    }

    private fun r(id: String, name: String, score: Int, tier: Int, trend: HealthTrend, reason: String) = Relationship(
        ConversationId(id), WorkspaceId("ws"), name, score, trend, tier, 1_764_000_000_000L, 3.0, null, reason, 120,
    )

    private val people = listOf(
        r("a", "Natasha", 88, 1, HealthTrend.IMPROVING, "Messaged yesterday; Mostly positive tone recently"),
        r("b", "Mum", 81, 1, HealthTrend.STABLE, "Messaged today"),
        r("c", "Chanda Mwila", 64, 2, HealthTrend.STABLE, "Last messaged 5 days ago"),
        r("d", "Bwalya", 47, 3, HealthTrend.DECLINING, "Fewer messages this week than usual (0 vs ~3); 19 days since last message"),
        r("e", "Kalulu Irrigation", 40, 3, HealthTrend.DECLINING, "40 days of silence — past the usual gap"),
        r("f", "Mwape", 22, 4, HealthTrend.STABLE, "999 days of silence — well past the usual gap"),
    )

    @Test fun orbitsDark() = shot("orbits_dark", true) { OrbitsContent(OrbitsState(loading = false, people = people)) }
    @Test fun orbitsLight() = shot("orbits_light", false) { OrbitsContent(OrbitsState(loading = false, people = people)) }
    @Test fun emptyDark() = shot("orbits_empty_dark", true) { OrbitsContent(OrbitsState(loading = false)) }
}
