package app.zuri.android.engine.perception

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import app.zuri.android.data.local.db.ConversationEntity
import app.zuri.android.data.local.db.MemoryEntity
import app.zuri.android.data.local.db.MessageEntity
import app.zuri.android.data.local.db.WorkspaceEntity
import app.zuri.android.data.local.db.ZuriDatabase
import app.zuri.android.domain.ai.GenerationResult
import app.zuri.android.domain.context.ScopeViolation
import app.zuri.android.domain.inbox.ConversationId
import app.zuri.android.engine.perception.drafts.LocalReplyDrafter
import app.zuri.android.engine.perception.insight.LocalConversationInsights
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertThrows
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** M5: a reply or summary for a business chat draws only on that business (§8.2). */
@RunWith(RobolectricTestRunner::class)
class DraftIsolationTest {
    private val db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext<Context>(), ZuriDatabase::class.java)
        .allowMainThreadQueries().build()
    private val now = 1_764_000_000_000L
    private val model = FakeModel()

    @Before fun seed() = runBlocking {
        db.workspaceDao().insert(WorkspaceEntity("P", "PERSONAL", "Personal", "TEAL", 0, 0))
        db.workspaceDao().insert(WorkspaceEntity("A", "BUSINESS", "Shop", "INDIGO", 0, 0))
        // The same person in both workspaces.
        db.conversationDao().insert(ConversationEntity("p1", "P", "WHATSAPP", "com.whatsapp", "x@lid", "Chanda", false, true, now, 0, 0, 0))
        db.conversationDao().insert(ConversationEntity("a1", "A", "WHATSAPP", "com.whatsapp.w4b", "x@lid", "Chanda", false, true, now, 0, 0, 0))
        msg("p-1", "p1", "P", "OUTGOING", "love you sis, see you at kiwimarker's birthday", now - 9_000)
        msg("p-2", "p1", "P", "INCOMING", "My diagnosis came back kiwimarker", now - 8_000)
        msg("a-0", "a1", "A", "OUTGOING", "thanks for your order mangomarker", now - 7_000)
        msg("a-1", "a1", "A", "INCOMING", "Is my order ready? mangomarker", now - 6_000)
        db.memoryDao().insert(
            MemoryEntity("ip", "P", "p1", "p-2", "FACT", "Chanda is unwell kiwimarker", "Chanda", "My diagnosis came back", now, null, null, false, 0.9f, "MODEL", null, "OPEN", "CONFIRMED", now, now),
        )
    }

    @After fun close() = db.close()

    private suspend fun msg(id: String, conv: String, ws: String, dir: String, text: String, at: Long) = db.messageDao().insert(
        MessageEntity(id, conv, ws, dir, "k", if (dir == "INCOMING") "Chanda" else null, text, null, null, at, true, "fp-$id",
            sourcePackage = "com.whatsapp", notificationKey = "k", notificationPostedAt = at, capturedAt = at, adapterVersion = 2, createdAt = at, updatedAt = at),
    )

    @Test fun businessDraftsNeverSeePersonalMessagesFactsOrStyleExamples() = runTest {
        model.reply = { GenerationResult.Success("""{"drafts":["yes, it's ready"]}""", "fake", 1) }
        LocalReplyDrafter(db, model, { now }).draft(ConversationId("a1"))
        LocalReplyDrafter(db, model, { now }).draftForAuto(ConversationId("a1"))
        model.prompts.forEach { p ->
            assertThat(p).contains("mangomarker")
            assertThat(p).doesNotContain("kiwimarker")
            assertThat(p).doesNotContain("diagnosis")
        }
    }

    @Test fun summariesStayInTheirWorkspace() = runTest {
        model.reply = { GenerationResult.Success("""{"topic":"Order","summary":"Chanda asked if the order is ready."}""", "fake", 1) }
        LocalConversationInsights(db, model, { now }).summarize(ConversationId("a1"))
        assertThat(model.prompts.single()).doesNotContain("kiwimarker")
    }

    @Test fun aRowFromAnotherWorkspaceInTheChatIsRefusedNotUsed() = runTest {
        // A corrupted row: a Personal message attached to the business chat.
        msg("bad", "a1", "P", "INCOMING", "kiwimarker secret", now - 1_000)
        assertThrows(ScopeViolation::class.java) { runBlocking { LocalReplyDrafter(db, model, { now }).draft(ConversationId("a1")) } }
        assertThat(model.prompts).isEmpty()
    }
}
