package app.zuri.android.engine.sync

import app.zuri.android.data.local.db.CloudJson
import app.zuri.android.data.local.db.ConversationEntity
import app.zuri.android.data.local.db.MessageEntity
import app.zuri.android.data.remote.SyncMessage
import app.zuri.android.domain.inbox.PlaceholderKind
import kotlinx.serialization.builtins.ListSerializer

/** Maps a feed message to the phone's message columns, and decides whether a capture is the same message. */
object CloudMessages {
    data class Mapped(
        val text: String?, val placeholder: String?, val detail: String?, val senderName: String?, val senderJid: String?,
        val fromMe: Boolean, val order: Long, val quoted: String?, val media: String?, val reactions: String?, val location: String?,
    ) {
        /** Same convention as notification captures (ChatKeys): "me", else a stable per-sender key. */
        fun senderKey(conv: ConversationEntity): String = when {
            fromMe -> "me"
            !conv.isGroup -> conv.chatKey
            senderJid != null -> "j:$senderJid"
            else -> "n:" + (senderName ?: conv.title).trim().lowercase()
        }
    }

    fun map(s: SyncMessage): Mapped {
        val placeholder = when {
            s.deleted -> PlaceholderKind.DELETED
            s.media != null -> when (s.media!!.kind) {
                "image" -> PlaceholderKind.PHOTO
                "video" -> if (s.media!!.gif) PlaceholderKind.GIF else PlaceholderKind.VIDEO
                "audio" -> if (s.media!!.voiceNote) PlaceholderKind.VOICE_NOTE else PlaceholderKind.AUDIO
                "document" -> PlaceholderKind.DOCUMENT
                "sticker" -> PlaceholderKind.STICKER
                else -> null
            }
            s.type == "location" -> PlaceholderKind.LOCATION
            s.type == "contact_card" -> PlaceholderKind.CONTACT_CARD
            s.type == "poll" -> PlaceholderKind.POLL
            else -> null
        }
        // A voice note's transcript is its text for search and understanding; the caption otherwise.
        val text = if (s.deleted) null else s.text?.takeIf { it.isNotBlank() } ?: s.transcription?.takeIf { it.isNotBlank() }
        val detail = when (placeholder) {
            PlaceholderKind.DOCUMENT -> s.media?.fileName
            PlaceholderKind.VOICE_NOTE, PlaceholderKind.AUDIO, PlaceholderKind.VIDEO -> s.media?.seconds?.let { secs -> "%d:%02d".format(secs.toInt() / 60, secs.toInt() % 60) }
            PlaceholderKind.LOCATION -> s.location?.name
            else -> null
        }
        val j = CloudJson.json
        return Mapped(
            text = text, placeholder = placeholder?.name, detail = detail,
            senderName = if (s.fromMe) null else s.sender?.name, senderJid = s.sender?.jid, fromMe = s.fromMe,
            order = s.order.toLongOrNull() ?: 0L,
            quoted = s.quoted?.let { q -> j.encodeToString(CloudJson.Quoted.serializer(), CloudJson.Quoted(q.messageId, q.waMessageId, q.fromMe, q.senderName, q.type, q.text, q.deleted)) },
            media = s.media?.takeIf { !s.deleted }?.let { m ->
                j.encodeToString(
                    CloudJson.Media.serializer(),
                    CloudJson.Media(m.kind, m.mime, m.size, m.width, m.height, m.seconds, m.voiceNote, m.roundVideo, m.gif, m.animated, m.fileName, m.pageCount, m.thumbnail, m.available, m.path),
                )
            },
            reactions = s.reactions.takeIf { it.isNotEmpty() }?.let { rs ->
                j.encodeToString(ListSerializer(CloudJson.Reaction.serializer()), rs.map { CloudJson.Reaction(it.emoji, it.fromMe, it.reactorJid, it.at) })
            },
            location = s.location?.let { l -> j.encodeToString(CloudJson.Location.serializer(), CloudJson.Location(l.lat, l.lng, l.name, l.address)) },
        )
    }

    /** Whether a notification capture shows the same content (its text may be cleaned or cut short). */
    fun sameContent(capture: MessageEntity, m: Mapped): Boolean {
        val a = norm(capture.text)
        val b = norm(m.text)
        if (a.isEmpty() && b.isEmpty()) return capture.placeholderKind != null && capture.placeholderKind == m.placeholder
        if (a.isEmpty() || b.isEmpty()) return capture.placeholderKind != null && capture.placeholderKind == m.placeholder
        if (a == b) return true
        // Notifications can truncate long messages ("…"): a long shared prefix is the same message.
        val prefix = a.commonPrefixWith(b).length
        return prefix >= 40 && prefix >= minOf(a.length, b.length) - 2
    }

    private fun norm(s: String?): String = s.orEmpty().lowercase().replace(Regex("[^\\p{L}\\p{N}]+"), " ").trim()
}
