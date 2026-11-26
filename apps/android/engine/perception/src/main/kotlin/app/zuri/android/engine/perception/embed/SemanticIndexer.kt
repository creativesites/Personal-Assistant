package app.zuri.android.engine.perception.embed

import app.zuri.android.core.common.ZuriLog
import app.zuri.android.data.local.db.MessageEmbeddingEntity
import app.zuri.android.data.local.db.Vectors
import app.zuri.android.data.local.db.ZuriDatabase
import app.zuri.android.domain.ai.EmbedPurpose
import app.zuri.android.domain.ai.EmbedResult
import app.zuri.android.domain.ai.LocalEmbedder
import app.zuri.android.domain.inbox.Direction

/**
 * Keeps message vectors up to date for meaning-based search (M4 hybrid retrieval). Runs after
 * perception, newest messages first, in small batches, and only when an embedding model is installed.
 */
class SemanticIndexer(
    private val db: ZuriDatabase,
    private val embedder: LocalEmbedder,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    private val dao = db.embeddingDao()

    data class Stats(val embedded: Int, val stoppedEarly: Boolean, val failure: String? = null)

    suspend fun run(deadlineMillis: Long, pause: () -> Boolean = { false }): Stats {
        val modelId = embedder.modelId() ?: return Stats(0, false)
        dao.deleteOtherModels(modelId)
        var done = 0
        while (done < MAX_PER_RUN) {
            if (clock() > deadlineMillis || pause()) return Stats(done, stoppedEarly = true)
            val batch = dao.pending(modelId, clock() - WINDOW_MILLIS, BATCH)
            if (batch.isEmpty()) break
            val texts = batch.map { m ->
                val who = if (m.direction == Direction.OUTGOING.name) "Me" else m.senderName ?: "Them"
                "$who: ${m.text.take(MAX_CHARS)}"
            }
            when (val r = embedder.embed(texts, EmbedPurpose.DOCUMENT)) {
                is EmbedResult.Vectors -> {
                    val now = clock()
                    dao.upsert(batch.zip(r.vectors) { m, v -> MessageEmbeddingEntity(m.id, m.workspaceId, m.conversationId, r.modelId, v.size, Vectors.pack(v), now) })
                    done += batch.size
                }
                EmbedResult.NoModel -> return Stats(done, false)
                is EmbedResult.Failed -> {
                    ZuriLog.w("EMBED", "batch_failed", "detail" to r.message.take(200))
                    return Stats(done, stoppedEarly = true, failure = r.message)
                }
            }
        }
        return Stats(done, stoppedEarly = done >= MAX_PER_RUN)
    }

    companion object {
        const val BATCH = 16
        const val MAX_PER_RUN = 2_000
        const val MAX_CHARS = 600
        const val WINDOW_MILLIS = 180L * 24 * 60 * 60 * 1000
    }
}

