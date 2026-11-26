package app.zuri.android.engine.perception.insight

import app.zuri.android.domain.inbox.Mood

/**
 * Mood without a model. Word and emoji cues give each message six emotion scores; those are
 * projected to valence and arousal with the same formula as the server's Emotion Engine
 * (`neural/emotion.py`, `_derive_valence_arousal`), and the chat's mood comes from the other
 * person's latest messages, the newest weighing most.
 */
object EmotionDerivation {
    data class Emotions(val joy: Double, val sadness: Double, val anger: Double, val fear: Double, val surprise: Double, val love: Double) {
        val any get() = joy + sadness + anger + fear + surprise + love > 0.0
    }

    data class Affect(val valence: Double, val arousal: Double)

    private fun cue(vararg words: String) = Regex(
        "(?<![\\p{L}])(" + words.joinToString("|") { Regex.escape(it) } + ")(?![\\p{L}])",
        RegexOption.IGNORE_CASE,
    )

    private val JOY = cue("happy", "glad", "great", "awesome", "amazing", "nice", "cool", "lol", "haha", "hahaha", "yay", "congrats", "congratulations", "excited", "wonderful", "perfect", "thanks", "thank you", "cheers", "good news", "fantastic", "brilliant", "😂", "🤣", "😊", "😁", "😄", "🎉", "👍", "🔥", "😀", "🙌")
    private val LOVE = cue("love", "miss you", "dear", "sweetheart", "babe", "hugs", "proud of you", "blessed", "❤️", "❤", "😍", "🥰", "😘", "💕", "🙏")
    private val SADNESS = cue("sad", "unfortunately", "tired", "cry", "crying", "disappointed", "hurt", "lonely", "unwell", "sick", "heartbroken", "lost", "bad news", "😢", "😭", "💔", "😞", "😔")
    private val ANGER = cue("angry", "annoyed", "upset", "mad", "furious", "ridiculous", "nonsense", "stupid", "hate", "fed up", "unacceptable", "waste", "seriously", "disrespect", "😡", "🤬", "😤", "😠")
    private val FEAR = cue("worried", "scared", "afraid", "anxious", "nervous", "panic", "stressed", "stress", "concerned", "😨", "😰", "😱", "😟")
    private val SURPRISE = cue("wow", "omg", "no way", "surprised", "shocked", "really", "😮", "😲", "😯")
    private val NEGATION = Regex("\\b(not|no|never|isn'?t|wasn'?t|don'?t|didn'?t)\\s+$", RegexOption.IGNORE_CASE)

    private fun score(text: String, cues: Regex): Double {
        val hits = cues.findAll(text).count { m -> !NEGATION.containsMatchIn(text.substring((m.range.first - 12).coerceAtLeast(0), m.range.first)) }
        return (hits * 0.5).coerceAtMost(1.0)
    }

    fun emotions(text: String): Emotions = Emotions(
        joy = score(text, JOY), sadness = score(text, SADNESS), anger = score(text, ANGER),
        fear = score(text, FEAR), surprise = score(text, SURPRISE), love = score(text, LOVE),
    )

    /** The server's projection: valence in -1..1, arousal in 0..1. */
    fun affect(e: Emotions): Affect = Affect(
        valence = ((e.joy + e.love) - (e.sadness + e.anger + e.fear)).coerceIn(-1.0, 1.0),
        arousal = ((e.anger + e.fear + e.surprise + 0.5 * e.joy) / 2.5).coerceIn(0.0, 1.0),
    )

    /** [theirTexts] newest first. Null when there is nothing of theirs to read. */
    fun mood(theirTexts: List<String>): Mood? {
        val recent = theirTexts.filter { it.isNotBlank() }.take(5)
        if (recent.isEmpty()) return null
        var weightSum = 0.0; var v = 0.0; var a = 0.0
        recent.forEachIndexed { i, t ->
            val e = emotions(t)
            if (!e.any) return@forEachIndexed
            val w = 1.0 - i * 0.2
            val af = affect(e)
            v += af.valence * w; a += af.arousal * w; weightSum += w
        }
        if (weightSum == 0.0) return Mood.NEUTRAL
        val valence = v / weightSum
        val arousal = a / weightSum
        return when {
            valence >= 0.25 -> Mood.WARM
            valence <= -0.25 && arousal >= 0.3 -> Mood.TENSE
            valence <= -0.25 -> Mood.LOW
            else -> Mood.NEUTRAL
        }
    }
}
