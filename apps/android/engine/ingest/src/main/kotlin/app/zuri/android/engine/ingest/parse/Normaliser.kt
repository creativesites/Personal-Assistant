package app.zuri.android.engine.ingest.parse

import app.zuri.android.domain.inbox.PlaceholderKind

/** The text of one message after cleanup: either readable text, a placeholder, or both (a captioned photo). */
data class Classified(val text: String?, val placeholder: PlaceholderKind?, val detail: String? = null)

/**
 * Recognises what a notification line stands for (ARCHITECTURE.md §5.1 Normaliser). The patterns
 * cover the English strings the supported apps use; anything unrecognised stays plain text, which is
 * the safe failure: Zuri never invents a placeholder for text it can read.
 */
object Normaliser {
    private const val MAX_DETAIL = 120

    // Android 15+ replaces one-time-code notifications with this for untrusted listeners.
    private val otpHidden = setOf("sensitive notification content hidden", "sensitive content hidden")
    private val deleted = setOf("this message was deleted", "you deleted this message", "message deleted", "this message has been deleted")
    private val hidden = Regex("^(new message|new messages|\\d+ new messages?|message|you have a new message)$", RegexOption.IGNORE_CASE)
    private val missedCall = Regex("^missed (voice |video )?call$", RegexOption.IGNORE_CASE)
    private val reaction = Regex("^reacted (.+?) to[: ]", RegexOption.IGNORE_CASE)
    private val voiceDuration = Regex("\\((\\d{1,2}:\\d{2})\\)")

    private data class MediaRule(val emojis: List<String>, val words: List<String>, val kind: PlaceholderKind)

    private val media = listOf(
        MediaRule(listOf("📷", "🖼", "🖼️"), listOf("photo", "image"), PlaceholderKind.PHOTO),
        MediaRule(listOf("📹", "🎥"), listOf("video"), PlaceholderKind.VIDEO),
        MediaRule(listOf("🎤", "🎙", "🎙️"), listOf("voice message", "voice note", "audio message"), PlaceholderKind.VOICE_NOTE),
        MediaRule(listOf("🎵", "🎶", "🎧"), listOf("audio"), PlaceholderKind.AUDIO),
        MediaRule(listOf("🌠", "💟"), listOf("sticker"), PlaceholderKind.STICKER),
        MediaRule(listOf("👾"), listOf("gif"), PlaceholderKind.GIF),
        MediaRule(listOf("📍"), listOf("location", "live location"), PlaceholderKind.LOCATION),
        MediaRule(listOf("👤"), listOf("contact"), PlaceholderKind.CONTACT_CARD),
        MediaRule(listOf("📊"), listOf("poll"), PlaceholderKind.POLL),
        MediaRule(listOf("📄", "📎", "📁"), listOf("document", "file"), PlaceholderKind.DOCUMENT),
    )

    fun classify(raw: String?): Classified? {
        val text = clean(raw) ?: return null
        val lower = text.lowercase()
        if (lower in otpHidden) return Classified(null, PlaceholderKind.OTP_HIDDEN)
        if (lower.trimEnd('.') in deleted) return Classified(null, PlaceholderKind.DELETED)
        if (hidden.matches(text)) return Classified(null, PlaceholderKind.CONTENT_HIDDEN)
        if (missedCall.matches(text)) return Classified(null, PlaceholderKind.MISSED_CALL)
        reaction.find(text)?.let { return Classified(null, PlaceholderKind.REACTION, it.groupValues[1].take(MAX_DETAIL)) }
        mediaOf(text)?.let { return it }
        return Classified(text, null)
    }

    /** Emoji-prefixed labels may carry a caption; a bare word counts only as the whole message ("Photo"). */
    private fun mediaOf(text: String): Classified? {
        for (rule in media) {
            val emoji = rule.emojis.firstOrNull { text.startsWith(it) }
            if (emoji != null) {
                val rest = text.removePrefix(emoji).trim().removePrefix("️").trim()
                // "📷 Photo" is a bare label; anything else after the emoji is the caption ("📷 Photos from today").
                val bareLabel = rule.words.any { rest.equals(it, ignoreCase = true) }
                return when {
                    rule.kind == PlaceholderKind.DOCUMENT -> Classified(null, rule.kind, rest.take(MAX_DETAIL).ifEmpty { null })
                    rule.kind == PlaceholderKind.VOICE_NOTE -> Classified(null, rule.kind, voiceDuration.find(rest)?.groupValues?.get(1))
                    rule.kind == PlaceholderKind.CONTACT_CARD -> Classified(null, rule.kind, rest.substringAfter(':', "").trim().take(MAX_DETAIL).ifEmpty { null })
                    rule.kind == PlaceholderKind.POLL -> Classified(null, rule.kind, rest.substringAfter(':', "").trim().take(MAX_DETAIL).ifEmpty { null })
                    bareLabel -> Classified(null, rule.kind)
                    else -> Classified(rest.ifEmpty { null }, rule.kind)
                }
            }
            if (rule.words.any { text.equals(it, ignoreCase = true) }) return Classified(null, rule.kind)
        }
        return null
    }

    /** Trims, drops invisible direction marks, and collapses runs of blank lines. */
    fun clean(raw: String?): String? {
        if (raw == null) return null
        val s = raw.replace(Regex("[‎‏‪-‮⁦-⁩]"), "")
            .replace(Regex("[ \\t]+\\n"), "\n")
            .replace(Regex("\\n{3,}"), "\n\n")
            .trim()
        return s.ifEmpty { null }
    }
}
