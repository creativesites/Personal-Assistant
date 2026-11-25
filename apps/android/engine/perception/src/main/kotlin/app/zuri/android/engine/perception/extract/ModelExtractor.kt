package app.zuri.android.engine.perception.extract

import app.zuri.android.domain.ai.GenerationRequest
import app.zuri.android.domain.ai.GenerationResult
import app.zuri.android.domain.ai.LocalLanguageModel
import app.zuri.android.domain.memory.MemoryKind
import app.zuri.android.domain.memory.MemoryOrigin
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * The Standard tier: the on-device model reads a batch and answers in schema-constrained JSON.
 * The model is told to quote the message it used; [Grounding] then throws away anything whose
 * quote isn't really in that message.
 */
class ModelExtractor(private val model: LocalLanguageModel, private val zone: () -> ZoneId) {
    sealed interface Outcome {
        data class Items(val candidates: List<Candidate>, val modelId: String) : Outcome
        data object NoModel : Outcome
        /** The engine failed or stopped; the batch is left unread so it is tried again later. */
        data class Failed(val message: String) : Outcome
    }

    suspend fun extract(batch: ChatBatch): Outcome {
        val request = GenerationRequest(prompt = prompt(batch, zone()), system = SYSTEM, maxOutputTokens = 512)
        return when (val r = model.generateJson(request, SCHEMA)) {
            is GenerationResult.Success -> Outcome.Items(parse(r.text, batch), r.modelId)
            GenerationResult.NoModelInstalled -> Outcome.NoModel
            is GenerationResult.Failed -> Outcome.Failed(r.message)
        }
    }

    @Serializable private data class Reply(val items: List<Item> = emptyList())
    @Serializable private data class Item(val kind: String, val message: Int, val quote: String, val summary: String, val `when`: String? = null)

    internal fun parse(raw: String, batch: ChatBatch): List<Candidate> {
        val reply = runCatching { JSON.decodeFromString<Reply>(raw.trim()) }.getOrNull() ?: return emptyList()
        return reply.items.mapNotNull { item ->
            val kind = KINDS[item.kind] ?: return@mapNotNull null
            val line = item.message - 1
            if (line !in batch.lines.indices) return@mapNotNull null
            Candidate(kind, line, item.quote, item.summary, item.`when`?.takeIf { it.isNotBlank() }, MemoryOrigin.MODEL)
        }
    }

    companion object {
        private val JSON = Json { ignoreUnknownKeys = true }
        private val KINDS = mapOf(
            "my_promise" to MemoryKind.MY_PROMISE, "their_promise" to MemoryKind.THEIR_PROMISE,
            "request_to_me" to MemoryKind.REQUEST_TO_ME, "event" to MemoryKind.EVENT, "fact" to MemoryKind.FACT,
        )

        const val SYSTEM = """You read a chat from the owner's phone. "Me" is the owner. List only what the messages clearly say:
- my_promise: Me says Me will do something.
- their_promise: the other person says they will do something.
- request_to_me: the other person asks Me to do something.
- event: a meeting, call, visit or occasion with a day or time.
- fact: a lasting personal fact about the other person (family, work, health, plans, likes).
For each item give the message number, the exact words copied from that message as quote, a short summary written for Me (for example "Send Chanda the quotation"), and the time words if any.
Skip greetings, thanks, small talk and anything unclear. Never invent. If nothing qualifies, return an empty list."""

        const val SCHEMA = """{"type":"object","properties":{"items":{"type":"array","items":{"type":"object","properties":{"kind":{"type":"string","enum":["my_promise","their_promise","request_to_me","event","fact"]},"message":{"type":"integer"},"quote":{"type":"string"},"summary":{"type":"string"},"when":{"type":"string"}},"required":["kind","message","quote","summary"]}}},"required":["items"]}"""

        private val STAMP = DateTimeFormatter.ofPattern("EEE d MMM HH:mm", Locale.ENGLISH)

        fun prompt(batch: ChatBatch, zone: ZoneId): String = buildString {
            append(if (batch.isGroup) "Group chat: " else "Chat with ").append(batch.conversationTitle).append(".\n")
            if (batch.context.isNotEmpty()) {
                append("\nEarlier messages (context only, do not list items from these):\n")
                batch.context.forEach { append(it.speaker).append(": ").append(it.text.take(300)).append('\n') }
            }
            append("\nMessages to read:\n")
            batch.lines.forEachIndexed { i, l ->
                append('[').append(i + 1).append("] ").append(l.speaker).append(", ")
                append(STAMP.format(Instant.ofEpochMilli(l.sentAtMillis).atZone(zone))).append(": ").append(l.text.take(600)).append('\n')
            }
        }
    }
}
