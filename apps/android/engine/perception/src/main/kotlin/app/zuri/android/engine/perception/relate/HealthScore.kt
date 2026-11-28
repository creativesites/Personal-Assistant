package app.zuri.android.engine.perception.relate

import kotlin.math.abs
import kotlin.math.roundToInt
import kotlin.math.sqrt

/**
 * A line-for-line port of services/intelligence/app/services/health.py's scoring (M6). Inputs are
 * the same signals the server reads; deal and document signals are 0 on the phone (none stored).
 * Golden cases from the server's formula live in HealthScoreTest.
 */
object HealthScore {
    const val SCALE = 30.0
    const val BASE_SCORE = 70
    const val PROACTIVE_BONUS = 2

    data class Inputs(
        /** Days since the last message, if one was sent in the last 30 days; else 999 (server query). */
        val daysSilent: Int,
        /** relationships.dormancy_alert_days (default 30). */
        val dormancyDays: Int = 30,
        /** Average message sentiment, 30 days, on 0..1 (positive 1, neutral/mixed 0.5, negative 0); default 0.5. */
        val avgSentiment: Double = 0.5,
        /** Messages in the last 7 days. */
        val weekCount: Int,
        /** Learned average days between messages (cadence), or null. */
        val avgDaysBetween: Double?,
        /** Their reply latency in hours: last 14 days, and the 14–74 day baseline. */
        val recentReplyHours: Double?,
        val baselineReplyHours: Double?,
        val personal: Boolean,
        val recentProactive: Boolean,
        val oldScore: Int = 70,
    )

    data class Result(
        val score: Int,
        val trend: String,
        val signals: Map<String, Double>,
        val weighted: Map<String, Double>,
        val notes: Map<String, String>,
        val reason: String,
    )

    private val LABELS = linkedMapOf(
        "recency" to "time since last message", "frequency" to "message frequency", "sentiment" to "conversation tone",
        "responsiveness" to "reply speed", "pipeline_velocity" to "deal progress", "documents" to "document activity",
    )

    private fun clamp(v: Double) = v.coerceIn(-1.0, 1.0)

    fun compute(i: Inputs): Result {
        val s = linkedMapOf<String, Double>()
        val n = linkedMapOf<String, String>()
        val d = i.daysSilent
        when {
            // Same signal as the server; friendlier words for today and yesterday.
            d <= 3 -> { s["recency"] = 1.0; n["recency"] = when (d) { 0 -> "Messaged today"; 1 -> "Messaged yesterday"; else -> "Messaged $d days ago" } }
            d <= 7 -> { s["recency"] = 0.5; n["recency"] = "Last messaged $d days ago" }
            d <= i.dormancyDays -> { s["recency"] = 0.0; n["recency"] = "$d days since last message" }
            d <= i.dormancyDays * 2 -> { s["recency"] = -0.5; n["recency"] = "$d days of silence — past the usual gap" }
            else -> { s["recency"] = -1.0; n["recency"] = "$d days of silence — well past the usual gap" }
        }
        s["sentiment"] = clamp((i.avgSentiment - 0.5) * 2)
        n["sentiment"] = when {
            s["sentiment"]!! > 0.2 -> "Mostly positive tone recently"
            s["sentiment"]!! < -0.2 -> "Negative tone detected recently"
            else -> "Neutral tone recently"
        }
        val avg = i.avgDaysBetween
        if (avg != null && avg > 0) {
            val expected = 7 / avg
            s["frequency"] = clamp((i.weekCount - expected) / maxOf(expected, 1.0))
            val diff = i.weekCount - expected
            n["frequency"] = when {
                diff >= 1 -> "More messages this week than usual (${i.weekCount} vs ~${"%.0f".format(expected)})"
                diff <= -1 -> "Fewer messages this week than usual (${i.weekCount} vs ~${"%.0f".format(expected)})"
                else -> "Messaging at the usual rate"
            }
        } else { s["frequency"] = 0.0; n["frequency"] = "Not enough history yet to know the usual rate" }
        val r = i.recentReplyHours; val b = i.baselineReplyHours
        if (r != null && b != null && b > 0) {
            s["responsiveness"] = clamp((b - r) / b)
            n["responsiveness"] = when {
                s["responsiveness"]!! < -0.2 -> "Replies taking longer than usual"
                s["responsiveness"]!! > 0.2 -> "Replying faster than usual"
                else -> "Replying at the usual speed"
            }
        } else { s["responsiveness"] = 0.0; n["responsiveness"] = "Not enough reply history yet" }
        s["pipeline_velocity"] = 0.0; n["pipeline_velocity"] = "No open deal"
        s["documents"] = 0.0; n["documents"] = "No notable document activity"

        val weights = if (i.personal) mapOf("recency" to 0.35, "frequency" to 0.25, "sentiment" to 0.25, "responsiveness" to 0.15, "pipeline_velocity" to 0.0, "documents" to 0.0)
        else mapOf("recency" to 0.25, "frequency" to 0.15, "sentiment" to 0.15, "responsiveness" to 0.15, "pipeline_velocity" to 0.20, "documents" to 0.10)
        val weighted = LABELS.keys.associateWith { k -> weights.getValue(k) * s.getValue(k) * SCALE }
        val delta = weighted.values.sum() + if (i.recentProactive) PROACTIVE_BONUS else 0
        // Python's round() is banker's rounding; match it so scores agree exactly.
        val score = pyRound(BASE_SCORE + delta).coerceIn(0, 100)
        val trend = when { score > i.oldScore + 3 -> "improving"; score < i.oldScore - 3 -> "declining"; else -> "stable" }
        val top = weighted.entries.sortedByDescending { abs(it.value) }.filter { abs(it.value) >= 1 }
        val reason = if (top.isNotEmpty()) top.take(2).joinToString("; ") { n.getValue(it.key) }
        else "Stable — no significant change in " + LABELS.values.joinToString(", ")
        return Result(score, trend, s, weighted, n, reason)
    }

    internal fun pyRound(x: Double): Int {
        val f = kotlin.math.floor(x)
        val diff = x - f
        return when {
            diff > 0.5 -> f.toInt() + 1
            diff < 0.5 -> f.toInt()
            else -> if (f.toInt() % 2 == 0) f.toInt() else f.toInt() + 1
        }
    }
}

/** A port of cadence_learner.py: the usual gap between messages and when to check in next. */
object Cadence {
    private val TIER_INTERVALS = mapOf(1 to 3, 2 to 7, 3 to 14, 4 to 30, 5 to 60)
    const val DAY = 86_400_000L

    data class Clock(val avgDays: Double, val stdDays: Double, val nextCheckAt: Long, val learned: Boolean)

    fun tierInterval(tier: Int) = TIER_INTERVALS[tier] ?: 14

    /** [times] ascending ms. With fewer than 3 messages the tier's interval stands in, as on the server. */
    fun learn(times: List<Long>, tier: Int, lastInteractionAt: Long?, now: Long): Clock? {
        val interval = tierInterval(tier)
        if (times.size < 3) {
            return Clock(interval.toDouble(), 0.0, nextCheck(interval.toDouble(), 0.0, interval, lastInteractionAt, now), learned = false)
        }
        val gaps = times.zipWithNext { a, b -> (b - a) / DAY.toDouble() }.filter { it > 0 }
        if (gaps.isEmpty()) return null
        val avg = gaps.average()
        val std = sqrt(gaps.sumOf { (it - avg) * (it - avg) } / gaps.size)
        return Clock(avg, std, nextCheck(avg, std, interval, lastInteractionAt, now), learned = true)
    }

    /** Server rule: last interaction + max(avg − std, interval × 0.5) days; or now + interval with no data. */
    private fun nextCheck(avg: Double, std: Double, interval: Int, last: Long?, now: Long): Long =
        if (last != null && avg > 0) last + (maxOf(avg - std, interval * 0.5) * DAY).toLong()
        else now + interval * DAY
}
