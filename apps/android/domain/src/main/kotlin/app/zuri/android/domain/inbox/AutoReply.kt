package app.zuri.android.domain.inbox

import kotlinx.coroutines.flow.Flow

/** Settings for every auto-reply chat. A reply goes out after a random delay in the range. */
data class AutoReplySettings(val paused: Boolean = false, val minDelayMinutes: Int = 2, val maxDelayMinutes: Int = 5) {
    companion object { const val MAX_DELAY_MINUTES = 60 }
}

enum class AutoReplyOutcome { SENT, HELD, SKIPPED, FAILED }

/** Why an auto-reply wasn't sent. HELD reasons leave the reply to the owner, often with a draft. */
enum class AutoReplyReason {
    /** Money, codes or passwords, or something serious (illness, an emergency, a loss). */
    SENSITIVE,
    /** Only a photo, voice note or other media: Zuri can't read it. */
    MEDIA_ONLY,
    NO_MODEL,
    NO_SAFE_DRAFT,
    /** The chat's notification was cleared, so there was no reply button to use. */
    NOTIFICATION_GONE,
    ENGINE_STOPPED,
    /** More than the hourly or daily limit for auto-replies. */
    LIMIT,
    /** The owner had already replied. */
    OWNER_REPLIED,
    /** A newer message arrived; it is answered instead. */
    SUPERSEDED,
    PAUSED,
    TURNED_OFF,
    SEND_ERROR,
}

data class AutoReplyEvent(val atMillis: Long, val outcome: AutoReplyOutcome, val reason: AutoReplyReason?, val text: String?)

/**
 * Auto-replies (D-22, owner decision 2026-11-26): opt-in per chat, never for groups. Zuri answers
 * a new message after a random delay, in the owner's style and from the chat's context, and holds
 * back (leaving it to the owner) whenever a message is sensitive or no safe draft exists.
 */
interface AutoReplies {
    val settings: Flow<AutoReplySettings>
    suspend fun setPaused(paused: Boolean)
    suspend fun setDelay(minMinutes: Int, maxMinutes: Int)
    fun observeEnabled(id: ConversationId): Flow<Boolean>
    suspend fun setEnabled(id: ConversationId, on: Boolean)
    fun observeEvents(id: ConversationId): Flow<List<AutoReplyEvent>>
}
