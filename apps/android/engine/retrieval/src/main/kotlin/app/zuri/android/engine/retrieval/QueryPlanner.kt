package app.zuri.android.engine.retrieval

import app.zuri.android.data.local.db.ConversationTitle
import app.zuri.android.domain.memory.MemoryKind

enum class Intent { MY_PROMISES, OWED_TO_ME, ASKED_OF_ME, EVENTS, GENERAL }

data class QueryPlan(
    val intent: Intent,
    val kinds: Set<MemoryKind>,
    /** Conversation ids for people named in the question; empty means everywhere. */
    val scope: List<String>,
    /** Words to search message text for (names and filler removed), safe for FTS MATCH. */
    val keywords: List<String>,
)

/** Reads a question into a retrieval plan. Plain rules: predictable and testable. */
object QueryPlanner {
    private val STOP = setOf(
        "what", "when", "where", "who", "why", "how", "did", "does", "do", "is", "are", "was", "were", "the", "a", "an", "to", "of",
        "for", "and", "or", "in", "on", "at", "about", "with", "my", "me", "i", "you", "your", "he", "she", "they", "them", "it", "that",
        "this", "there", "have", "has", "had", "can", "could", "would", "will", "should", "tell", "say", "said", "any", "anything", "from",
        "promise", "promised", "promises", "owe", "owes", "ask", "asked", "asks", "send", "need", "remind", "zuri", "please", "last", "time",
        "near", "doing", "going", "get", "got", "his", "her", "their", "we", "us", "our", "be", "been", "not", "no", "yes", "all", "much", "many",
    )
    private val NAME_STOP = setOf("the", "and", "group", "family", "chat", "team", "mr", "mrs", "ms", "dr")

    fun plan(question: String, titles: List<ConversationTitle>): QueryPlan {
        val q = question.lowercase().replace('’', '\'')
        val intent = when {
            Regex("\\b(promised me|owes? me|they (said|promised)|said (he|she|they)('d| would)|supposed to (send|pay|give) me)\\b").containsMatchIn(q) -> Intent.OWED_TO_ME
            Regex("\\b(promise|promised|owe|commit|said i('d| would)|supposed to|agreed to|i told)\\b").containsMatchIn(q) -> Intent.MY_PROMISES
            Regex("\\b(asked me|ask me|wants? me|wanted me|requested)\\b").containsMatchIn(q) -> Intent.ASKED_OF_ME
            Regex("\\b(when|meeting|meet|appointment|call|schedule|plans?|event|wedding|visit)\\b").containsMatchIn(q) -> Intent.EVENTS
            else -> Intent.GENERAL
        }
        val kinds = when (intent) {
            Intent.MY_PROMISES -> setOf(MemoryKind.MY_PROMISE, MemoryKind.REQUEST_TO_ME)
            Intent.OWED_TO_ME -> setOf(MemoryKind.THEIR_PROMISE)
            Intent.ASKED_OF_ME -> setOf(MemoryKind.REQUEST_TO_ME)
            Intent.EVENTS -> setOf(MemoryKind.EVENT)
            Intent.GENERAL -> MemoryKind.entries.toSet()
        }
        val words = Regex("[\\p{L}\\p{N}]+").findAll(q).map { it.value }.toList()
        val wordSet = words.toSet()
        val nameTokens = mutableSetOf<String>()
        val scope = titles.filter { t ->
            val tokens = Regex("[\\p{L}\\p{N}]+").findAll(t.title.lowercase()).map { it.value }.filter { it.length >= 3 && it !in NAME_STOP }.toList()
            val hit = tokens.any { it in wordSet || (it.length >= 4 && wordSet.any { w -> w.length >= 4 && (w == it + "s" || w == it + "'s") }) }
            if (hit) nameTokens += tokens
            hit
        }.map { it.id }
        val keywords = words.filter { it.length >= 3 && it !in STOP && it !in nameTokens }
            .map { it.removeSuffix("'s") }
            .distinct().take(6)
        return QueryPlan(intent, kinds, scope, keywords)
    }
}
