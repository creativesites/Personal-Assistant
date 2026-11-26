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
    /** [automatic]: sent by an auto-reply (D-22), marked as such on the stored message. */
    suspend fun reply(id: ConversationId, text: String, automatic: Boolean = false): ReplyResult
}

/** Adapter versions on messages Zuri itself sent (real capture adapters are numbered from 1). */
object SentFromZuri {
    const val TAPPED = 0
    const val AUTO_REPLY = -1
}
