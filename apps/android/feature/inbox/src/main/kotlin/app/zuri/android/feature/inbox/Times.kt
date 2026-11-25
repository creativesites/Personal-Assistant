package app.zuri.android.feature.inbox

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale

/** Clock and zone passed in explicitly, so screenshots are identical on every machine. */
data class TimeContext(val nowMillis: Long, val zone: ZoneId, val locale: Locale = Locale.getDefault()) {
    private fun date(ms: Long): LocalDate = Instant.ofEpochMilli(ms).atZone(zone).toLocalDate()
    private val today get() = date(nowMillis)

    fun time(ms: Long): String = DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT).withLocale(locale).format(Instant.ofEpochMilli(ms).atZone(zone))

    /** List timestamps: time today, weekday this week, otherwise a short date. */
    fun short(ms: Long): String {
        val d = date(ms)
        return when {
            d == today -> time(ms)
            d.isAfter(today.minusDays(7)) -> DateTimeFormatter.ofPattern("EEE", locale).format(d)
            else -> DateTimeFormatter.ofLocalizedDate(FormatStyle.SHORT).withLocale(locale).format(d)
        }
    }

    fun day(ms: Long, todayLabel: String, yesterdayLabel: String): String {
        val d = date(ms)
        return when (d) {
            today -> todayLabel
            today.minusDays(1) -> yesterdayLabel
            else -> DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withLocale(locale).format(d)
        }
    }

    fun full(ms: Long): String = DateTimeFormatter.ofLocalizedDateTime(FormatStyle.MEDIUM, FormatStyle.SHORT).withLocale(locale).format(Instant.ofEpochMilli(ms).atZone(zone))

    fun sameDay(a: Long, b: Long) = date(a) == date(b)

    companion object {
        fun system() = TimeContext(System.currentTimeMillis(), ZoneId.systemDefault())
    }
}
