package app.zuri.android.engine.ingest.parse

import app.zuri.android.domain.inbox.PlaceholderKind

data class ParsedChat(
    /** Stable per-app conversation key (ARCHITECTURE.md §5.1 ChatKeyResolver). */
    val key: String,
    val title: String,
    val isGroup: Boolean,
)

data class ParsedMessage(
    val chat: ParsedChat,
    val senderKey: String,
    val senderName: String?,
    val fromMe: Boolean,
    val text: String?,
    val placeholder: PlaceholderKind?,
    val placeholderDetail: String?,
    val sentAt: Long,
    /** True when [sentAt] is the message's own timestamp rather than the notification's post time. */
    val exactTime: Boolean,
)

sealed interface ParseResult {
    data class Messages(val messages: List<ParsedMessage>) : ParseResult
    /** Not a message (a summary, a call, a progress bar). Not an error. */
    data class Skipped(val reason: String) : ParseResult
    /** A notification shape the adapter couldn't read; counted, never thrown. */
    data class Failed(val reason: String) : ParseResult
}

interface SourceAdapter {
    /** Bumped whenever parsing changes, so stored rows record which version produced them. */
    val version: Int
    fun parse(snapshot: app.zuri.android.engine.ingest.snapshot.NotificationSnapshot): ParseResult
}

object ChatKeys {
    fun of(shortcutId: String?, title: String, isGroup: Boolean): String =
        shortcutId?.trim()?.takeIf { it.isNotEmpty() }?.let { "s:$it" }
            ?: ((if (isGroup) "g:" else "d:") + normalise(title))

    fun normalise(s: String): String = s.trim().lowercase().replace(Regex("\\s+"), " ")

    const val SELF = "me"

    fun sender(fromMe: Boolean, key: String?, uri: String?, name: String?, fallback: String): String = when {
        fromMe -> SELF
        !key.isNullOrBlank() -> "k:$key"
        !uri.isNullOrBlank() -> "u:$uri"
        else -> "n:" + normalise(name ?: fallback)
    }
}
