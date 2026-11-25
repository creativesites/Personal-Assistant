package app.zuri.android.feature.onboarding

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import app.zuri.android.core.ui.theme.ZuriTheme
import com.github.takahirom.roborazzi.captureRoboImage
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w411dp-h891dp-xxhdpi")
class OnboardingScreenshotTest {
    @get:Rule val compose = createComposeRule()

    private fun shot(name: String, dark: Boolean, content: @Composable () -> Unit) {
        compose.setContent { ZuriTheme(darkTheme = dark) { Surface(color = MaterialTheme.colorScheme.background) { content() } } }
        compose.onRoot().captureRoboImage("src/test/screenshots/$name.png")
    }

    @Test fun welcomeLight() = shot("onb_welcome_light", false) { WelcomeContent({}, {}) }
    @Test fun welcomeDark() = shot("onb_welcome_dark", true) { WelcomeContent({}, {}) }
    @Test fun privacyLight() = shot("onb_privacy_light", false) { PrivacyContent({}, {}) }
    @Test fun choiceDark() = shot("onb_choice_dark", true) { SetupChoiceContent(SetupStatus.Idle, {}, {}) }
}
