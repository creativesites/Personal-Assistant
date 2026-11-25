package app.zuri.android.domain.inbox

import kotlinx.coroutines.flow.Flow

sealed interface ReplyResult {
    data object Sent : ReplyResult
    /** The chat has no live notification with a reply button (it was opened or dismissed). */
    data object NotAvailable : ReplyResult
    data class Failed(val message: String) : ReplyResult
}

/**
 * Replying from Zuri (M4 reply sheet). A reply goes through the source app's own notification
 * reply action, exactly as Android's quick reply does, and only when the owner taps Send: Zuri
 * never replies on its own. The sent text is stored as the owner's message, so understanding sees
 * both sides of the conversation.
 */
interface ReplySender {
    fun observeCanReply(id: ConversationId): Flow<Boolean>
    suspend fun reply(id: ConversationId, text: String): ReplyResult
}
