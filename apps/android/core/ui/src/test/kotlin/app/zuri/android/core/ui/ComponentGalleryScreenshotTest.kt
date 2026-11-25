package app.zuri.android.core.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Cake
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.Storefront
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.unit.dp
import app.zuri.android.core.ui.components.CaptureState
import app.zuri.android.core.ui.components.CardStyle
import app.zuri.android.core.ui.components.ConfidenceMeter
import app.zuri.android.core.ui.components.EmptyState
import app.zuri.android.core.ui.components.IconChip
import app.zuri.android.core.ui.components.RootTopBar
import app.zuri.android.core.ui.components.SectionHeader
import app.zuri.android.core.ui.components.StatusTag
import app.zuri.android.core.ui.components.Tone
import app.zuri.android.core.ui.components.ZuriCard
import app.zuri.android.core.ui.components.ZuriListGroup
import app.zuri.android.core.ui.components.ZuriListRow
import app.zuri.android.core.ui.theme.ZuriTheme
import app.zuri.android.core.ui.theme.ZuriTint
import com.github.takahirom.roborazzi.captureRoboImage
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** The design system in light and dark, and with a business tint. Baselines live in src/test/screenshots. */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w411dp-h891dp-xxhdpi")
class ComponentGalleryScreenshotTest {
    @get:Rule val compose = createComposeRule()

    private fun shot(name: String, dark: Boolean, tint: ZuriTint) {
        compose.setContent { ZuriTheme(darkTheme = dark, tint = tint) { Gallery(tint) } }
        compose.onRoot().captureRoboImage("src/test/screenshots/$name.png")
    }

    @Test fun personalLight() = shot("gallery_personal_light", false, ZuriTint.Teal)
    @Test fun personalDark() = shot("gallery_personal_dark", true, ZuriTint.Teal)
    @Test fun businessDark() = shot("gallery_business_dark", true, ZuriTint.Indigo)
}

@Composable
private fun Gallery(tint: ZuriTint) {
    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column {
            RootTopBar(
                if (tint == ZuriTint.Teal) "Personal" else "Kalulu Irrigation",
                if (tint == ZuriTint.Teal) Icons.Rounded.Person else Icons.Rounded.Storefront,
                CaptureState.Listening, {}, {},
            )
            Text("Good morning, Natasha", style = MaterialTheme.typography.headlineLarge, modifier = Modifier.padding(horizontal = 20.dp))
            ZuriCard(style = CardStyle.Tinted) {
                Text("3 things need you today", style = MaterialTheme.typography.titleMedium)
                Text("Sample content for the component gallery.", style = MaterialTheme.typography.bodyMedium)
            }
            SectionHeader("Coming up", action = "All", onAction = {})
            ZuriListGroup(rows = listOf(
                { ZuriListRow("Chanda’s mum turns 60", supporting = "Mon 14 Dec · mentioned this morning", leading = { IconChip(Icons.Rounded.Cake) }, trailing = { ConfidenceMeter(4) }) },
                { ZuriListRow("Encrypted on this phone", supporting = "Verified", trailing = { StatusTag("Encrypted", tone = Tone.Ok) }) },
                { ZuriListRow("Block screenshots", trailing = { Switch(checked = true, onCheckedChange = {}) }) },
            ))
            Row(Modifier.padding(16.dp), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                Button(onClick = {}) { Text("Primary") }
                Spacer(Modifier.width(8.dp))
                OutlinedButton(onClick = {}) { Text("Secondary") }
                Spacer(Modifier.width(8.dp))
                StatusTag("3 days", tone = Tone.Warn)
            }
            EmptyState(Icons.Rounded.Cake, "Nothing here yet", "An honest empty state explains what is missing and why.")
        }
    }
}
