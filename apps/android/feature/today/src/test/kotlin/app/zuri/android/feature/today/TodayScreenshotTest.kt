package app.zuri.android.feature.today

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import app.zuri.android.core.ui.theme.ZuriTheme
import com.github.takahirom.roborazzi.captureRoboImage
import app.zuri.android.domain.capture.CaptureHealth
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w411dp-h891dp-xxhdpi")
class TodayScreenshotTest {
    @get:Rule val compose = createComposeRule()
    private val state = TodayState(DayPart.Morning, "Tuesday, 24 November", "Personal")

    private fun shot(name: String, dark: Boolean, s: TodayState = state) {
        compose.setContent { ZuriTheme(darkTheme = dark) { Surface(color = MaterialTheme.colorScheme.background) { TodayContent(s, {}, {}) } } }
        compose.onRoot().captureRoboImage("src/test/screenshots/$name.png")
    }

    @Test fun firstDayLight() = shot("today_first_day_light", false)
    @Test fun firstDayDark() = shot("today_first_day_dark", true)
    @Test fun listeningDark() = shot("today_listening_dark", true, state.copy(capture = CaptureHealth.LISTENING, capturedToday = 14))
}
