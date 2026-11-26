package app.zuri.android.engine.perception.drafts

/**
 * How the owner writes, measured from their own sent messages (no model, nothing leaves the
 * phone). It is recomputed each time it's needed, so every reply the owner sends refines it.
 */
data class VoiceProfile(
    val samples: Int,
    val medianWords: Int,
    val emojiShare: Double,
    val lowercaseStartShare: Double,
    val fullStopShare: Double,
    val openers: List<String>,
) {
    val known: Boolean get() = samples >= MIN_SAMPLES

    /** Plain style notes for the drafting prompt; empty when there's too little to go on. */
    fun notes(): List<String> {
        if (!known) return emptyList()
        return buildList {
            add(when {
                medianWords <= 4 -> "Very short replies, usually about $medianWords words."
                medianWords <= 12 -> "Short replies, usually about $medianWords words."
                else -> "Fuller replies, usually about $medianWords words."
            })
            add(when {
                emojiShare >= 0.4 -> "Uses emoji often."
                emojiShare >= 0.1 -> "Uses emoji sometimes."
                else -> "Rarely uses emoji."
            })
            if (lowercaseStartShare >= 0.6) add("Usually starts in lower case.")
            if (fullStopShare <= 0.2) add("Usually leaves off the final full stop.")
            if (openers.isNotEmpty()) add("Often opens with: " + openers.joinToString(", ") + ".")
        }
    }

    /** Makes a template reply look like the owner's own (Essential tier). */
    fun restyle(text: String): String {
        if (!known) return text
        var t = text
        if (emojiShare < 0.1) t = t.replace(EMOJI, "").trim()
        if (fullStopShare <= 0.2) t = t.removeSuffix(".")
        if (lowercaseStartShare >= 0.6 && t.isNotEmpty() && !t.startsWith("I ") && !t.startsWith("I'")) t = t[0].lowercase() + t.substring(1)
        return t
    }

    companion object {
        const val MIN_SAMPLES = 5
        val EMOJI = Regex("[\\x{1F300}-\\x{1FAFF}\\x{2600}-\\x{27BF}\\x{1F000}-\\x{1F2FF}]\\x{FE0F}?")
        private val WORD = Regex("[\\p{L}\\p{N}']+")

        fun from(texts: List<String>): VoiceProfile {
            val clean = texts.map { it.trim() }.filter { it.isNotEmpty() }
            if (clean.isEmpty()) return VoiceProfile(0, 0, 0.0, 0.0, 0.0, emptyList())
            val words = clean.map { WORD.findAll(it).count() }.sorted()
            val letters = clean.filter { it.first().isLetter() }
            val firstWords = clean.mapNotNull { WORD.find(it)?.value?.lowercase() }
            val openers = firstWords.groupingBy { it }.eachCount()
                .filter { (w, n) -> n >= 3 && n >= clean.size * 0.15 && w.length > 1 }
                .entries.sortedByDescending { it.value }.take(3).map { it.key }
            return VoiceProfile(
                samples = clean.size,
                medianWords = words[words.size / 2],
                emojiShare = clean.count { EMOJI.containsMatchIn(it) }.toDouble() / clean.size,
                lowercaseStartShare = if (letters.isEmpty()) 0.0 else letters.count { it.first().isLowerCase() }.toDouble() / letters.size,
                fullStopShare = clean.count { it.endsWith('.') && !it.endsWith("..") }.toDouble() / clean.size,
                openers = openers,
            )
        }
    }
}
