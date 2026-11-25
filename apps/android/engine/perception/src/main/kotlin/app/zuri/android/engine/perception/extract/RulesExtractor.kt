package app.zuri.android.engine.perception.extract

import app.zuri.android.domain.memory.MemoryKind
import app.zuri.android.domain.memory.MemoryOrigin

/**
 * The Essential tier (works on every phone, no model): promises, requests and events found by
 * phrasing alone. Deliberately narrow; it prefers missing an item to inventing one.
 */
object RulesExtractor {
    private val PROMISE = Regex(
        "\\b(i'?ll|i will|i'?m going to|i am going to|im going to|i shall|let me|i promise|i'?ll make sure|will do|i can do that|i'?ll get back)\\b",
    )
    private val REQUEST = Regex(
        "\\b(can you|could you|would you|will you|can u|could u|please|pls|plz|kindly|don'?t forget|remember to|make sure you)\\b",
    )
    /** An instruction addressed to the owner: "Call me tonight", "Send the invoice". */
    private val IMPERATIVE = Regex("^(call|send|bring|buy|pick|text|remind|tell|check|pay|book|come|bring)\\b")
    private val SMALL_TALK = Regex("^(yes|ok|okay|thanks|thank you|thx|sure|alright|no|hi|hello|good (morning|night|afternoon|evening))\\b[ ,.!]*(please|pls)?[ .!]*$")
    private val EVENT = Regex(
        "\\b(meet|meeting|call|lunch|dinner|breakfast|coffee|appointment|wedding|party|funeral|church|service|visit|flight|interview|class|session|match|game|birthday|conference|workshop|pick (you|me) up|see you)\\b",
    )
    private val SENTENCE = Regex("(?<=[.!?\\n])\\s+")

    fun extract(batch: ChatBatch, hasDate: (String, Long) -> Boolean): List<Candidate> {
        val out = mutableListOf<Candidate>()
        batch.lines.forEachIndexed { index, line ->
            for (raw in line.text.split(SENTENCE)) {
                val sentence = raw.trim()
                if (sentence.length < 8) continue
                val s = sentence.lowercase().replace('’', '\'')
                if (SMALL_TALK.matches(s)) continue
                val dated = hasDate(sentence, line.sentAtMillis)
                val request = !line.fromMe && (REQUEST.containsMatchIn(s) || IMPERATIVE.containsMatchIn(s))
                val kind = when {
                    dated && EVENT.containsMatchIn(s) && !request -> MemoryKind.EVENT
                    PROMISE.containsMatchIn(s) && !s.trimEnd().endsWith("?") ->
                        if (line.fromMe) MemoryKind.MY_PROMISE else MemoryKind.THEIR_PROMISE
                    request -> MemoryKind.REQUEST_TO_ME
                    else -> null
                } ?: continue
                if (out.none { it.line == index && it.kind == kind }) {
                    out += Candidate(kind, index, sentence, sentence.take(160), null, MemoryOrigin.RULES)
                }
            }
        }
        return out
    }
}
