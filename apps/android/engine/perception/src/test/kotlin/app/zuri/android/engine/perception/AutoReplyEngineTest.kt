package app.zuri.android.engine.perception

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import app.zuri.android.core.common.Clock
import app.zuri.android.data.local.db.ConversationEntity
import app.zuri.android.data.local.db.MessageEntity
import app.zuri.android.data.local.db.WorkspaceEntity
import app.zuri.android.data.local.db.ZuriDatabase
import app.zuri.android.domain.inbox.AutoReplyOutcome
import app.zuri.android.domain.inbox.AutoReplyReason
import app.zuri.android.domain.inbox.AutoReplySettings
import app.zuri.android.domain.inbox.ConversationId
import app.zuri.android.domain.inbox.DraftResult
import app.zuri.android.domain.inbox.ReplyDrafter
import app.zuri.android.domain.inbox.ReplyResult
import app.zuri.android.domain.inbox.ReplySender
import app.zuri.android.engine.perception.autoreply.AutoReplyEngine
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class AutoReplyEngineTest {
    private val db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext<Context>(), ZuriDatabase::class.java)
        .allowMainThreadQueries().build()
    private var now = 1_764_000_000_000L
    private val clock = Clock { now }
    private var settings = AutoReplySettings()
    private var draft: DraftResult = DraftResult.Drafts(listOf("sure, will do"), byModel = true)
    private var sendResult: ReplyResult = ReplyResult.Sent
    private val sent = mutableListOf<Triple<String, String, Boolean>>()
    private val drafter = object : ReplyDrafter {
        override suspend fun draft(id: ConversationId) = draft
        override suspend fun draftForAuto(id: ConversationId) = draft
    }
    private val sender = object : ReplySender {
        override fun observeCanReply(id: ConversationId) = flowOf(true)
        override suspend fun reply(id: ConversationId, text: String, automatic: Boolean): ReplyResult {
            sent += Triple(id.value, text, automatic); return sendResult
        }
    }
    private val engine = AutoReplyEngine(db, drafter, sender, { settings }, clock)

    @Before fun seed() = runBlocking {
        db.workspaceDao().insert(WorkspaceEntity("ws", "PERSONAL", "Personal", "TEAL", 0, 0))
        db.conversationDao().insert(ConversationEntity("c1", "ws", "WHATSAPP", "com.whatsapp", "x@lid", "Chanda", false, true, now, 0, 0, 0, autoReply = true))
        db.conversationDao().insert(ConversationEntity("g1", "ws", "WHATSAPP", "com.whatsapp", "y@g.us", "Family", true, false, now, 0, 0, 0, autoReply = true))
        msg("m0", "c1", "OUTGOING", "hey", now - 120_000)
        msg("m1", "c1", "INCOMING", "Are you coming to church on Sunday?", now - 60_000)
    }

    @After fun close() = db.close()

    private suspend fun msg(id: String, conv: String, dir: String, text: String?, at: Long) = db.messageDao().insert(
        MessageEntity(id, conv, "ws", dir, "k", if (dir == "INCOMING") "Chanda" else null, text, null, null, at, true, "fp-$id",
            sourcePackage = "com.whatsapp", notificationKey = "k", notificationPostedAt = at, capturedAt = at, adapterVersion = 2, createdAt = at, updatedAt = at),
    )

    private suspend fun lastEvent() = db.autoReplyDao().observe("c1", 1).first().single()

    @Test fun sendsTheDraftAsAnAutoReplyAndLogsIt() = runTest {
        assertThat(engine.handle("c1", "m1")).isEqualTo(AutoReplyOutcome.SENT)
        assertThat(sent).containsExactly(Triple("c1", "sure, will do", true))
        assertThat(lastEvent().text).isEqualTo("sure, will do")
        // Each message is answered at most once.
        assertThat(engine.handle("c1", "m1")).isNull()
        assertThat(sent).hasSize(1)
    }

    @Test fun holdsMessagesAboutMoneyCodesOrSeriousNews() = runTest {
        msg("m2", "c1", "INCOMING", "Also can you send me K200 on airtel money", now - 30_000)
        assertThat(engine.handle("c1", "m2")).isEqualTo(AutoReplyOutcome.HELD)
        assertThat(lastEvent().reason).isEqualTo(AutoReplyReason.SENSITIVE.name)
        assertThat(sent).isEmpty()
    }

    @Test fun skipsWhenTheOwnerAlreadyRepliedOrANewerMessageArrived() = runTest {
        msg("m2", "c1", "INCOMING", "Hello?", now - 30_000)
        assertThat(engine.handle("c1", "m1")).isEqualTo(AutoReplyOutcome.SKIPPED)
        msg("m3", "c1", "OUTGOING", "yes I'll be there", now - 10_000)
        assertThat(engine.handle("c1", "m2")).isEqualTo(AutoReplyOutcome.SKIPPED)
        assertThat(lastEvent().reason).isEqualTo(AutoReplyReason.OWNER_REPLIED.name)
        assertThat(sent).isEmpty()
    }

    @Test fun neverForGroupsOrWhenPausedOrWithoutAModel() = runTest {
        msg("g1m1", "g1", "INCOMING", "Who's coming?", now - 5_000)
        assertThat(engine.handle("g1", "g1m1")).isEqualTo(AutoReplyOutcome.SKIPPED)
        settings = AutoReplySettings(paused = true)
        assertThat(engine.handle("c1", "m1")).isEqualTo(AutoReplyOutcome.SKIPPED)
        settings = AutoReplySettings()
        draft = DraftResult.NoModel
        msg("m2", "c1", "INCOMING", "Hello?", now - 1_000)
        assertThat(engine.handle("c1", "m2")).isEqualTo(AutoReplyOutcome.HELD)
        assertThat(sent).isEmpty()
    }

    @Test fun stopsAtTheHourlyLimitPerChat() = runTest {
        repeat(AutoReplyEngine.PER_CHAT_HOUR) { i ->
            msg("in$i", "c1", "INCOMING", "Message $i", now + i)
            assertThat(engine.handle("c1", "in$i")).isEqualTo(AutoReplyOutcome.SENT)
        }
        msg("over", "c1", "INCOMING", "One more", now + 100)
        assertThat(engine.handle("c1", "over")).isEqualTo(AutoReplyOutcome.HELD)
        assertThat(lastEvent().reason).isEqualTo(AutoReplyReason.LIMIT.name)
    }

    @Test fun aClearedNotificationHoldsTheDraftForTheOwner() = runTest {
        sendResult = ReplyResult.NotAvailable
        assertThat(engine.handle("c1", "m1")).isEqualTo(AutoReplyOutcome.HELD)
        assertThat(lastEvent().reason).isEqualTo(AutoReplyReason.NOTIFICATION_GONE.name)
        assertThat(lastEvent().text).isEqualTo("sure, will do")
    }
}
