package app.zuri.android.data.local

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import app.zuri.android.core.common.Clock
import app.zuri.android.data.local.db.ConversationEntity
import app.zuri.android.data.local.db.ConversationInsightEntity
import app.zuri.android.data.local.db.DraftFeedbackEntity
import app.zuri.android.data.local.db.MemoryEntity
import app.zuri.android.data.local.db.MessageEmbeddingEntity
import app.zuri.android.data.local.db.MessageEntity
import app.zuri.android.data.local.db.ZuriDatabase
import app.zuri.android.data.local.inbox.RoomInboxRepository
import app.zuri.android.data.local.memory.RoomMemoryRepository
import app.zuri.android.data.local.workspace.PreferencesActiveContext
import app.zuri.android.data.local.workspace.RoomContextLedger
import app.zuri.android.data.local.workspace.RoomWorkspaceRepository
import app.zuri.android.domain.capture.SourceKind
import app.zuri.android.domain.context.Purpose
import app.zuri.android.domain.inbox.ConversationId
import app.zuri.android.domain.memory.MemoryFilter
import app.zuri.android.domain.settings.AppPreferences
import app.zuri.android.domain.settings.AppPreferencesRepository
import app.zuri.android.domain.settings.ThemeMode
import app.zuri.android.domain.workspace.BrandProfile
import app.zuri.android.domain.workspace.WorkspaceAccent
import app.zuri.android.domain.workspace.WorkspaceId
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertThrows
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** M5: workspaces stay apart in every repository, and moving a chat moves everything derived from it. */
@RunWith(RobolectricTestRunner::class)
class WorkspaceIsolationTest {
    private val db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext<Context>(), ZuriDatabase::class.java)
        .allowMainThreadQueries().build()
    private var now = 1_764_000_000_000L
    private val clock = Clock { now++ }
    private val workspaces = RoomWorkspaceRepository(db, clock)
    private val inbox = RoomInboxRepository(db, clock)
    private val memory = RoomMemoryRepository(db, clock)

    @After fun close() = db.close()

    private suspend fun chat(id: String, ws: String, title: String) {
        db.conversationDao().insert(ConversationEntity(id, ws, "WHATSAPP", "com.whatsapp", "$id@lid", title, false, true, now, 0, 0, 0))
        db.messageDao().insert(
            MessageEntity("$id-m", id, ws, "INCOMING", "k", title, "Hello from $title", null, null, now, true, "fp-$id",
                sourcePackage = "com.whatsapp", notificationKey = "k", notificationPostedAt = now, capturedAt = now, adapterVersion = 2, createdAt = now, updatedAt = now),
        )
        db.memoryDao().insert(
            MemoryEntity("$id-i", ws, id, "$id-m", "REQUEST_TO_ME", "Reply to $title", title, "Hello", now, null, null, false, 0.8f, "RULES", null, "OPEN", "SUGGESTED", now, now),
        )
    }

    @Test fun eachWorkspaceSeesOnlyItsOwnChatsAndMemories() = runTest {
        val p = workspaces.ensurePersonal()
        val a = workspaces.createBusiness("Shop", WorkspaceAccent.INDIGO)
        chat("c1", p.id.value, "Mum"); chat("c2", a.id.value, "Client")
        assertThat(inbox.observeConversations(p.id).first().map { it.title }).containsExactly("Mum")
        assertThat(inbox.observeConversations(a.id).first().map { it.title }).containsExactly("Client")
        assertThat(inbox.observeConversations(setOf(p.id, a.id)).first().map { it.workspaceId }).containsExactly(p.id, a.id)
        assertThat(memory.observe(a.id, MemoryFilter()).first().map { it.personName }).containsExactly("Client")
    }

    @Test fun movingAChatMovesEverythingDerivedFromIt() = runTest {
        val p = workspaces.ensurePersonal()
        val a = workspaces.createBusiness("Shop", WorkspaceAccent.INDIGO)
        chat("c1", p.id.value, "Chanda")
        db.insightDao().upsert(ConversationInsightEntity("c1", p.id.value, "topic", "summary", now, now, "m"))
        db.insightDao().insertFeedback(DraftFeedbackEntity("f1", "c1", p.id.value, "ok", "DISMISSED", null, now))
        db.embeddingDao().upsert(listOf(MessageEmbeddingEntity("c1-m", p.id.value, "c1", "emb", 1, ByteArray(4), now)))
        assertThat(workspaces.movePreview(ConversationId("c1")).memories).isEqualTo(1)

        workspaces.moveConversation(ConversationId("c1"), a.id)

        assertThat(inbox.observeConversations(p.id).first()).isEmpty()
        assertThat(inbox.observeConversations(a.id).first().single().title).isEqualTo("Chanda")
        assertThat(memory.observe(p.id, MemoryFilter()).first()).isEmpty()
        assertThat(memory.observe(a.id, MemoryFilter()).first().single().text).isEqualTo("Reply to Chanda")
        assertThat(db.perceptionDao().messages(listOf(a.id.value), listOf("c1-m")).single().workspaceId).isEqualTo(a.id.value)
        assertThat(db.insightDao().byConversation("c1")!!.workspaceId).isEqualTo(a.id.value)
        assertThat(db.insightDao().draftActionCounts(listOf(a.id.value), 0).single().n).isEqualTo(1)
        assertThat(db.embeddingDao().vectors(listOf(p.id.value), "emb", 10)).isEmpty()
        assertThat(db.embeddingDao().vectors(listOf(a.id.value), "emb", 10)).hasSize(1)
    }

    @Test fun deletingABusinessDeletesItsChatsAndRulesOnly() = runTest {
        val p = workspaces.ensurePersonal()
        val a = workspaces.createBusiness("Shop", WorkspaceAccent.INDIGO)
        chat("c1", p.id.value, "Mum"); chat("c2", a.id.value, "Client")
        workspaces.setRule(SourceKind.WHATSAPP_BUSINESS, a.id)
        workspaces.deleteBusiness(a.id)
        assertThat(workspaces.observeAll().first().map { it.id }).containsExactly(p.id)
        assertThat(db.conversationDao().byId("c2")).isNull()
        assertThat(db.conversationDao().byId("c1")).isNotNull()
        assertThat(workspaces.observeRules().first()).isEmpty()
        assertThrows(IllegalArgumentException::class.java) { kotlinx.coroutines.runBlocking { workspaces.deleteBusiness(p.id) } }
    }

    @Test fun rulesOnlyPointAtBusinessWorkspaces() = runTest {
        val p = workspaces.ensurePersonal()
        val a = workspaces.createBusiness("Shop", WorkspaceAccent.INDIGO)
        workspaces.setRule(SourceKind.WHATSAPP_BUSINESS, a.id)
        workspaces.setRule(SourceKind.WHATSAPP, p.id) // Personal is the default: no rule needed
        assertThat(workspaces.observeRules().first()).containsExactly(SourceKind.WHATSAPP_BUSINESS, a.id)
        workspaces.setRule(SourceKind.WHATSAPP_BUSINESS, null)
        assertThat(workspaces.observeRules().first()).isEmpty()
    }

    @Test fun brandProfileIsStoredTrimmedAndRenameValidated() = runTest {
        val a = workspaces.createBusiness("Shop", WorkspaceAccent.INDIGO)
        workspaces.updateBrand(a.id, BrandProfile(displayName = "  Kalulu Ltd ", phone = "", bankDetails = "Acc 123"))
        val b = workspaces.get(a.id)!!.brand
        assertThat(b.displayName).isEqualTo("Kalulu Ltd")
        assertThat(b.phone).isNull()
        assertThat(b.bankDetails).isEqualTo("Acc 123")
        workspaces.rename(a.id, "  Kalulu  Irrigation ")
        assertThat(workspaces.get(a.id)!!.name).isEqualTo("Kalulu Irrigation")
    }

    private class Prefs : AppPreferencesRepository {
        val state = MutableStateFlow(AppPreferences(ThemeMode.SYSTEM, onboardingCompleted = true))
        override val preferences = state
        override suspend fun setThemeMode(mode: ThemeMode) = Unit
        override suspend fun setMotion(speed: app.zuri.android.domain.settings.MotionSpeed) {}
        override suspend fun setOnboardingCompleted(completed: Boolean) = Unit
        override suspend fun setActiveWorkspace(id: WorkspaceId) = state.update { it.copy(activeWorkspaceId = id, hybridActive = false) }
        override suspend fun setHybrid(businesses: Set<WorkspaceId>) = state.update { it.copy(hybridActive = true, hybridWorkspaceIds = businesses) }
    }

    @Test fun hybridIsPersonalPlusChosenBusinessesAndCountsAsWidened() = runTest {
        val p = workspaces.ensurePersonal()
        val a = workspaces.createBusiness("Shop", WorkspaceAccent.INDIGO)
        val b = workspaces.createBusiness("Farm", WorkspaceAccent.AMBER)
        val prefs = Prefs()
        val ctx = PreferencesActiveContext(prefs, workspaces)
        prefs.setActiveWorkspace(a.id)
        assertThat(ctx.active.first()!!.ids).containsExactly(a.id)
        assertThat(ctx.active.first()!!.scope(Purpose.ASK).widenedByUser).isFalse()
        prefs.setHybrid(setOf(b.id))
        val h = ctx.active.first()!!
        assertThat(h.ids).containsExactly(p.id, b.id)
        assertThat(h.label).isEqualTo("Personal + Farm")
        assertThat(h.scope(Purpose.ASK).widenedByUser).isTrue()
    }

    @Test fun ledgerKeepsNamesNotContent() = runTest {
        val ledger = RoomContextLedger(db, clock)
        ledger.record(Purpose.ASK, listOf("Shop"), listOf("Personal"))
        val row = ledger.observe().first().single()
        assertThat(row.from).containsExactly("Shop")
        assertThat(row.added).containsExactly("Personal")
    }
}
