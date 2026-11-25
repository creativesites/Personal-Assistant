package app.zuri.android.engine.ingest

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import app.zuri.android.core.common.Clock
import app.zuri.android.data.local.db.CaptureExclusionEntity
import app.zuri.android.data.local.db.CaptureRawEntity
import app.zuri.android.data.local.db.SourceAppEntity
import app.zuri.android.data.local.db.WorkspaceEntity
import app.zuri.android.data.local.db.ZuriDatabase
import app.zuri.android.domain.inbox.PlaceholderKind
import app.zuri.android.engine.ingest.pipeline.IngestProcessor
import app.zuri.android.engine.ingest.pipeline.RetentionSweeper
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

/** The ingest rules against a real Room database: dedup, edits, deletions, exclusions, retention. */
@RunWith(RobolectricTestRunner::class)
class IngestProcessorTest {
    private val db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext<Context>(), ZuriDatabase::class.java)
        .allowMainThreadQueries().build()
    private var now = 1_764_070_000_000L
    private val clock = Clock { now }
    private val processor = IngestProcessor(db, clock)
    private var seq = 0

    @Before fun personal() = runBlocking {
        db.workspaceDao().insert(WorkspaceEntity("ws-personal", "PERSONAL", "Personal", "TEAL", now, now))
    }

    @After fun close() = db.close()

    private suspend fun capture(s: NotificationSnapshot, capturedAt: Long = now) {
        db.captureRawDao().insert(
            CaptureRawEntity(
                id = "raw-${seq++}", packageName = s.packageName, notificationKey = s.key, postedAt = s.postTime, capturedAt = capturedAt,
                payload = IngestProcessor.json.encodeToString(NotificationSnapshot.serializer(), s), adapterVersion = 1, state = "PENDING",
            ),
        )
    }

    private fun wa(vararg msgs: SnapshotMessage, title: String = "Chanda", group: Boolean = false, pkg: String = "com.whatsapp") =
        NotificationSnapshot(pkg, "key-$title", now, title = title, conversationTitle = if (group) title else null, isGroupConversation = group, messages = msgs.toList())

    private fun msg(text: String, t: Long, name: String? = "Chanda", self: Boolean = false) = SnapshotMessage(text, t, name, senderKey = name, fromSelf = self)

    private suspend fun messages() = db.conversationDao().observeRows("ws-personal").first().flatMap { c -> db.messageDao().observeFor(c.id).first() }

    @Test fun cumulativeRepostsAreStoredExactlyOnce() = runTest {
        capture(wa(msg("Hi", 1_000_000)))
        capture(wa(msg("Hi", 1_000_000), msg("Are you free?", 1_060_000)))
        capture(wa(msg("Hi", 1_000_000), msg("Are you free?", 1_060_000), msg("Yes", 1_120_000, self = true)))
        val stats = processor.processPending()
        assertThat(stats.inserted).isEqualTo(3)
        assertThat(stats.duplicates).isEqualTo(3)
        assertThat(messages().map { it.text }).containsExactly("Hi", "Are you free?", "Yes").inOrder()
        val row = db.conversationDao().observeRows("ws-personal").first().single()
        assertThat(row.unreadCount).isEqualTo(2) // own reply isn't unread
        assertThat(row.lastDirection).isEqualTo("OUTGOING")
    }

    @Test fun editsUpdateTheMessageAndKeepHistory() = runTest {
        capture(wa(msg("See you at 10", 2_000_000)))
        capture(wa(msg("See you at 11", 2_000_000)))
        val stats = processor.processPending()
        assertThat(stats.edited).isEqualTo(1)
        val m = messages().single()
        assertThat(m.text).isEqualTo("See you at 11")
        assertThat(m.edited).isTrue()
        assertThat(m.editHistory).isEqualTo("[\"See you at 10\"]")
    }

    @Test fun senderDeletionMarksTheMessageDeleted() = runTest {
        capture(wa(msg("Secret plan", 3_000_000)))
        capture(wa(msg("This message was deleted", 3_000_000)))
        processor.processPending()
        val m = messages().single()
        assertThat(m.placeholderKind).isEqualTo(PlaceholderKind.DELETED.name)
        assertThat(m.text).isNull()
        assertThat(m.editHistory).isNull() // no copy of withdrawn text is kept
    }

    @Test fun approximateTimesDedupWithinTheMinuteBucket() = runTest {
        val a = NotificationSnapshot("org.thoughtcrime.securesms", "k", 4_000_000, title = "Bwalya", text = "Call me")
        capture(a)
        capture(a.copy(postTime = 4_030_000))
        capture(a.copy(postTime = 4_000_000 + 10 * 60_000)) // ten minutes later: a new message
        val stats = processor.processPending()
        assertThat(stats.inserted).isEqualTo(2)
        assertThat(stats.duplicates).isEqualTo(1)
    }

    @Test fun excludedConversationsLeaveNoTrace() = runTest {
        db.captureExclusionDao().insert(CaptureExclusionEntity("x", "com.whatsapp", "d:chanda", now))
        capture(wa(msg("Hi", 5_000_000)))
        val stats = processor.processPending()
        assertThat(stats.excluded).isEqualTo(1)
        assertThat(messages()).isEmpty()
        assertThat(db.captureRawDao().count()).isEqualTo(0)
    }

    @Test fun groupsAreStoredButNotMarkedForAnalysisAndEverythingGoesToPersonal() = runTest {
        capture(wa(msg("Lunch at 1", 6_000_000, name = "Mum"), title = "Family", group = true))
        capture(wa(msg("Hello", 6_000_000)))
        processor.processPending()
        val family = db.conversationDao().find("ws-personal", "com.whatsapp", "g:family")!!
        val chanda = db.conversationDao().find("ws-personal", "com.whatsapp", "d:chanda")!!
        assertThat(family.isGroup).isTrue()
        assertThat(family.analyse).isFalse()
        assertThat(chanda.analyse).isTrue()
    }

    @Test fun storeOnlySourcesAreNeverMarkedForAnalysis() = runTest {
        db.sourceAppDao().upsert(SourceAppEntity("WHATSAPP", enabled = true, storeOnly = true, retentionDays = null, updatedAt = now))
        capture(wa(msg("Hello", 7_000_000)))
        processor.processPending()
        assertThat(db.conversationDao().find("ws-personal", "com.whatsapp", "d:chanda")!!.analyse).isFalse()
    }

    @Test fun summariesAreSkippedNotStored() = runTest {
        capture(NotificationSnapshot("com.whatsapp", "s", now, isGroupSummary = true, title = "WhatsApp", text = "5 messages from 2 chats"))
        val stats = processor.processPending()
        assertThat(stats.skipped).isEqualTo(1)
        assertThat(messages()).isEmpty()
    }

    @Test fun retentionRemovesOldMessagesAndProcessedRawButKeepsPending() = runTest {
        db.sourceAppDao().upsert(SourceAppEntity("WHATSAPP", enabled = true, storeOnly = false, retentionDays = 30, updatedAt = now))
        val day = RetentionSweeper.DAY_MS
        capture(wa(msg("Old", now - 40 * day)), capturedAt = now - 40 * day)
        capture(wa(msg("New", now - day)), capturedAt = now - day)
        processor.processPending()
        capture(wa(msg("Still pending", now)), capturedAt = now - 10 * day) // e.g. left by a killed process
        val result = RetentionSweeper(db, clock).sweep()
        assertThat(result.messagesDeleted).isEqualTo(1)
        assertThat(result.rawDeleted).isEqualTo(1)
        assertThat(messages().map { it.text }).containsExactly("New")
        assertThat(db.captureRawDao().pending(10)).hasSize(1)
    }

    @Test fun nothingIsProcessedBeforeOnboardingCreatesPersonal() = runTest {
        db.clearAllTables()
        capture(wa(msg("Hi", 8_000_000)))
        assertThat(processor.processPending().snapshots).isEqualTo(0)
        assertThat(db.captureRawDao().pending(10)).hasSize(1)
    }
}
