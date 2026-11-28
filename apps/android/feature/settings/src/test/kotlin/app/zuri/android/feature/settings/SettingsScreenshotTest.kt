package app.zuri.android.feature.settings

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import app.zuri.android.core.ui.theme.ZuriTheme
import app.zuri.android.domain.privacy.DeviceAccessReport
import app.zuri.android.domain.privacy.StorageReport
import app.zuri.android.domain.settings.ThemeMode
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
class SettingsScreenshotTest {
    @get:Rule val compose = createComposeRule()

    private fun shot(name: String, dark: Boolean, content: @Composable () -> Unit) {
        compose.setContent { ZuriTheme(darkTheme = dark) { app.zuri.android.core.ui.universe.SpaceBackground { content() } } }
        compose.onRoot().captureRoboImage("src/test/screenshots/$name.png")
    }

    private val privacy = PrivacyState(
        storage = StorageReport(databaseBytes = 98_304, databaseEncryptionVerified = true, workspaceCount = 2, messageCount = 128, rawSnapshotCount = 14),
        access = DeviceAccessReport(hasNetworkPermission = false, notificationAccessGranted = false, contactsPermissionGranted = false, calendarPermissionGranted = false, deviceLockConfigured = true),
    )

    @Test fun settingsLight() = shot("settings_light", false) { SettingsContent(SettingsState(ThemeMode.LIGHT), "0.1.0-m1", {}, {}, {}, {}, {}) }
    @Test fun settingsDark() = shot("settings_dark", true) { SettingsContent(SettingsState(ThemeMode.DARK), "0.1.0-m1", {}, {}, {}, {}, {}) }
    @Test fun securityDark() = shot("security_dark", true) { SecurityContent(SettingsState(), {}, {}, {}, {}) }
    @Test fun privacyLight() = shot("privacy_light", false) { PrivacyCenterContent(privacy, {}) }
    @Test fun privacyDark() = shot("privacy_dark", true) { PrivacyCenterContent(privacy, {}) }
}
