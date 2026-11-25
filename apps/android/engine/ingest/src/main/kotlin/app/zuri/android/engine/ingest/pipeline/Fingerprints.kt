package app.zuri.android.engine.ingest.pipeline

import app.zuri.android.engine.ingest.parse.ParsedMessage
import java.security.MessageDigest

/**
 * `fingerprint = H(chat_key ‖ sender_key ‖ normalise(text) ‖ floor(time / 60 s))` (ARCHITECTURE.md §5.3).
 * Apps re-post a chat's notification with the accumulated message list, so dedup can't use the
 * notification key. Neighbouring minute buckets are checked too, for messages near a minute boundary.
 */
object Fingerprints {
    private const val BUCKET_MS = 60_000L

    fun content(m: ParsedMessage): String {
        val text = m.text?.lowercase()?.replace(Regex("\\s+"), " ")?.trim().orEmpty()
        return if (m.placeholder != null) "<${m.placeholder.name}:${m.placeholderDetail.orEmpty()}>$text" else text
    }

    fun of(m: ParsedMessage, bucketOffset: Long = 0): String {
        val bucket = Math.floorDiv(m.sentAt, BUCKET_MS) + bucketOffset
        return sha256("${m.chat.key}\u0001${m.senderKey}\u0001${content(m)}\u0001$bucket")
    }

    fun withNeighbours(m: ParsedMessage): List<String> = listOf(-1L, 0L, 1L).map { of(m, it) }

    private fun sha256(s: String): String =
        MessageDigest.getInstance("SHA-256").digest(s.toByteArray()).joinToString("") { "%02x".format(it) }.take(40)
}
