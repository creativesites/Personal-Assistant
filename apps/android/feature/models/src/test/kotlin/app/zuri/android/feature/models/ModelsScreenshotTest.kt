package app.zuri.android.feature.models

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import app.zuri.android.core.ui.theme.ZuriTheme
import app.zuri.android.domain.ai.DeviceProfile
import app.zuri.android.domain.ai.FailureReason
import app.zuri.android.domain.ai.ModelEntry
import app.zuri.android.domain.ai.ModelRole
import app.zuri.android.domain.ai.ModelSpec
import app.zuri.android.domain.ai.ModelState
import app.zuri.android.domain.ai.ModelTier
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
class ModelsScreenshotTest {
    @get:Rule val compose = createComposeRule()

    private fun shot(name: String, dark: Boolean, content: @Composable () -> Unit) {
        compose.setContent { ZuriTheme(darkTheme = dark) { Surface(color = MaterialTheme.colorScheme.background) { content() } } }
        compose.onRoot().captureRoboImage("src/test/screenshots/$name.png")
    }

    private fun spec(id: String, name: String, role: ModelRole, tier: ModelTier, size: Long, minRam: Long, params: String) =
        ModelSpec(id, name, role, tier, "$id.litertlm", "https://huggingface.co/x", "0", size, minRam, "Apache-2.0", "Google (litert-community)", null, params)

    private val gb = 1_000_000_000L
    // The owner's Galaxy S20 as measured: 7.8 GB RAM, 2.6 GB free.
    private val s20 = DeviceProfile(7_806_000_000, 2_600_000_000, listOf("arm64-v8a"), "Exynos 990", 33)
    private val e2b = spec("e2b", "Gemma 4 E2B", ModelRole.CHAT, ModelTier.STANDARD, 2_588_147_712, 6 * gb, "2B effective")
    private val granite = spec("granite", "Granite 4.0 350M", ModelRole.CHAT, ModelTier.LITE, 468_209_584, 3 * gb, "350M")
    private val e4b = spec("e4b", "Gemma 4 E4B", ModelRole.CHAT, ModelTier.HIGH, 3_659_530_240, 11 * gb, "4B effective")
    private val emb = spec("emb", "EmbeddingGemma 2 (text, 270M)", ModelRole.EMBEDDING, ModelTier.LITE, 164_626_432, 2 * gb, "270M")

    private val fresh = ModelsState(false, s20, listOf(ModelEntry(e2b, ModelState.NotInstalled), ModelEntry(granite, ModelState.NotInstalled), ModelEntry(e4b, ModelState.NotInstalled), ModelEntry(emb, ModelState.NotInstalled)))
    private val busy = ModelsState(false, s20.copy(freeStorageBytes = 9 * gb), listOf(
        ModelEntry(e2b, ModelState.Downloading(1_100_000_000, e2b.sizeBytes)),
        ModelEntry(granite, ModelState.Installed(granite.sizeBytes)),
        ModelEntry(e4b, ModelState.Failed(FailureReason.CHECKSUM_MISMATCH)),
        ModelEntry(emb, ModelState.Queued(waitingForWifi = true)),
    ))

    @Test fun libraryOnTheOwnersPhoneLight() = shot("models_s20_light", false) { ModelsContent(fresh, ModelsActions()) }
    @Test fun libraryBusyDark() = shot("models_busy_dark", true) { ModelsContent(busy, ModelsActions()) }
    @Test fun downloadSheetLight() = shot("model_sheet_light", false) { DownloadSheetContent(granite) {} }
}
