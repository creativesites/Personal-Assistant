package app.zuri.android.engine.retrieval

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import app.zuri.android.data.local.db.ConversationEntity
import app.zuri.android.data.local.db.MemoryEntity
import app.zuri.android.data.local.db.MessageEntity
import app.zuri.android.data.local.db.WorkspaceEntity
import app.zuri.android.data.local.db.ZuriDatabase
import app.zuri.android.domain.ai.AiTier
import app.zuri.android.domain.ai.GenerationRequest
import app.zuri.android.domain.ai.GenerationResult
import app.zuri.android.domain.ai.LocalLanguageModel
import app.zuri.android.domain.memory.AskAnswer
import app.zuri.android.domain.workspace.WorkspaceId
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** M4 acceptance: answers cite real sources or say they don't know; retrieval stays in scope. */
@RunWith(RobolectricTestRunner::class)
class LocalAskZuriTest {
    private class Model(var tier: AiTier, var json: String = "") : LocalLanguageModel {
        val prompts = mutableListOf<String>()
        override suspend fun generate(request: GenerationRequest) = GenerationResult.NoModelInstalled
        override suspend fun generateJson(request: GenerationRequest, schema: String): GenerationResult {
            prompts += request.prompt
            return GenerationResult.Success(json, "fake", 1)
        }
        override fun tier() = tier
        override suspend fun release() = Unit
    }

    private val db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext<Context>(), ZuriDatabase::class.java)
        .allowMainThreadQueries().build()
    private val ws = WorkspaceId("ws")
    private val t = 1_764_000_000_000L

    @Before fun seed() = runBlocking {
        db.workspaceDao().insert(WorkspaceEntity("ws", "PERSONAL", "Personal", "TEAL", 0, 0))
        conv("c1", "Chanda"); conv("c2", "Peter")
        msg("m1", "c1", "INCOMING", "Can you send me the quotation for 40 drip lines by Friday?", t)
        msg("m2", "c1", "OUTGOING", "Sure, I'll send it tomorrow", t + 1)
        msg("m3", "c2", "INCOMING", "The borehole pump quotation is ready", t + 2)
        db.memoryDao().insert(
            MemoryEntity("i1", "ws", "c1", "m2", "MY_PROMISE", "Send Chanda the quotation", "Chanda", "I'll send it tomorrow", t + 1,
                null, null, false, 0.8f, "MODEL", "fake", "OPEN", "SUGGESTED", t, t),
        )
    }

    @After fun close() = db.close()

    private suspend fun conv(id: String, title: String) =
        db.conversationDao().insert(ConversationEntity(id, "ws", "WHATSAPP", "com.whatsapp", id, title, false, true, t, 0, 0, 0))

    private suspend fun msg(id: String, c: String, dir: String, text: String, at: Long) = db.messageDao().insert(
        MessageEntity(id, c, "ws", dir, "k", null, text, null, null, at, true, "fp-$id", sourcePackage = "com.whatsapp",
            notificationKey = "k", notificationPostedAt = at, capturedAt = at, adapterVersion = 2, createdAt = at, updatedAt = at),
    )

    @Test fun modelAnswerKeepsOnlyRealCitations() = runTest {
        val model = Model(AiTier.STANDARD, """{"known":true,"answer":"You promised to send Chanda the quotation tomorrow [1] [9].","sources":[1,9]}""")
        val a = LocalAskZuri(db, model).ask(ws, "What did I promise Chanda?") as AskAnswer.Answered
        assertThat(a.text).doesNotContain("[9]")
        assertThat(a.sources.map { it.messageId.value }).containsExactly("m2")
        assertThat(a.byModel).isTrue()
        // Scoped to Chanda: Peter's message was never offered to the model.
        assertThat(model.prompts.single()).doesNotContain("borehole")
    }

    @Test fun answerWithoutAValidCitationIsNotFound() = runTest {
        val model = Model(AiTier.STANDARD, """{"known":true,"answer":"Probably on Monday.","sources":[42]}""")
        assertThat(LocalAskZuri(db, model).ask(ws, "What did I promise Chanda?")).isInstanceOf(AskAnswer.NotFound::class.java)
    }

    @Test fun modelSayingUnknownIsNotFound() = runTest {
        val model = Model(AiTier.STANDARD, """{"known":false,"answer":"","sources":[]}""")
        assertThat(LocalAskZuri(db, model).ask(ws, "What is Chanda's favourite colour?")).isInstanceOf(AskAnswer.NotFound::class.java)
    }

    @Test fun essentialTierListsPromisesWithSources() = runTest {
        val a = LocalAskZuri(db, Model(AiTier.ESSENTIAL)).ask(ws, "What did I promise Chanda?") as AskAnswer.Answered
        assertThat(a.text).contains("Send Chanda the quotation")
        assertThat(a.sources.single().messageId.value).isEqualTo("m2")
        assertThat(a.byModel).isFalse()
    }

    @Test fun fullTextSearchFindsMessagesAcrossChats() = runTest {
        val a = LocalAskZuri(db, Model(AiTier.ESSENTIAL)).ask(ws, "Where is the borehole quotation?") as AskAnswer.NotFound
        assertThat(a.closest.map { it.messageId.value }).contains("m3")
    }

    @Test fun nothingStoredIsNotFoundWithNoSources() = runTest {
        val a = LocalAskZuri(db, Model(AiTier.ESSENTIAL)).ask(ws, "xylophone lessons") as AskAnswer.NotFound
        assertThat(a.closest).isEmpty()
    }
}
