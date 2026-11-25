package app.zuri.android.domain.inbox

import app.zuri.android.domain.capture.SourceKind
import app.zuri.android.domain.workspace.WorkspaceId
import kotlinx.coroutines.flow.Flow

/**
 * What a message bubble stands in for when the notification didn't carry readable text. These are
 * shown as honest placeholders, never as parse errors (IMPLEMENTATION_PLAN.md M2 acceptance).
 */
enum class PlaceholderKind {
    PHOTO, VIDEO, VOICE_NOTE, AUDIO, DOCUMENT, STICKER, GIF, LOCATION, CONTACT_CARD, POLL,
    /** "This message was deleted". */
    DELETED,
    /** Android 15+ hid the content because it looked like a one-time code. */
    OTP_HIDDEN,
    /** The source app hid the preview ("New message"). */
    CONTENT_HIDDEN,
    MISSED_CALL,
    REACTION,
}

enum class Direction { INCOMING, OUTGOING }

@JvmInline value class ConversationId(val value: String)
@JvmInline value class MessageId(val value: String)

data class ConversationSummary(
    val id: ConversationId,
    val source: SourceKind,
    val title: String,
    val isGroup: Boolean,
    val lastMessageAtMillis: Long,
    val lastText: String?,
    val lastPlaceholder: PlaceholderKind?,
    val lastSenderName: String?,
    val lastFromMe: Boolean,
    val unreadCount: Int,
    val messageCount: Int,
)

data class InboxMessage(
    val id: MessageId,
    val direction: Direction,
    val senderName: String?,
    val text: String?,
    val placeholder: PlaceholderKind?,
    /** Extra detail for a placeholder, e.g. a voice note's duration or a file name. */
    val placeholderDetail: String?,
    val sentAtMillis: Long,
    val edited: Boolean,
    val provenance: Provenance,
)

/** Where a message came from; shown on request so every stored line can be traced. */
data class Provenance(
    val source: SourceKind,
    val sourcePackage: String,
    val capturedAtMillis: Long,
    val notificationPostedAtMillis: Long,
    val adapterVersion: Int,
    /** False for everything in this version: nothing leaves the phone. */
    val leftThisPhone: Boolean = false,
)

data class ConversationDetail(
    val summary: ConversationSummary,
    val messages: List<InboxMessage>,
    val excluded: Boolean,
)

interface InboxRepository {
    fun observeConversations(workspace: WorkspaceId): Flow<List<ConversationSummary>>
    fun observeConversation(id: ConversationId): Flow<ConversationDetail?>
    suspend fun markRead(id: ConversationId)
    suspend fun deleteMessage(id: MessageId)
    suspend fun deleteConversation(id: ConversationId)
    /** Stops capturing this conversation and deletes what was stored. */
    suspend fun excludeConversation(id: ConversationId)
    /** Deletes every message captured from one source. Returns how many were deleted. */
    suspend fun deleteAllFrom(source: SourceKind): Int
    suspend fun messageCount(source: SourceKind): Int
}
