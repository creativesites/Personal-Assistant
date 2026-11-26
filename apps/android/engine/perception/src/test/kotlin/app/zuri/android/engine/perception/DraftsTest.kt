package app.zuri.android.engine.perception

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import app.zuri.android.data.local.db.ConversationEntity
import app.zuri.android.data.local.db.MessageEntity
import app.zuri.android.data.local.db.WorkspaceEntity
import app.zuri.android.data.local.db.ZuriDatabase
import app.zuri.android.domain.ai.AiTier
import app.zuri.android.domain.ai.GenerationResult
import app.zuri.android.domain.inbox.ConversationId
import app.zuri.android.domain.inbox.DraftResult
import app.zuri.android.engine.perception.drafts.DraftCheck
import app.zuri.android.engine.perception.drafts.LocalReplyDrafter
import app.zuri.android.engine.perception.drafts.QuickReplies
import app.zuri.android.engine.perception.drafts.VoiceProfile
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class DraftsTest {
    private val db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext<Context>(), ZuriDatabase::class.java)
        .allowMainThreadQueries().build()
    private val now = 1_764_000_000_000L
    private val model = FakeModel()
    private val drafter = LocalReplyDrafter(db, model)
    private val chat = ConversationId("c1")

    @Before fun seed() = runBlocking {
        db.workspaceDao().insert(WorkspaceEntity("ws", "PERSONAL", "Personal", "TEAL", 0, 0))
        db.conversationDao().insert(ConversationEntity("c1", "ws", "WHATSAPP", "com.whatsapp", "x@lid", "Chanda", false, true, now, 0, 0, 0))
        db.conversationDao().insert(ConversationEntity("c2", "ws", "WHATSAPP", "com.whatsapp", "z@lid", "Bwalya", false, true, now, 0, 0, 0))
        listOf("ok sawa", "sure no problem", "ok see you then", "on my way", "ok thanks 🙏", "will call you later").forEachIndexed { i, t ->
            msg("o$i", "c2", "OUTGOING", t, now - 100_000 + i)
        }
        msg("m1", "c1", "INCOMING", "Can you send me the quotation by Friday?", now - 60_000)
    }

    @After fun close() = db.close()

    private suspend fun msg(id: String, conv: String, dir: String, text: String?, at: Long) = db.messageDao().insert(
        MessageEntity(id, conv, "ws", dir, "k", if (dir == "INCOMING") "Chanda" else null, text, null, null, at, true, "fp-$id",
            sourcePackage = "com.whatsapp", notificationKey = "k", notificationPostedAt = at, capturedAt = at, adapterVersion = 2, createdAt = at, updatedAt = at),
    )

    @Test fun voiceProfileReadsTheOwnersHabits() {
        val v = VoiceProfile.from(listOf("ok sawa", "ok see you", "ok thanks", "sure 👍", "on my way", "yes"))
        assertThat(v.known).isTrue()
        assertThat(v.lowercaseStartShare).isEqualTo(1.0)
        assertThat(v.fullStopShare).isEqualTo(0.0)
        assertThat(v.openers).containsExactly("ok")
        assertThat(v.notes()).contains("Usually starts in lower case.")
        assertThat(v.restyle("Okay, noted.")).isEqualTo("okay, noted")
        assertThat(VoiceProfile.from(listOf("hi")).notes()).isEmpty()
    }

    @Test fun draftCheckDropsInventedNumbersPlaceholdersLabelsAndEchoes() {
        val context = "[Chanda] Can we meet Friday at 10?"
        val kept = DraftCheck.keep(
            listOf("You: Sure, Friday at 10 works", "Yes, it's K500", "Sure, see you at [time]", "Can we meet Friday at 10?", "sure, Friday at 10 works!", "Sounds good"),
            context, "Can we meet Friday at 10?",
        )
        assertThat(kept).containsExactly("Sure, Friday at 10 works", "Sounds good").inOrder()
    }

    @Test fun quickRepliesMatchTheMessage() {
        assertThat(QuickReplies.forMessage("Thank you so much")).contains("You're welcome!")
        assertThat(QuickReplies.forMessage("When are you coming?")).contains("Let me check and get back to you.")
    }

    @Test fun modelDraftsUseVoiceAndChatAndAreChecked() = runTest {
        model.reply = { GenerationResult.Success("""{"drafts":["ok I'll send it Friday","ok it's K2000, sending Friday","Reply: sure"]}""", "fake", 1) }
        val r = drafter.draft(chat) as DraftResult.Drafts
        assertThat(r.byModel).isTrue()
        assertThat(r.drafts).containsExactly("ok I'll send it Friday", "sure").inOrder()
        val prompt = model.prompts.single()
        assertThat(prompt).contains("[Chanda] Can you send me the quotation by Friday?")
        assertThat(prompt).contains("Usually starts in lower case.")
        assertThat(prompt).contains("- ok sawa")
    }

    @Test fun withoutAModelQuickRepliesAreRestyledToTheOwner() = runTest {
        model.tier = AiTier.ESSENTIAL
        val r = drafter.draft(chat) as DraftResult.Drafts
        assertThat(r.byModel).isFalse()
        assertThat(r.drafts).contains("let me check and get back to you")
        assertThat(model.prompts).isEmpty()
    }

    @Test fun unusableModelOutputFallsBackToQuickReplies() = runTest {
        model.reply = { GenerationResult.Success("""{"drafts":["[your answer]"]}""", "fake", 1) }
        assertThat((drafter.draft(chat) as DraftResult.Drafts).byModel).isFalse()
    }

    @Test fun engineStopIsReportedNotHidden() = runTest {
        model.reply = { GenerationResult.Failed("stopped", engineStopped = true) }
        assertThat(drafter.draft(chat)).isInstanceOf(DraftResult.Failed::class.java)
    }

    @Test fun nothingToAnswerWithoutAnIncomingMessage() = runTest {
        assertThat(drafter.draft(ConversationId("c2"))).isEqualTo(DraftResult.NothingToAnswer)
    }
}
