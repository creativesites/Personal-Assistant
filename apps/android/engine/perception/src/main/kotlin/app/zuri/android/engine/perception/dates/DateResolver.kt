package app.zuri.android.engine.perception.dates

import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.temporal.TemporalAdjusters

/** A time found in text: [hasTime] is false when only the day was said. */
data class ResolvedDate(val epochMillis: Long, val hasTime: Boolean)

/**
 * Turns the time words people write in chats ("tomorrow", "Friday 10am", "12 Dec", "next week",
 * "in 3 days") into a date, relative to when the message was sent. Deterministic and offline;
 * anything it can't read returns null rather than a guess. Day/month order is D/M (Zambia).
 */
object DateResolver {
    private val WEEKDAYS = mapOf(
        "mon" to DayOfWeek.MONDAY, "monday" to DayOfWeek.MONDAY,
        "tue" to DayOfWeek.TUESDAY, "tues" to DayOfWeek.TUESDAY, "tuesday" to DayOfWeek.TUESDAY,
        "wed" to DayOfWeek.WEDNESDAY, "wednesday" to DayOfWeek.WEDNESDAY,
        "thu" to DayOfWeek.THURSDAY, "thur" to DayOfWeek.THURSDAY, "thurs" to DayOfWeek.THURSDAY, "thursday" to DayOfWeek.THURSDAY,
        "fri" to DayOfWeek.FRIDAY, "friday" to DayOfWeek.FRIDAY,
        "sat" to DayOfWeek.SATURDAY, "saturday" to DayOfWeek.SATURDAY,
        "sun" to DayOfWeek.SUNDAY, "sunday" to DayOfWeek.SUNDAY,
    )
    private val AMBIGUOUS_SHORT = setOf("sat", "sun", "wed")
    private val MONTHS = listOf("jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec")
    private val NUMBER_WORDS = mapOf("a" to 1, "an" to 1, "one" to 1, "two" to 2, "three" to 3, "four" to 4, "five" to 5, "six" to 6, "seven" to 7, "ten" to 10, "couple of" to 2, "few" to 3)

    private const val MONTH = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
    private val WEEKDAY_RE = Regex("\\b(next|this|on|coming)?\\s*(" + WEEKDAYS.keys.sortedByDescending { it.length }.joinToString("|") + ")\\b")
    private val DAY_MONTH = Regex("\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?$MONTH\\b")
    private val MONTH_DAY = Regex("\\b$MONTH\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b")
    private val NUMERIC = Regex("\\b(\\d{1,2})/(\\d{1,2})(?:/(\\d{2,4}))?\\b")
    private val THE_NTH = Regex("\\bthe\\s+(\\d{1,2})(?:st|nd|rd|th)\\b")
    private val IN_N = Regex("\\bin\\s+(\\d+|a|an|one|two|three|four|five|six|seven|ten|a couple of|a few)\\s+(day|days|week|weeks)\\b")
    private val CLOCK = Regex("\\b(\\d{1,2})(?:[:.](\\d{2}))?\\s*(am|pm|a\\.m\\.|p\\.m\\.|hrs|h)\\b")
    private val CLOCK_COLON = Regex("\\b(\\d{1,2}):(\\d{2})\\b")
    private val AT_HOUR = Regex("\\bat\\s+(\\d{1,2})\\b(?![:./\\d])")

    fun resolve(text: String, anchorMillis: Long, zone: ZoneId): ResolvedDate? {
        val t = " " + text.lowercase().replace('’', '\'') + " "
        val anchor = Instant.ofEpochMilli(anchorMillis).atZone(zone)
        val today = anchor.toLocalDate()

        val day: LocalDate? = dayFrom(t, today)
        val time: LocalTime? = timeFrom(t)

        if (day == null && time == null) return null
        val date = day ?: run {
            // A bare time: today if it's still ahead of when the message was sent, otherwise tomorrow.
            if (time!!.isAfter(anchor.toLocalTime())) today else today.plusDays(1)
        }
        val at = ZonedDateTime.of(date, time ?: LocalTime.MIDNIGHT, zone)
        return ResolvedDate(at.toInstant().toEpochMilli(), hasTime = time != null)
    }

    private fun dayFrom(t: String, today: LocalDate): LocalDate? {
        if ("day after tomorrow" in t) return today.plusDays(2)
        if (Regex("\\b(tomorrow|tmrw|tmr|tomoro|tomorow)\\b").containsMatchIn(t)) return today.plusDays(1)
        if (Regex("\\b(today|tonight|this morning|this afternoon|this evening|later today)\\b").containsMatchIn(t)) return today

        IN_N.find(t)?.let { m ->
            val n = m.groupValues[1].let { it.toIntOrNull() ?: NUMBER_WORDS[it.removePrefix("a ").trim()] ?: NUMBER_WORDS[it] ?: 1 }
            return if (m.groupValues[2].startsWith("week")) today.plusWeeks(n.toLong()) else today.plusDays(n.toLong())
        }

        DAY_MONTH.find(t)?.let { m -> return dated(m.groupValues[1].toInt(), monthOf(m.groupValues[2]), null, today) }
        MONTH_DAY.find(t)?.let { m -> return dated(m.groupValues[2].toInt(), monthOf(m.groupValues[1]), null, today) }
        NUMERIC.find(t)?.let { m ->
            val year = m.groupValues[3].takeIf { it.isNotEmpty() }?.toInt()?.let { if (it < 100) 2000 + it else it }
            return dated(m.groupValues[1].toInt(), m.groupValues[2].toInt(), year, today)
        }

        WEEKDAY_RE.findAll(t).firstOrNull { m ->
            // "sat", "sun" and "wed" are ordinary words too: only count them after "on", "next" or "this".
            m.groupValues[2] !in AMBIGUOUS_SHORT || m.groupValues[1].isNotEmpty()
        }?.let { m ->
            val target = WEEKDAYS.getValue(m.groupValues[2])
            return if (m.groupValues[1] == "next") {
                // "next Friday": the Friday of next week.
                today.with(TemporalAdjusters.next(DayOfWeek.MONDAY)).with(TemporalAdjusters.nextOrSame(target))
            } else {
                today.with(TemporalAdjusters.nextOrSame(target))
            }
        }

        if (Regex("\\b(this weekend|the weekend|weekend)\\b").containsMatchIn(t)) return today.with(TemporalAdjusters.nextOrSame(DayOfWeek.SATURDAY))
        if (Regex("\\bnext week\\b").containsMatchIn(t)) return today.with(TemporalAdjusters.next(DayOfWeek.MONDAY))
        if (Regex("\\bend of (the )?week\\b").containsMatchIn(t)) return today.with(TemporalAdjusters.nextOrSame(DayOfWeek.FRIDAY))
        if (Regex("\\bend of (the )?month\\b").containsMatchIn(t)) return today.with(TemporalAdjusters.lastDayOfMonth())
        if (Regex("\\bnext month\\b").containsMatchIn(t)) return today.plusMonths(1).withDayOfMonth(1)

        THE_NTH.find(t)?.let { m ->
            val d = m.groupValues[1].toInt()
            if (d in 1..31) {
                val thisMonth = runCatching { today.withDayOfMonth(d) }.getOrNull()
                return if (thisMonth != null && !thisMonth.isBefore(today)) thisMonth
                else runCatching { today.plusMonths(1).withDayOfMonth(d) }.getOrNull()
            }
        }
        return null
    }

    /** A day and month without a year means the next time that date comes round. */
    private fun dated(day: Int, month: Int, year: Int?, today: LocalDate): LocalDate? {
        if (month !in 1..12 || day !in 1..31) return null
        val y = year ?: today.year
        val d = runCatching { LocalDate.of(y, month, day) }.getOrNull() ?: return null
        return if (year == null && d.isBefore(today.minusDays(1))) runCatching { LocalDate.of(y + 1, month, day) }.getOrNull() else d
    }

    private fun monthOf(word: String): Int = MONTHS.indexOf(word.take(3)) + 1

    private fun timeFrom(t: String): LocalTime? {
        if (Regex("\\b(noon|midday|lunchtime)\\b").containsMatchIn(t)) return LocalTime.NOON
        CLOCK.find(t)?.let { m ->
            var h = m.groupValues[1].toInt()
            val min = m.groupValues[2].toIntOrNull() ?: 0
            val suffix = m.groupValues[3]
            if (suffix.startsWith("p") && h < 12) h += 12
            if (suffix.startsWith("a") && h == 12) h = 0
            if (h in 0..23 && min in 0..59) return LocalTime.of(h, min)
        }
        CLOCK_COLON.find(t)?.let { m ->
            val h = m.groupValues[1].toInt(); val min = m.groupValues[2].toInt()
            if (h in 0..23 && min in 0..59) return LocalTime.of(if (h in 1..6) h + 12 else h, min)
        }
        AT_HOUR.find(t)?.let { m ->
            val h = m.groupValues[1].toInt()
            // "at 5" in a chat almost always means the afternoon or evening.
            if (h in 1..12) return LocalTime.of(if (h in 1..7) h + 12 else h, 0)
        }
        if (Regex("\\b(tonight|this evening|in the evening)\\b").containsMatchIn(t)) return LocalTime.of(19, 0)
        if (Regex("\\b(this morning|in the morning)\\b").containsMatchIn(t)) return LocalTime.of(9, 0)
        if (Regex("\\b(this afternoon|in the afternoon)\\b").containsMatchIn(t)) return LocalTime.of(14, 0)
        return null
    }
}
