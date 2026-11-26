package app.zuri.android.engine.perception.pipeline

import androidx.room.withTransaction
import app.zuri.android.core.common.Clock
import app.zuri.android.core.common.UuidV7
import app.zuri.android.core.common.ZuriLog
import app.zuri.android.data.local.db.MemoryEntity
import app.zuri.android.data.local.db.MessageWithConversation
import app.zuri.android.data.local.db.ZuriDatabase
import app.zuri.android.domain.ai.AiTier
import app.zuri.android.domain.ai.LocalLanguageModel
import app.zuri.android.domain.inbox.Direction
import app.zuri.android.domain.memory.MemoryReview
import app.zuri.android.domain.memory.MemoryStatus
import app.zuri.android.engine.perception.dates.DateResolver
import app.zuri.android.engine.perception.extract.ChatBatch
import app.zuri.android.engine.perception.extract.ChatLine
import app.zuri.android.engine.perception.extract.Grounded
import app.zuri.android.engine.perception.extract.Grounding
import app.zuri.android.engine.perception.extract.ModelExtractor
import app.zuri.android.engine.perception.extract.RulesExtractor
import java.time.ZoneId

/**
 * Reads waiting messages a conversation at a time, oldest first, in batches of [BATCH], and stores
 * what it understands. Messages are marked read only once their batch is stored, so a crash or an
 * engine failure leaves them waiting. Groups are skipped unless analysis is on for them (Q-13).
 */
class PerceptionRunner(
    private val db: ZuriDatabase,
    private val model: LocalLanguageModel,
    private val clock: Clock,
    private val zone: () -> ZoneId = { ZoneId.systemDefault() },
) {
    private val perception = db.perceptionDao()
    private val memories = db.memoryDao()
    private val extractor = ModelExtractor(model, zone)

    data class Stats(val batches: Int, val messages: Int, val stored: Int, val stoppedEarly: Boolean, val failure: String? = null)

    /** Runs until nothing waits, [deadlineMillis] passes, [pause] says stop (e.g. the phone is hot), or the engine fails. */
    suspend fun run(deadlineMillis: Long, pause: () -> Boolean = { false }): Stats {
        memories.deleteWhereSourceTextGone()
        val since = clock.nowMillis() - WINDOW_MILLIS
        var batches = 0; var read = 0; var stored = 0
        for (conversation in perception.conversationsWaiting(since, 100)) {
            while (true) {
                if (clock.nowMillis() > deadlineMillis || pause()) return Stats(batches, read, stored, stoppedEarly = true)
                val rows = perception.waitingIn(conversation, since, BATCH)
                if (rows.isEmpty()) break
                val batch = batchOf(rows)
                val (items, modelId, failure) = understand(batch)
                if (failure != null) {
                    ZuriLog.w("PERCEPTION", "batch_failed", "detail" to failure.take(200))
                    return Stats(batches, read, stored, stoppedEarly = true, failure = failure)
                }
                stored += store(rows, items, modelId)
                batches++; read += rows.size
            }
        }
        return Stats(batches, read, stored, stoppedEarly = false)
    }

    private suspend fun batchOf(rows: List<MessageWithConversation>): ChatBatch {
        val first = rows.first()
        val context = perception.before(first.conversationId, first.sentAt, CONTEXT).filter { it.text != null }
        return ChatBatch(first.title, first.isGroup, context.map { it.toLine() }, rows.map { it.toLine() })
    }

    private fun MessageWithConversation.toLine() = ChatLine(
        id = id, fromMe = direction == Direction.OUTGOING.name,
        speaker = if (direction == Direction.OUTGOING.name) "Me" else senderName ?: title,
        text = text.orEmpty(), sentAtMillis = sentAt,
    )

    private data class Understood(val items: List<Grounded>, val modelId: String?, val failure: String?)

    private suspend fun understand(batch: ChatBatch): Understood {
        val z = zone()
        val hasDate = { s: String, at: Long -> DateResolver.resolve(s, at, z) != null }
        val rules = RulesExtractor.extract(batch, hasDate)
        if (model.tier() == AiTier.ESSENTIAL) return Understood(Grounding.ground(batch, rules, z), null, null)
        return when (val outcome = extractor.extract(batch)) {
            is ModelExtractor.Outcome.Items -> {
                val agree = { line: Int, kind: app.zuri.android.domain.memory.MemoryKind -> rules.any { it.line == line && it.kind == kind } }
                Understood(Grounding.ground(batch, outcome.candidates, z, agree), outcome.modelId, null)
            }
            ModelExtractor.Outcome.NoModel -> Understood(Grounding.ground(batch, rules, z), null, null)
            is ModelExtractor.Outcome.Failed -> Understood(emptyList(), null, outcome.message)
        }
    }

    private suspend fun store(rows: List<MessageWithConversation>, items: List<Grounded>, modelId: String?): Int {
        val now = clock.nowMillis()
        val ids = rows.map { it.id }
        val byId = rows.associateBy { it.id }
        var count = 0
        db.withTransaction {
            // A changed message is read again: drop what wasn't reviewed yet, keep what the owner confirmed.
            memories.deleteSuggestedFrom(ids)
            for (g in items) {
                val row = byId.getValue(g.source.id)
                if (memories.exists(row.id, g.kind.name)) continue
                // Learning loop: something the owner already rejected in this chat isn't suggested again.
                if (memories.rejectedTexts(row.conversationId, g.kind.name).any { normalized(it) == normalized(g.text) }) continue
                memories.insert(
                    MemoryEntity(
                        id = UuidV7.generate(clock), workspaceId = row.workspaceId, conversationId = row.conversationId,
                        sourceMessageId = row.id, kind = g.kind.name, text = g.text, personName = g.personName,
                        sourceQuote = g.quote, sourceSentAt = row.sentAt, dueAt = g.dueAtMillis, dueText = g.dueText,
                        dueHasTime = g.dueHasTime, confidence = g.confidence, origin = g.origin.name, modelId = modelId,
                        status = MemoryStatus.OPEN.name, review = MemoryReview.SUGGESTED.name, createdAt = now, updatedAt = now,
                    ),
                )
                count++
            }
            perception.markPerceived(ids, now)
        }
        return count
    }

    private fun normalized(text: String) = text.lowercase().replace(Regex("[^\\p{L}\\p{N}]+"), " ").trim()

    companion object {
        const val BATCH = 12
        const val CONTEXT = 4
        /** Only the last 30 days are read: older backlog would take hours on a phone CPU. */
        const val WINDOW_MILLIS = 30L * 24 * 60 * 60 * 1000
    }
}
