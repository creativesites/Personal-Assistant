package app.zuri.android.engine.perception

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import app.zuri.android.core.common.Clock
import app.zuri.android.data.local.db.ConversationEntity
import app.zuri.android.data.local.db.MessageEntity
import app.zuri.android.data.local.db.WorkspaceEntity
import app.zuri.android.data.local.db.ZuriDatabase
import app.zuri.android.data.local.memory.RoomMemoryRepository
import app.zuri.android.domain.ai.AiTier
import app.zuri.android.domain.ai.GenerationResult
import app.zuri.android.domain.memory.MemoryFilter
import app.zuri.android.domain.memory.MemoryKind
import app.zuri.android.domain.memory.MemoryOrigin
import app.zuri.android.domain.workspace.WorkspaceId
import app.zuri.android.engine.perception.pipeline.PerceptionRunner
import com.google.common.truth.Truth.assertThat
import java.time.ZoneId
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class PerceptionRunnerTest {
    private val db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext<Context>(), ZuriDatabase::class.java)
        .allowMainThreadQueries().build()
    private val now = 1_764_000_000_000L
    private val clock = Clock { now }
    private val model = FakeModel()
    private val runner = PerceptionRunner(db, model, clock) { ZoneId.of("Africa/Lusaka") }
    private val memory = RoomMemoryRepository(db, clock)
    private val ws = WorkspaceId("ws")

    @Before fun seed() = runBlocking {
        db.workspaceDao().insert(WorkspaceEntity("ws", "PERSONAL", "Personal", "TEAL", 0, 0))
        db.conversationDao().insert(ConversationEntity("c1", "ws", "WHATSAPP", "com.whatsapp", "x@lid", "Chanda", false, true, now, 0, 0, 0))
        db.conversationDao().insert(ConversationEntity("g1", "ws", "WHATSAPP", "com.whatsapp", "y@g.us", "Family", true, false, now, 0, 0, 0))
        msg("m1", "c1", "INCOMING", "Can you send me the quotation by Friday 10am?", now - 60_000)
        msg("m2", "c1", "OUTGOING", "Sure, I'll send it tomorrow morning.", now - 30_000)
        msg("g1m1", "g1", "INCOMING", "I'll bring the cake on Saturday", now - 10_000)
    }

    @After fun close() = db.close()

    private suspend fun msg(id: String, conv: String, dir: String, text: String?, at: Long) = db.messageDao().insert(
        MessageEntity(id, conv, "ws", dir, "k", if (dir == "INCOMING") "Chanda" else null, text, null, null, at, true, "fp-$id",
            sourcePackage = "com.whatsapp", notificationKey = "k", notificationPostedAt = at, capturedAt = at, adapterVersion = 2, createdAt = at, updatedAt = at),
    )

    private suspend fun items() = memory.observe(ws, MemoryFilter()).first()

    @Test fun storesOnlyGroundedModelItemsAndMarksMessagesRead() = runTest {
        model.reply = {
            GenerationResult.Success(
                """{"items":[
                  {"kind":"request_to_me","message":1,"quote":"send me the quotation by Friday 10am","summary":"Send Chanda the quotation"},
                  {"kind":"my_promise","message":2,"quote":"I'll send it tomorrow morning","summary":"Send the quotation"},
                  {"kind":"their_promise","message":1,"quote":"I will pay K10,000","summary":"Invented"}
                ]}""", "gemma", 10,
            )
        }
        val stats = runner.run(Long.MAX_VALUE)
        assertThat(stats.messages).isEqualTo(2) // the group isn't analysed
        val stored = items()
        assertThat(stored.map { it.kind }).containsExactly(MemoryKind.REQUEST_TO_ME, MemoryKind.MY_PROMISE)
        assertThat(stored.all { it.origin == MemoryOrigin.MODEL }).isTrue()
        assertThat(stored.first { it.kind == MemoryKind.REQUEST_TO_ME }.dueAtMillis).isNotNull()
        assertThat(model.prompts.single()).contains("[2] Me")
        // Nothing waits any more, so a second run reads nothing and calls the model no more.
        assertThat(runner.run(Long.MAX_VALUE).messages).isEqualTo(0)
        assertThat(model.prompts).hasSize(1)
    }

    @Test fun engineFailureLeavesMessagesWaiting() = runTest {
        model.reply = { GenerationResult.Failed("stopped", engineStopped = true) }
        val stats = runner.run(Long.MAX_VALUE)
        assertThat(stats.failure).isNotNull()
        assertThat(items()).isEmpty()
        assertThat(db.perceptionDao().observeWaiting("ws", 0).first()).isEqualTo(2)
    }

    @Test fun withoutAModelTheRulesStillFindCommitments() = runTest {
        model.tier = AiTier.ESSENTIAL
        runner.run(Long.MAX_VALUE)
        val stored = items()
        assertThat(stored.map { it.kind }).containsExactly(MemoryKind.REQUEST_TO_ME, MemoryKind.MY_PROMISE)
        assertThat(stored.all { it.origin == MemoryOrigin.RULES }).isTrue()
    }

    @Test fun deletingTheMessageDeletesWhatWasUnderstoodFromIt() = runTest {
        model.tier = AiTier.ESSENTIAL
        runner.run(Long.MAX_VALUE)
        db.messageDao().delete("m2")
        assertThat(items().map { it.sourceMessageId.value }).containsExactly("m1")
    }

    @Test fun anEditedMessageIsReadAgainAndItsUnreviewedItemsReplaced() = runTest {
        model.tier = AiTier.ESSENTIAL
        runner.run(Long.MAX_VALUE)
        db.messageDao().revise("m2", "Sorry, I can't make it", null, null, "fp2", true, null, now)
        runner.run(Long.MAX_VALUE)
        assertThat(items().map { it.sourceMessageId.value }).containsExactly("m1")
    }

    @Test fun aSenderDeletedMessageNoLongerQuotedAnywhere() = runTest {
        model.tier = AiTier.ESSENTIAL
        runner.run(Long.MAX_VALUE)
        db.messageDao().revise("m1", null, "DELETED", null, "fp1", false, null, now)
        runner.run(Long.MAX_VALUE)
        assertThat(items().map { it.sourceMessageId.value }).containsExactly("m2")
    }

    @Test fun aHotPhoneStopsTheRunBeforeTheNextBatch() = runTest {
        val stats = runner.run(Long.MAX_VALUE, pause = { true })
        assertThat(stats.stoppedEarly).isTrue()
        assertThat(model.prompts).isEmpty()
        assertThat(db.perceptionDao().observeWaiting("ws", 0).first()).isEqualTo(2)
    }
}
