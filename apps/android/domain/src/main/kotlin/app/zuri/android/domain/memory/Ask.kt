package app.zuri.android.domain.memory

import app.zuri.android.domain.inbox.ConversationId
import app.zuri.android.domain.inbox.MessageId
import app.zuri.android.domain.workspace.WorkspaceId

/** One piece of evidence an answer can cite: a stored message, or an understood item and its message. */
data class AskSource(
    /** 1-based, as cited in the answer text ("[2]"). */
    val number: Int,
    val conversationId: ConversationId,
    val conversationTitle: String,
    val messageId: MessageId,
    val speaker: String,
    val text: String,
    val sentAtMillis: Long,
)

sealed interface AskAnswer {
    /** [text] cites [sources] by number; every cited number exists in [sources]. */
    data class Answered(val text: String, val sources: List<AskSource>, val byModel: Boolean) : AskAnswer
    /** Nothing stored answers the question. [closest] are the nearest matches, if any. */
    data class NotFound(val closest: List<AskSource>) : AskAnswer
}

/** Ask Zuri: answers from what is stored on this phone, offline, with sources. */
interface AskZuri {
    suspend fun ask(workspace: WorkspaceId, question: String): AskAnswer
}
