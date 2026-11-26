package app.zuri.android.engine.ingest

import android.app.Notification
import android.content.Context
import android.os.UserHandle
import android.service.notification.StatusBarNotification
import androidx.core.app.NotificationCompat
import androidx.core.app.Person
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import app.zuri.android.core.common.Clock
import app.zuri.android.data.local.db.WorkspaceEntity
import app.zuri.android.data.local.db.ZuriDatabase
import app.zuri.android.domain.capture.SourceKind
import app.zuri.android.domain.capture.SourceSetting
import app.zuri.android.domain.capture.SourceSettingsRepository
import app.zuri.android.engine.ingest.pipeline.IngestPipeline
import app.zuri.android.engine.ingest.snapshot.SnapshotExtractor
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.After
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** The capture gate and the platform extraction, end to end into the database. */
@RunWith(RobolectricTestRunner::class)
class CapturePipelineTest {
    private val context = ApplicationProvider.getApplicationContext<Context>()
    private val db = Room.inMemoryDatabaseBuilder(context, ZuriDatabase::class.java).build()
    private val clock = Clock { 1_764_070_000_000L }

    private class FakeSettings(enabled: Set<SourceKind>, paused: Boolean = false) : SourceSettingsRepository {
        override val settings = MutableStateFlow(SourceKind.entries.map { SourceSetting(it, enabled = it in enabled) })
        override val paused = MutableStateFlow(paused)
        override suspend fun setEnabled(kind: SourceKind, enabled: Boolean) {
            settings.value = settings.value.map { if (it.kind == kind) it.copy(enabled = enabled) else it }
        }
        override suspend fun setStoreOnly(kind: SourceKind, storeOnly: Boolean) = Unit
        override suspend fun setRetention(kind: SourceKind, days: Int?) = Unit
        override suspend fun setPaused(paused: Boolean) { this.paused.value = paused }
    }

    @After fun close() = db.close()

    private fun chat(pkg: String, text: String, at: Long): StatusBarNotification {
        val me = Person.Builder().setName("You").build()
        val chanda = Person.Builder().setName("Chanda").setKey("c1").build()
        val n: Notification = NotificationCompat.Builder(context, "chats")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("Chanda").setContentText(text)
            .setStyle(NotificationCompat.MessagingStyle(me).addMessage(text, at, chanda))
            .setShortcutId("260971000001@s.whatsapp.net")
            .build()
        @Suppress("DEPRECATION")
        return StatusBarNotification(pkg, pkg, 1, null, 0, 0, 0, n, UserHandle.getUserHandleForUid(0), at)
    }

    private fun pipeline(settings: SourceSettingsRepository) =
        IngestPipeline(dagger.Lazy { db }, settings, clock, Dispatchers.IO).also { it.start() }

    private suspend fun waitFor(condition: suspend () -> Boolean) = withTimeout(10_000) {
        while (!condition()) delay(20)
    }

    @Test fun onlyEnabledSourcesAreCapturedAndStored() = runBlocking {
        db.workspaceDao().insert(WorkspaceEntity("ws", "PERSONAL", "Personal", "TEAL", 0, 0))
        val p = pipeline(FakeSettings(setOf(SourceKind.WHATSAPP)))
        waitFor { p.gate.value != null }

        p.onPosted(chat("org.telegram.messenger", "Not for Zuri", 1_000_000))
        p.onPosted(chat("com.example.bank", "Not for Zuri either", 1_000_000))
        p.onPosted(chat("com.whatsapp", "Hello from WhatsApp", 1_000_000))

        waitFor { db.messageDao().count() == 1 }
        delay(200) // give any wrongly accepted capture time to land
        assertThat(db.captureRawDao().count()).isEqualTo(1)
        val row = db.conversationDao().observeRows(listOf("ws")).first().single()
        assertThat(row.lastText).isEqualTo("Hello from WhatsApp")
        assertThat(row.title).isEqualTo("Chanda")
    }

    @Test fun pausingStopsCapture() = runBlocking {
        db.workspaceDao().insert(WorkspaceEntity("ws", "PERSONAL", "Personal", "TEAL", 0, 0))
        val settings = FakeSettings(setOf(SourceKind.WHATSAPP), paused = true)
        val p = pipeline(settings)
        waitFor { p.gate.value != null }
        p.onPosted(chat("com.whatsapp", "While paused", 1_000_000))
        delay(300)
        assertThat(db.captureRawDao().count()).isEqualTo(0)
    }

    @Test fun extractorReadsMessagingStyleIncludingOwnReplies() {
        val me = Person.Builder().setName("You").build()
        val mum = Person.Builder().setName("Mum").setUri("tel:+260971000009").build()
        val n = NotificationCompat.Builder(context, "chats")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setStyle(
                NotificationCompat.MessagingStyle(me).setConversationTitle("Family").setGroupConversation(true)
                    .addMessage("Lunch at 1", 10_000, mum)
                    .addMessage("On my way", 20_000, null as Person?),
            )
            .setGroup("g").setGroupSummary(false)
            .build()
        val s = SnapshotExtractor.extract("com.whatsapp", "k", 30_000, n)
        assertThat(s.conversationTitle).isEqualTo("Family")
        assertThat(s.isGroupConversation).isTrue()
        assertThat(s.messages.map { it.text }).containsExactly("Lunch at 1", "On my way").inOrder()
        assertThat(s.messages[0].senderUri).isEqualTo("tel:+260971000009")
        assertThat(s.messages[0].fromSelf).isFalse()
        assertThat(s.messages[1].fromSelf).isTrue()
        assertThat(s.isGroupSummary).isFalse()
    }
}
