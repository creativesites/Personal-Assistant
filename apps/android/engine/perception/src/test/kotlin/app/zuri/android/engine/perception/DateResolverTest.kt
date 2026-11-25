package app.zuri.android.engine.perception

import app.zuri.android.engine.perception.dates.DateResolver
import com.google.common.truth.Truth.assertThat
import java.time.LocalDateTime
import java.time.ZoneId
import org.junit.Test

class DateResolverTest {
    private val zone = ZoneId.of("Africa/Lusaka")
    // Tuesday 24 November 2026, 14:05 in Lusaka.
    private val anchor = LocalDateTime.of(2026, 11, 24, 14, 5).atZone(zone).toInstant().toEpochMilli()

    private fun at(text: String): LocalDateTime? = DateResolver.resolve(text, anchor, zone)?.let {
        java.time.Instant.ofEpochMilli(it.epochMillis).atZone(zone).toLocalDateTime()
    }
    private fun hasTime(text: String) = DateResolver.resolve(text, anchor, zone)!!.hasTime

    @Test fun relativeDays() {
        assertThat(at("tomorrow")).isEqualTo(LocalDateTime.of(2026, 11, 25, 0, 0))
        assertThat(at("I'll send it tmrw")).isEqualTo(LocalDateTime.of(2026, 11, 25, 0, 0))
        assertThat(at("day after tomorrow")).isEqualTo(LocalDateTime.of(2026, 11, 26, 0, 0))
        assertThat(at("in 3 days")).isEqualTo(LocalDateTime.of(2026, 11, 27, 0, 0))
        assertThat(at("in a couple of weeks")).isEqualTo(LocalDateTime.of(2026, 12, 8, 0, 0))
        assertThat(at("tonight")).isEqualTo(LocalDateTime.of(2026, 11, 24, 19, 0))
    }

    @Test fun weekdaysAndNextWeek() {
        assertThat(at("by Friday 10am")).isEqualTo(LocalDateTime.of(2026, 11, 27, 10, 0))
        assertThat(at("on Tuesday")).isEqualTo(LocalDateTime.of(2026, 11, 24, 0, 0)) // today is Tuesday 24th
        assertThat(at("next Friday")).isEqualTo(LocalDateTime.of(2026, 12, 4, 0, 0))
        assertThat(at("next week")).isEqualTo(LocalDateTime.of(2026, 11, 30, 0, 0))
        assertThat(at("this weekend")).isEqualTo(LocalDateTime.of(2026, 11, 28, 0, 0))
        assertThat(at("end of the month")).isEqualTo(LocalDateTime.of(2026, 11, 30, 0, 0))
    }

    @Test fun explicitDates() {
        assertThat(at("on 12 Dec")).isEqualTo(LocalDateTime.of(2026, 12, 12, 0, 0))
        assertThat(at("December 3rd at 3pm")).isEqualTo(LocalDateTime.of(2026, 12, 3, 15, 0))
        assertThat(at("5/1")).isEqualTo(LocalDateTime.of(2027, 1, 5, 0, 0)) // D/M, and January is next year
        assertThat(at("the 30th")).isEqualTo(LocalDateTime.of(2026, 11, 30, 0, 0))
        assertThat(at("on 3 March")).isEqualTo(LocalDateTime.of(2027, 3, 3, 0, 0))
    }

    @Test fun timesAlone() {
        assertThat(at("at 5")).isEqualTo(LocalDateTime.of(2026, 11, 24, 17, 0))
        assertThat(at("10am")).isEqualTo(LocalDateTime.of(2026, 11, 25, 10, 0)) // 10am already passed today
        assertThat(at("at noon tomorrow")).isEqualTo(LocalDateTime.of(2026, 11, 25, 12, 0))
        assertThat(hasTime("tomorrow")).isFalse()
        assertThat(hasTime("tomorrow 18:30")).isTrue()
    }

    @Test fun ordinaryWordsAreNotDates() {
        assertThat(at("I sat there for an hour")).isNull()
        assertThat(at("the sun is out")).isNull()
        assertThat(at("May I ask something")).isNull()
        assertThat(at("Thanks, that's great")).isNull()
        assertThat(at("I have 3 kids")).isNull()
    }
}
