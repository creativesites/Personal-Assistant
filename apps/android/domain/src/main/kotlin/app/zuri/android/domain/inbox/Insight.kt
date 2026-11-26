package app.zuri.android.domain.inbox

import app.zuri.android.domain.workspace.WorkspaceId
import kotlinx.coroutines.flow.Flow

/** The recent mood of a chat, from the other person's latest messages (no model needed). */
enum class Mood { WARM, NEUTRAL, LOW, TENSE }

/**
 * What's going on in a chat (port of the server's conversation memory): whose turn it is, the
 * questions still waiting for an answer, decisions made, the mood, and an on-demand summary.
 */
data class ConversationInsight(
    /** The other person wrote last and the owner hasn't answered. */
    val yourTurn: Boolean = false,
    val waitingSinceMillis: Long? = null,
    /** Their questions since the owner last wrote, oldest first (at most 10). */
    val unansweredQuestions: List<String> = emptyList(),
    /** Recent agreements ("let's do Friday", "deal"), oldest first (at most 10). */
    val decisions: List<String> = emptyList(),
    val mood: Mood? = null,
    val topic: String? = null,
    val summary: String? = null,
    val summaryAtMillis: Long? = null,
    /** Messages arrived after the summary was written. */
    val summaryOutdated: Boolean = false,
)

sealed interface SummaryResult {
    data object Done : SummaryResult
    data object NothingToSummarize : SummaryResult
    /** The Essential tier has no model to summarise with. */
    data object NoModel : SummaryResult
    data class Failed(val message: String, val engineStopped: Boolean = false) : SummaryResult
}

/** A chat waiting for the owner's reply, for Today. */
data class WaitingChat(
    val id: ConversationId,
    val title: String,
    val lastText: String?,
    val lastPlaceholder: PlaceholderKind?,
    val waitingSinceMillis: Long,
    val questions: Int,
    val mood: Mood?,
)

interface ConversationInsights {
    fun observe(id: ConversationId): Flow<ConversationInsight>
    /** Writes (or rewrites) the chat summary on the phone. Runs only when the owner asks. */
    suspend fun summarize(id: ConversationId): SummaryResult
    /** One-to-one chats in [workspaces] where it's the owner's turn, newest first. */
    fun observeWaiting(workspaces: Set<WorkspaceId>): Flow<List<WaitingChat>>
}
