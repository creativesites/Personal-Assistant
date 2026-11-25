package app.zuri.android.domain

import app.zuri.android.domain.ai.DeviceProfile
import app.zuri.android.domain.ai.FitVerdict
import app.zuri.android.domain.ai.ModelFit
import app.zuri.android.domain.ai.ModelRole
import app.zuri.android.domain.ai.ModelSpec
import app.zuri.android.domain.ai.ModelTier
import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ModelFitTest {
    private val gb = 1_000_000_000L
    private fun spec(size: Long, minRam: Long) = ModelSpec("m", "M", ModelRole.CHAT, ModelTier.STANDARD, "f", "u", "s", size, minRam, "Apache-2.0", "p", null, "2B")
    // A Galaxy S20 as measured on 2026-11-25: 7.6 GB RAM, 2.6 GB free.
    private val s20 = DeviceProfile(7_806_000_000, (2.6 * gb).toLong(), listOf("arm64-v8a"), null, 33)

    @Test fun gemmaE2BNeedsSpaceFreedOnTheOwnersPhone() {
        val e2b = spec(2_588_147_712, 6 * gb)
        assertThat(ModelFit.verdict(e2b, s20)).isEqualTo(FitVerdict.NOT_ENOUGH_STORAGE)
        assertThat(ModelFit.storageShortfall(e2b, s20)).isGreaterThan(900_000_000L)
        assertThat(ModelFit.verdict(e2b, s20.copy(freeStorageBytes = 10 * gb))).isEqualTo(FitVerdict.GOOD)
        assertThat(ModelFit.verdict(e2b, s20, installed = true)).isEqualTo(FitVerdict.GOOD)
    }

    @Test fun modelsOverHalfOfRamAreRefused() {
        assertThat(ModelFit.verdict(spec(3_659_530_240, 11 * gb), s20.copy(freeStorageBytes = 20 * gb, totalRamBytes = 6 * gb))).isEqualTo(FitVerdict.TOO_LARGE_FOR_MEMORY)
    }

    @Test fun belowRecommendedRamIsTight() {
        assertThat(ModelFit.verdict(spec(3_659_530_240, 11 * gb), s20.copy(freeStorageBytes = 20 * gb))).isEqualTo(FitVerdict.TIGHT)
    }

    @Test fun non64BitArmIsUnsupported() {
        assertThat(ModelFit.verdict(spec(1, 0), s20.copy(abis = listOf("x86_64")))).isEqualTo(FitVerdict.UNSUPPORTED_DEVICE)
    }
}
