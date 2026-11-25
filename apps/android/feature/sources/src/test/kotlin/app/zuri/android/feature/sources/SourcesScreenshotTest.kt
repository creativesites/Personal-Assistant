package app.zuri.android.feature.sources

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import app.zuri.android.core.ui.theme.ZuriTheme
import app.zuri.android.domain.capture.CaptureStatus
import app.zuri.android.domain.capture.SourceKind
import app.zuri.android.domain.capture.SourceSetting
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
class SourcesScreenshotTest {
    @get:Rule val compose = createComposeRule()

    private fun shot(name: String, dark: Boolean, content: @Composable () -> Unit) {
        compose.setContent { ZuriTheme(darkTheme = dark) { Surface(color = MaterialTheme.colorScheme.background) { content() } } }
        compose.onRoot().captureRoboImage("src/test/screenshots/$name.png")
    }

    private fun rows(enabled: Set<SourceKind>, counts: Map<SourceKind, Int> = emptyMap()) = SourceKind.entries.map {
        SourceRow(SourceSetting(it, enabled = it in enabled), installed = it in setOf(SourceKind.WHATSAPP, SourceKind.WHATSAPP_BUSINESS, SourceKind.TELEGRAM, SourceKind.GMAIL, SourceKind.GOOGLE_MESSAGES), messageCount = counts[it] ?: 0)
    }.sortedWith(compareByDescending<SourceRow> { it.setting.enabled }.thenByDescending { it.installed })

    private val off = SourcesState(CaptureStatus.Off, rows(emptySet()))
    private val needsAccess = SourcesState(
        CaptureStatus(accessGranted = false, listenerConnected = false, paused = false, enabledSources = setOf(SourceKind.WHATSAPP), lastCaptureAtMillis = null, capturedToday = 0),
        rows(setOf(SourceKind.WHATSAPP)),
    )
    private val listening = SourcesState(
        CaptureStatus(true, true, false, setOf(SourceKind.WHATSAPP, SourceKind.GMAIL), lastCaptureAtMillis = null, capturedToday = 0),
        rows(setOf(SourceKind.WHATSAPP, SourceKind.GMAIL), mapOf(SourceKind.WHATSAPP to 128, SourceKind.GMAIL to 9)),
    )

    @Test fun offLight() = shot("sources_off_light", false) { SourcesContent(off, SourcesActions()) }
    @Test fun needsAccessLight() = shot("sources_access_light", false) { SourcesContent(needsAccess, SourcesActions()) }
    @Test fun needsAccessDark() = shot("sources_access_dark", true) { SourcesContent(needsAccess, SourcesActions()) }
    @Test fun listeningDark() = shot("sources_listening_dark", true) { SourcesContent(listening, SourcesActions()) }
    @Test fun disclosureLight() = shot("disclosure_light", false) { AccessDisclosureContent({}, {}) }
    @Test fun disclosureDark() = shot("disclosure_dark", true) { AccessDisclosureContent({}, {}) }
}
