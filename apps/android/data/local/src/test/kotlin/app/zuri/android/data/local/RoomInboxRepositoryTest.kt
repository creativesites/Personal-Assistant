package app.zuri.android.data.local

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import app.zuri.android.core.common.Clock
import app.zuri.android.data.local.db.CaptureRawEntity
import app.zuri.android.data.local.db.ConversationEntity
import app.zuri.android.data.local.db.MessageEntity
import app.zuri.android.data.local.db.WorkspaceEntity
import app.zuri.android.data.local.db.ZuriDatabase
import app.zuri.android.data.local.inbox.RoomInboxRepository
import app.zuri.android.domain.capture.SourceKind
import app.zuri.android.domain.inbox.ConversationId
import app.zuri.android.domain.inbox.MessageId
import app.zuri.android.domain.workspace.WorkspaceId
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Deletion and exclusion must remove the content everywhere it lives, including raw snapshots. */
@RunWith(RobolectricTestRunner::class)
class RoomInboxRepositoryTest {
    private val db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext<Context>(), ZuriDatabase::class.java)
        .allowMainThreadQueries().build()
    private var now = 1_000L
    private val repo = RoomInboxRepository(db, Clock { now++ })
    private val ws = WorkspaceId("ws")

    @Before fun seed() = runBlocking {
        db.workspaceDao().insert(WorkspaceEntity("ws", "PERSONAL", "Personal", "TEAL", 0, 0))
        conversation("c1", "d:chanda", "Chanda")
        conversation("c2", "g:family", "Family", group = true)
        message("m1", "c1", "Hi", 10)
        message("m2", "c1", "Are you free?", 20)
        message("m3", "c2", "Lunch", 30)
        raw("r-done", "DONE")
        raw("r-pending", "PENDING")
    }

    @After fun close() = db.close()

    private suspend fun conversation(id: String, key: String, title: String, group: Boolean = false) =
        db.conversationDao().insert(ConversationEntity(id, "ws", "WHATSAPP", "com.whatsapp", key, title, group, !group, 0, 1, 0, 0))

    private suspend fun message(id: String, conv: String, text: String, at: Long) = db.messageDao().insert(
        MessageEntity(id, conv, "ws", "INCOMING", "n:x", "X", text, null, null, at, true, "fp-$id", sourcePackage = "com.whatsapp",
            notificationKey = "k", notificationPostedAt = at, capturedAt = at, adapterVersion = 1, createdAt = at, updatedAt = at),
    ).also { db.conversationDao().touch(conv, if (conv == "c1") "Chanda" else "Family", at, 1, at) }

    private suspend fun raw(id: String, state: String) =
        db.captureRawDao().insert(CaptureRawEntity(id, "com.whatsapp", "k", 0, 0, "{}", 1, state))

    @Test fun listShowsLatestMessageNewestConversationFirst() = runTest {
        val rows = repo.observeConversations(ws).first()
        assertThat(rows.map { it.title }).containsExactly("Family", "Chanda").inOrder()
        assertThat(rows[1].lastText).isEqualTo("Are you free?")
        assertThat(rows[1].messageCount).isEqualTo(2)
    }

    @Test fun deletingAMessageAlsoDropsProcessedSnapshotsButKeepsPendingOnes() = runTest {
        repo.deleteMessage(MessageId("m2"))
        assertThat(repo.observeConversation(ConversationId("c1")).first()!!.messages.map { it.text }).containsExactly("Hi")
        assertThat(db.captureRawDao().pending(10).map { it.id }).containsExactly("r-pending")
        assertThat(db.captureRawDao().count()).isEqualTo(1)
    }

    @Test fun deletingTheLastMessageRemovesTheConversation() = runTest {
        repo.deleteMessage(MessageId("m3"))
        assertThat(repo.observeConversation(ConversationId("c2")).first()).isNull()
    }

    @Test fun excludingStopsFutureCaptureAndDeletesStoredMessages() = runTest {
        repo.excludeConversation(ConversationId("c1"))
        assertThat(db.captureExclusionDao().isExcluded("com.whatsapp", "d:chanda")).isTrue()
        assertThat(db.messageDao().count()).isEqualTo(1)
        assertThat(repo.observeConversations(ws).first().map { it.title }).containsExactly("Family")
    }

    @Test fun deletingASourceRemovesEverythingFromIt() = runTest {
        assertThat(repo.messageCount(SourceKind.WHATSAPP)).isEqualTo(3)
        assertThat(repo.deleteAllFrom(SourceKind.WHATSAPP)).isEqualTo(3)
        assertThat(db.captureRawDao().count()).isEqualTo(0)
        assertThat(repo.observeConversations(ws).first()).isEmpty()
    }
}
