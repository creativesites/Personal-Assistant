package app.zuri.android.core.common

import com.google.common.truth.Truth.assertThat
import java.util.Random
import org.junit.Test

class UuidV7Test {
    private val format = Regex("^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")

    @Test fun hasVersionAndVariantBits() {
        repeat(200) { assertThat(UuidV7.generate()).matches(format.pattern) }
    }

    @Test fun encodesTimestampAndSortsByTime() {
        val r = Random(1)
        val a = UuidV7.generate(1_700_000_000_000L, r)
        val b = UuidV7.generate(1_700_000_000_001L, r)
        assertThat(UuidV7.timestampOf(a)).isEqualTo(1_700_000_000_000L)
        assertThat(a < b).isTrue()
    }

    @Test fun isUnique() {
        val ids = (1..5_000).map { UuidV7.generate(Clock { 42L }) }.toSet()
        assertThat(ids).hasSize(5_000)
    }
}
