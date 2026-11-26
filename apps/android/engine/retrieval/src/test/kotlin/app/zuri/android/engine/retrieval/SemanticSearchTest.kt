package app.zuri.android.engine.retrieval

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import app.zuri.android.data.local.db.ConversationEntity
import app.zuri.android.data.local.db.MessageEmbeddingEntity
import app.zuri.android.data.local.db.MessageEntity
import app.zuri.android.data.local.db.Vectors
import app.zuri.android.data.local.db.WorkspaceEntity
import app.zuri.android.data.local.db.ZuriDatabase
import app.zuri.android.domain.ai.AiTier
import app.zuri.android.domain.ai.EmbedPurpose
import app.zuri.android.domain.ai.EmbedResult
import app.zuri.android.domain.ai.GenerationRequest
import app.zuri.android.domain.ai.GenerationResult
import app.zuri.android.domain.ai.LocalEmbedder
import app.zuri.android.domain.ai.LocalLanguageModel
import app.zuri.android.domain.memory.AskAnswer
import app.zuri.android.domain.workspace.WorkspaceId
import com.google.common.truth.Truth.assertThat
import kotlin.math.sqrt
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Meaning-based retrieval finds messages with no shared words, and never crosses workspaces. */
@RunWith(RobolectricTestRunner::class)
class SemanticSearchTest {
    /** A toy embedder: each concept is one dimension; synonyms share it. */
    class ConceptEmbedder(private val id: String? = "emb") : LocalEmbedder {
        val queries = mutableListOf<String>()
        private val concepts = listOf(setOf("party", "braai", "celebration"), setOf("money", "kwacha", "payment"), setOf("car", "vehicle"))
        fun vector(text: String): FloatArray {
            val words = text.lowercase().split(Regex("[^a-z]+"))
            val v = FloatArray(concepts.size + 1) { i -> if (i < concepts.size && words.any { it in concepts[i] }) 1f else 0f }
            if (v.all { it == 0f }) v[concepts.size] = 1f
            val n = sqrt(v.sumOf { (it * it).toDouble() }).toFloat()
            return FloatArray(v.size) { v[it] / n }
        }
        override fun modelId() = id
        override suspend fun embed(texts: List<String>, purpose: EmbedPurpose): EmbedResult {
            if (purpose == EmbedPurpose.QUERY) queries += texts
            return EmbedResult.Vectors(texts.map(::vector), "emb")
        }
    }

    private class NoModel : LocalLanguageModel {
        override suspend fun generate(request: GenerationRequest) = GenerationResult.NoModelInstalled
        override suspend fun generateJson(request: GenerationRequest, schema: String) = GenerationResult.NoModelInstalled
        override fun tier() = AiTier.ESSENTIAL
        override suspend fun release() = Unit
    }

    private val db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext<Context>(), ZuriDatabase::class.java)
        .allowMainThreadQueries().build()
    private val embedder = ConceptEmbedder()
    private val t = 1_764_000_000_000L

    @Before fun seed() = runBlocking {
        db.workspaceDao().insert(WorkspaceEntity("ws", "PERSONAL", "Personal", "TEAL", 0, 0))
        db.workspaceDao().insert(WorkspaceEntity("biz", "BUSINESS", "Shop", "INDIGO", 0, 0))
        db.conversationDao().insert(ConversationEntity("c1", "ws", "WHATSAPP", "com.whatsapp", "c1", "Chanda", false, true, t, 0, 0, 0))
        db.conversationDao().insert(ConversationEntity("b1", "biz", "WHATSAPP", "com.whatsapp", "b1", "Client", false, true, t, 0, 0, 0))
        msg("m1", "c1", "ws", "The braai is on Saturday at mine", t)
        msg("m2", "c1", "ws", "Traffic was terrible today", t + 1)
        msg("x1", "b1", "biz", "Company celebration next Friday", t + 2)
        for ((id, ws, conv, text) in listOf(Quad("m1", "ws", "c1", "The braai is on Saturday at mine"), Quad("m2", "ws", "c1", "Traffic was terrible today"), Quad("x1", "biz", "b1", "Company celebration next Friday"))) {
            db.embeddingDao().upsert(listOf(MessageEmbeddingEntity(id, ws, conv, "emb", 4, Vectors.pack(embedder.vector(text)), t + 10)))
        }
    }

    private data class Quad(val a: String, val b: String, val c: String, val d: String)

    @After fun close() = db.close()

    private suspend fun msg(id: String, conv: String, ws: String, text: String, at: Long) = db.messageDao().insert(
        MessageEntity(id, conv, ws, "INCOMING", "k", "Chanda", text, null, null, at, true, "fp-$id",
            sourcePackage = "com.whatsapp", notificationKey = "k", notificationPostedAt = at, capturedAt = at, adapterVersion = 2, createdAt = at, updatedAt = at),
    )

    @Test fun findsByMeaningWithNoSharedWordsAndStaysInItsWorkspace() = runTest {
        val ask = LocalAskZuri(db, NoModel(), embedder = embedder)
        val answer = ask.ask(WorkspaceId("ws"), "when is the party") as AskAnswer.NotFound
        assertThat(answer.closest.map { it.messageId.value }).contains("m1")
        assertThat(answer.closest.map { it.messageId.value }).doesNotContain("x1")
        assertThat(embedder.queries).containsExactly("when is the party")
    }

    @Test fun withoutAnEmbeddingModelOnlyKeywordsAreUsed() = runTest {
        val ask = LocalAskZuri(db, NoModel(), embedder = ConceptEmbedder(id = null))
        val answer = ask.ask(WorkspaceId("ws"), "when is the party") as AskAnswer.NotFound
        assertThat(answer.closest).isEmpty()
    }

    @Test fun vectorsRoundTripAndFusionPutsDoubleHitsFirst() {
        val v = floatArrayOf(0.6f, -0.8f, 0f)
        assertThat(Vectors.unpack(Vectors.pack(v)).toList()).isEqualTo(v.toList())
        assertThat(Vectors.cosine(v, v)).isWithin(1e-6f).of(1f)
    }
}
