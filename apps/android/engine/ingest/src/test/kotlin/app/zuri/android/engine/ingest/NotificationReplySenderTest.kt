package app.zuri.android.engine.ingest

import android.app.PendingIntent
import android.app.RemoteInput
import android.content.Context
import android.content.Intent
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import app.zuri.android.core.common.Clock
import app.zuri.android.data.local.db.CaptureRawEntity
import app.zuri.android.data.local.db.WorkspaceEntity
import app.zuri.android.data.local.db.ZuriDatabase
import app.zuri.android.domain.inbox.ConversationId
import app.zuri.android.domain.inbox.ReplyResult
import app.zuri.android.engine.ingest.pipeline.IngestProcessor
import app.zuri.android.engine.ingest.reply.LiveReply
import app.zuri.android.engine.ingest.reply.NotificationReplySender
import app.zuri.android.engine.ingest.reply.ReplyActions
import app.zuri.android.engine.ingest.snapshot.NotificationSnapshot
import app.zuri.android.engine.ingest.snapshot.SnapshotMessage
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Replying from Zuri: sent only through a live reply action, stored once, both sides kept. */
@RunWith(RobolectricTestRunner::class)
class NotificationReplySenderTest {
    private val context = ApplicationProvider.getApplicationContext<Context>()
    private val db = Room.inMemoryDatabaseBuilder(context, ZuriDatabase::class.java).allowMainThreadQueries().build()
    private var now = 1_764_070_000_000L
    private val clock = Clock { now }
    private val processor = IngestProcessor(db, clock)
    private val actions = ReplyActions()
    private val sent = mutableListOf<String>()
    private var cancelled = false
    private val sender = NotificationReplySender(context, db, actions, clock) { r, intent ->
        if (cancelled) throw PendingIntent.CanceledException()
        sent += RemoteInput.getResultsFromIntent(intent)!!.getCharSequence(r.inputs.first().resultKey).toString()
    }
    private var conversation = ConversationId("")

    @Before fun seed() = runBlocking {
        db.workspaceDao().insert(WorkspaceEntity("ws-personal", "PERSONAL", "Personal", "TEAL", now, now))
        capture(listOf(SnapshotMessage("Can you send the quote?", now - 60_000, "Chanda", "Chanda")))
        conversation = ConversationId(db.conversationDao().observeRows(listOf("ws-personal")).first().single().id)
    }

    @After fun close() = db.close()

    private suspend fun capture(msgs: List<SnapshotMessage>) {
        val s = NotificationSnapshot("com.whatsapp", "key-chanda", now, title = "Chanda", messages = msgs)
        db.captureRawDao().insert(CaptureRawEntity("raw-$now-${msgs.size}", s.packageName, s.key, s.postTime, now, IngestProcessor.json.encodeToString(NotificationSnapshot.serializer(), s), 2, "PENDING"))
        processor.processPending()
    }

    private fun live() = actions.put(
        "key-chanda",
        LiveReply("com.whatsapp", PendingIntent.getBroadcast(context, 0, Intent("reply"), PendingIntent.FLAG_MUTABLE), arrayOf(RemoteInput.Builder("reply_text").build()), now),
    )

    private suspend fun stored() = db.messageDao().observeFor(conversation.value).first()

    @Test fun withoutALiveNotificationNothingIsSent() = runTest {
        assertThat(sender.observeCanReply(conversation).first()).isFalse()
        assertThat(sender.reply(conversation, "On it")).isEqualTo(ReplyResult.NotAvailable)
        assertThat(sent).isEmpty()
        assertThat(stored()).hasSize(1)
    }

    @Test fun sendsThroughTheLiveActionAndStoresTheOwnersMessage() = runTest {
        live()
        assertThat(sender.observeCanReply(conversation).first()).isTrue()
        assertThat(sender.reply(conversation, "  Sure, I'll send it tonight ")).isEqualTo(ReplyResult.Sent)
        assertThat(sent).containsExactly("Sure, I'll send it tonight")
        val mine = stored().last()
        assertThat(mine.direction).isEqualTo("OUTGOING")
        assertThat(mine.text).isEqualTo("Sure, I'll send it tonight")
        assertThat(mine.perceivedAt).isNull() // understanding will read it
    }

    @Test fun theAppsEchoOfTheReplyIsNotStoredTwice() = runTest {
        live()
        sender.reply(conversation, "Sure, I'll send it tonight")
        // WhatsApp re-posts the chat with the reply in it, stamped a few seconds later.
        now += 5_000
        capture(listOf(
            SnapshotMessage("Can you send the quote?", now - 65_000, "Chanda", "Chanda"),
            SnapshotMessage("Sure, I'll send it tonight", now - 3_000, null, null, fromSelf = true),
        ))
        assertThat(stored().map { it.text }).containsExactly("Can you send the quote?", "Sure, I'll send it tonight").inOrder()
    }

    @Test fun aClearedNotificationIsReportedAndForgotten() = runTest {
        live()
        cancelled = true
        assertThat(sender.reply(conversation, "Hello")).isEqualTo(ReplyResult.NotAvailable)
        assertThat(actions.byKey.value).isEmpty()
        assertThat(stored()).hasSize(1)
    }
}
