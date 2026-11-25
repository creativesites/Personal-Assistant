package app.zuri.android.engine.perception.extract

import app.zuri.android.domain.memory.MemoryKind
import app.zuri.android.domain.memory.MemoryOrigin
import app.zuri.android.engine.perception.dates.DateResolver
import java.time.ZoneId

/**
 * The gate between extraction and storage (M4 acceptance: no memory without a valid source).
 * An item survives only if its message exists in the batch, its quote really appears in that
 * message, and its kind fits who said it. Confidence comes from how strongly it is grounded,
 * not from the model's own opinion of itself.
 */
object Grounding {
    fun ground(batch: ChatBatch, candidates: List<Candidate>, zone: ZoneId, rulesAgree: (Int, MemoryKind) -> Boolean = { _, _ -> false }): List<Grounded> {
        val seen = mutableSetOf<Pair<Int, MemoryKind>>()
        return candidates.mapNotNull { c ->
            val line = batch.lines.getOrNull(c.line) ?: return@mapNotNull null
            val quote = c.quote.trim().trim('"', '“', '”', '\'')
            if (normalise(quote).length < 3 || normalise(quote) !in normalise(line.text)) return@mapNotNull null
            if (!fitsSpeaker(c.kind, line.fromMe)) return@mapNotNull null
            if (!fitsDefinition(c.kind, normalise(quote), normalise(line.text))) return@mapNotNull null
            val text = c.summary.trim().ifBlank { quote }.take(200)
            if (text.length < 3) return@mapNotNull null
            if (!seen.add(c.line to c.kind)) return@mapNotNull null

            val due = (c.whenText?.let { DateResolver.resolve(it, line.sentAtMillis, zone) }
                ?: DateResolver.resolve(quote, line.sentAtMillis, zone))
                .takeIf { c.kind != MemoryKind.FACT }
            // An event is "a meeting or occasion with a day or time": without a date it isn't one.
            if (c.kind == MemoryKind.EVENT && due == null) return@mapNotNull null
            var confidence = if (c.origin == MemoryOrigin.MODEL) 0.55f else 0.5f
            if (c.origin == MemoryOrigin.MODEL && normalise(quote).length >= 12) confidence += 0.2f
            if (c.origin == MemoryOrigin.MODEL && rulesAgree(c.line, c.kind)) confidence += 0.1f
            if (due != null) confidence += 0.1f
            Grounded(
                kind = c.kind, source = line, quote = quote, text = text,
                personName = if (line.fromMe) batch.conversationTitle else line.speaker,
                dueAtMillis = due?.epochMillis, dueText = c.whenText?.takeIf { due == null }, dueHasTime = due?.hasTime ?: false,
                confidence = confidence.coerceAtMost(0.95f), origin = c.origin,
            )
        }
    }

    /** Words that commit someone to something; a "promise" without any of them is chat, not a promise. */
    private val COMMITMENT = Regex("\\b(will|i'll|ill|you'll|he'll|she'll|we'll|they'll|going to|gonna|shall|promise|let me|i can|on it|sure|yes|ok|okay|sending|coming|bringing)\\b")
    /** "Shall I…?" / "Should I…?" is the speaker offering, not asking the owner to do something. */
    private val OFFER = Regex("^(shall|should|can|may) (i|we)\\b")

    private fun fitsDefinition(kind: MemoryKind, quote: String, message: String): Boolean = when (kind) {
        MemoryKind.MY_PROMISE, MemoryKind.THEIR_PROMISE -> COMMITMENT.containsMatchIn(message)
        MemoryKind.REQUEST_TO_ME -> !OFFER.containsMatchIn(message)
        MemoryKind.FACT -> quote.length >= 12
        MemoryKind.EVENT -> true
    }

    private fun fitsSpeaker(kind: MemoryKind, fromMe: Boolean): Boolean = when (kind) {
        MemoryKind.MY_PROMISE -> fromMe
        MemoryKind.THEIR_PROMISE, MemoryKind.REQUEST_TO_ME -> !fromMe
        MemoryKind.EVENT, MemoryKind.FACT -> true
    }

    /** Case, curly quotes, punctuation and spacing don't count when matching a quote. */
    fun normalise(s: String): String = s.lowercase()
        .replace('’', '\'').replace('‘', '\'').replace('“', '"').replace('”', '"')
        .replace(Regex("[^\\p{L}\\p{N}' ]+"), " ")
        .replace(Regex("\\s+"), " ").trim()
}
