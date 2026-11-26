package app.zuri.android.engine.perception

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import app.zuri.android.data.local.db.ConversationEntity
import app.zuri.android.data.local.db.MessageEntity
import app.zuri.android.data.local.db.WorkspaceEntity
import app.zuri.android.data.local.db.ZuriDatabase
import app.zuri.android.domain.ai.EmbedPurpose
import app.zuri.android.domain.ai.EmbedResult
import app.zuri.android.domain.ai.LocalEmbedder
import app.zuri.android.engine.perception.embed.SemanticIndexer
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class SemanticIndexerTest {
    private class Embedder(var id: String? = "emb", var fail: Boolean = false) : LocalEmbedder {
        val seen = mutableListOf<String>()
        override fun modelId() = id
        override suspend fun embed(texts: List<String>, purpose: EmbedPurpose): EmbedResult {
            if (fail) return EmbedResult.Failed("stopped", engineStopped = true)
            seen += texts
            return EmbedResult.Vectors(texts.map { floatArrayOf(1f, 0f) }, id!!)
        }
    }

    private val db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext<Context>(), ZuriDatabase::class.java)
        .allowMainThreadQueries().build()
    private val now = 1_764_000_000_000L
    private val embedder = Embedder()
    private var clock = now
    private val indexer = SemanticIndexer(db, embedder) { clock }

    @Before fun seed() = runBlocking {
        db.workspaceDao().insert(WorkspaceEntity("ws", "PERSONAL", "Personal", "TEAL", 0, 0))
        db.conversationDao().insert(ConversationEntity("c1", "ws", "WHATSAPP", "com.whatsapp", "x", "Chanda", false, true, now, 0, 0, 0))
        msg("m1", "See you at the braai", now - 1000, "INCOMING")
        msg("m2", "ok", now - 900, "OUTGOING")
        msg("m3", null, now - 800, "INCOMING")
    }

    @After fun close() = db.close()

    private suspend fun msg(id: String, text: String?, at: Long, dir: String) = db.messageDao().insert(
        MessageEntity(id, "c1", "ws", dir, "k", "Chanda", text, if (text == null) "PHOTO" else null, null, at, true, "fp-$id",
            sourcePackage = "com.whatsapp", notificationKey = "k", notificationPostedAt = at, capturedAt = at, adapterVersion = 2, createdAt = at, updatedAt = at),
    )

    @Test fun embedsTextMessagesOnceAndAgainWhenEdited() = runTest {
        assertThat(indexer.run(Long.MAX_VALUE).embedded).isEqualTo(1) // "ok" is too short, the photo has no text
        assertThat(embedder.seen).containsExactly("Chanda: See you at the braai")
        assertThat(indexer.run(Long.MAX_VALUE).embedded).isEqualTo(0)
        clock = now + 5_000
        db.messageDao().revise("m1", "See you at the braai at 6", null, null, "fp2", true, null, now + 5_000)
        clock = now + 6_000
        assertThat(indexer.run(Long.MAX_VALUE).embedded).isEqualTo(1)
    }

    @Test fun deletedMessagesTakeTheirVectorsAndNoModelMeansNoWork() = runTest {
        indexer.run(Long.MAX_VALUE)
        db.messageDao().delete("m1")
        assertThat(db.embeddingDao().count("emb")).isEqualTo(0)
        embedder.id = null
        assertThat(indexer.run(Long.MAX_VALUE).embedded).isEqualTo(0)
    }

    @Test fun anEngineStopEndsTheRunWithoutLosingAnything() = runTest {
        embedder.fail = true
        val s = indexer.run(Long.MAX_VALUE)
        assertThat(s.failure).isEqualTo("stopped")
        assertThat(db.embeddingDao().pendingCount("emb", 0)).isEqualTo(1)
    }
}
