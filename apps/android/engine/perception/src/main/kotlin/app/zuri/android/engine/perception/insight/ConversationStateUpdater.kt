package app.zuri.android.engine.perception.insight

/** One message as the chat-state rules read it. */
data class StateMessage(val fromMe: Boolean, val text: String?, val placeholder: String?, val sentAtMillis: Long)

/** The rule-derived part of a chat's state. */
data class ChatState(
    val yourTurn: Boolean,
    val waitingSinceMillis: Long?,
    val unansweredQuestions: List<String>,
    val decisions: List<String>,
)

/**
 * Port of the server's conversation memory rules (`services/intelligence/app/memory/conversation_memory.py`),
 * folded over the stored messages instead of kept in Redis:
 * - a question from the other person is added to the open questions (at most 10, 280 characters each);
 * - each reply from the owner is taken to answer the oldest open question;
 * - an agreement ("let's do Friday", "deal") is kept as a recent decision;
 * - like the server's 3-day TTL, only the last 3 days count for questions (14 for decisions).
 * The server marks questions and decisions with its per-message analysis; here simple wording rules
 * stand in for it, so this works on every phone with no model.
 */
object ConversationStateUpdater {
    const val MAX_ITEMS = 10
    const val MAX_CHARS = 280
    const val QUESTION_WINDOW_MILLIS = 3L * 24 * 60 * 60 * 1000
    const val DECISION_WINDOW_MILLIS = 14L * 24 * 60 * 60 * 1000

    /** [messages] oldest first. */
    fun fold(messages: List<StateMessage>, nowMillis: Long): ChatState {
        val relevant = messages.filter { it.placeholder != "REACTION" && it.placeholder != "DELETED" }
        val questions = ArrayDeque<String>()
        val decisions = ArrayDeque<String>()
        for (m in relevant) {
            val text = m.text?.trim().orEmpty()
            if (m.sentAtMillis >= nowMillis - QUESTION_WINDOW_MILLIS) {
                if (!m.fromMe && Questions.isQuestion(text)) {
                    if (questions.size == MAX_ITEMS) questions.removeFirst()
                    questions.addLast(text.take(MAX_CHARS))
                } else if (m.fromMe && questions.isNotEmpty()) {
                    // A reply from the owner is assumed to address the oldest open question.
                    questions.removeFirst()
                }
            }
            if (m.sentAtMillis >= nowMillis - DECISION_WINDOW_MILLIS && text.isNotEmpty() && Decisions.isDecision(text)) {
                if (decisions.size == MAX_ITEMS) decisions.removeFirst()
                decisions.addLast(text.take(MAX_CHARS))
            }
        }
        val lastMine = relevant.indexOfLast { it.fromMe }
        val theirsAfter = relevant.drop(lastMine + 1)
        val yourTurn = relevant.isNotEmpty() && !relevant.last().fromMe
        return ChatState(
            yourTurn = yourTurn,
            waitingSinceMillis = if (yourTurn) theirsAfter.firstOrNull()?.sentAtMillis else null,
            unansweredQuestions = questions.toList(),
            decisions = decisions.toList(),
        )
    }
}

object Questions {
    private val AUX = Regex(
        "^(can|could|would|will|shall|should|do|does|did|is|are|am|was|were|have|has|had|may|might|must|r)\\s+(you|u|we|i|he|she|they|it|this|that|there|your|ur|anyone)\\b",
        RegexOption.IGNORE_CASE,
    )
    private val IMPERATIVE = Regex("^do\\s+(it|this|that)\\b", RegexOption.IGNORE_CASE)
    private val WH = Regex("^(what|whats|what's|when|where|who|whom|whose|why|how|which|wanna|any news|any update)\\b", RegexOption.IGNORE_CASE)

    fun isQuestion(text: String): Boolean {
        val t = text.trim()
        if (t.length < 2) return false
        if ('?' in t && t.any { it.isLetterOrDigit() }) return true
        // "do it now" / "do that later" are instructions, not questions.
        if (AUX.containsMatchIn(t) && !IMPERATIVE.containsMatchIn(t)) return true
        // A wh-word opening a short line with no full stop reads as a question ("when are you back").
        return WH.containsMatchIn(t) && t.length <= 80 && !t.endsWith('.') && !t.endsWith('!')
    }
}

object Decisions {
    private val DECISION = Regex(
        "\\b(let'?s (do|go|meet|say|make it|keep it)|deal|agreed|it'?s (settled|a deal|confirmed)|confirmed|we'?ll go with|go ahead|booked|see you (on|at|tomorrow|then|there)|sounds good|ok(ay)? then|that works|done deal)\\b",
        RegexOption.IGNORE_CASE,
    )

    fun isDecision(text: String): Boolean = DECISION.containsMatchIn(text)
}
