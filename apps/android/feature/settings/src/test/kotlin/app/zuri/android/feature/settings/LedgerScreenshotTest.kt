package app.zuri.android.feature.settings

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import app.zuri.android.core.ui.theme.ZuriTheme
import app.zuri.android.domain.privacy.EgressPurpose
import app.zuri.android.domain.privacy.EgressRecord
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
class LedgerScreenshotTest {
    @get:Rule val compose = createComposeRule()

    private fun shot(name: String, dark: Boolean, content: @Composable () -> Unit) {
        compose.setContent { ZuriTheme(darkTheme = dark) { app.zuri.android.core.ui.universe.SpaceBackground { content() } } }
        compose.onRoot().captureRoboImage("src/test/screenshots/$name.png")
    }

    private val records = listOf(
        EgressRecord("2", 0, EgressPurpose.MODEL_DOWNLOAD, "cas-bridge.xethub.hf.co", "granite-4.0-350m_q8_ekv1280.litertlm", 0, 468_209_584),
        EgressRecord("1", 0, EgressPurpose.MODEL_DOWNLOAD, "huggingface.co", "granite-4.0-350m_q8_ekv1280.litertlm (interrupted)", 0, 120_000_000),
    )

    @Test fun emptyLight() = shot("ledger_empty_light", false) { LedgerContent(emptyList(), {}) }
    @Test fun recordsDark() = shot("ledger_dark", true) { LedgerContent(records, {}) { "25 Nov 2026, 07:10" } }
}
