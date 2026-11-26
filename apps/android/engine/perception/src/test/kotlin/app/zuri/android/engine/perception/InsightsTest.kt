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
import app.zuri.android.domain.inbox.DraftAction
import app.zuri.android.domain.inbox.DraftResult
import app.zuri.android.domain.inbox.Mood
import app.zuri.android.domain.inbox.SummaryResult
import app.zuri.android.domain.workspace.WorkspaceId
import app.zuri.android.engine.perception.drafts.LocalReplyDrafter
import app.zuri.android.engine.perception.insight.ConversationStateUpdater
import app.zuri.android.engine.perception.insight.EmotionDerivation
import app.zuri.android.engine.perception.insight.LocalConversationInsights
import app.zuri.android.engine.perception.insight.Questions
import app.zuri.android.engine.perception.insight.StateMessage
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class InsightsTest {
    private val db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext<Context>(), ZuriDatabase::class.java)
        .allowMainThreadQueries().build()
    private val now = 1_764_000_000_000L
    private val model = FakeModel()
    private val insights = LocalConversationInsights(db, model, { now })
    private val chat = ConversationId("c1")
    private val hour = 3_600_000L

    @Before fun seed() = runBlocking {
        db.workspaceDao().insert(WorkspaceEntity("ws", "PERSONAL", "Personal", "TEAL", 0, 0))
        db.workspaceDao().insert(WorkspaceEntity("biz", "BUSINESS", "Shop", "INDIGO", 0, 0))
        db.conversationDao().insert(ConversationEntity("c1", "ws", "WHATSAPP", "com.whatsapp", "x@lid", "Chanda", false, true, now, 0, 0, 0))
        db.conversationDao().insert(ConversationEntity("c2", "ws", "WHATSAPP", "com.whatsapp", "y@lid", "Bwalya", false, true, now, 0, 0, 0))
        db.conversationDao().insert(ConversationEntity("g1", "ws", "WHATSAPP", "com.whatsapp", "g@g.us", "Family", true, false, now, 0, 0, 0))
        db.conversationDao().insert(ConversationEntity("b1", "biz", "WHATSAPP", "com.whatsapp", "b@lid", "Client", false, true, now, 0, 0, 0))
        msg("a1", "c1", "INCOMING", "Hi! Are you coming on Saturday?", now - 5 * hour)
        msg("a2", "c1", "OUTGOING", "yes, let's do 10 at the market", now - 4 * hour)
        msg("a3", "c1", "INCOMING", "Great 😊 what should I bring?", now - 2 * hour)
        msg("a4", "c1", "INCOMING", "and can you pick me up?", now - 1 * hour)
        msg("b-1", "c2", "INCOMING", "Thanks!", now - 3 * hour)
        msg("b-2", "c2", "OUTGOING", "anytime", now - 2 * hour)
        msg("g-1", "g1", "INCOMING", "Who is cooking?", now - hour, ws = "ws")
        msg("x-1", "b1", "INCOMING", "Is the order ready?", now - hour, ws = "biz")
    }

    @After fun close() = db.close()

    private suspend fun msg(id: String, conv: String, dir: String, text: String?, at: Long, ws: String = "ws", placeholder: String? = null) = db.messageDao().insert(
        MessageEntity(id, conv, ws, dir, "k", if (dir == "INCOMING") "Chanda" else null, text, placeholder, null, at, true, "fp-$id",
            sourcePackage = "com.whatsapp", notificationKey = "k", notificationPostedAt = at, capturedAt = at, adapterVersion = 2, createdAt = at, updatedAt = at),
    )

    @Test fun questionsAreRecognisedByWording() {
        assertThat(Questions.isQuestion("Are you coming on Saturday?")).isTrue()
        assertThat(Questions.isQuestion("can you pick me up")).isTrue()
        assertThat(Questions.isQuestion("when are you back")).isTrue()
        assertThat(Questions.isQuestion("When I get home I'll call you.")).isFalse()
        assertThat(Questions.isQuestion("do it now")).isFalse()
        assertThat(Questions.isQuestion("?")).isFalse()
    }

    @Test fun ownersReplyAnswersTheOldestQuestionLikeTheServer() {
        val s = ConversationStateUpdater.fold(
            listOf(
                StateMessage(false, "Are you coming?", null, now - 5 * hour),
                StateMessage(false, "What time?", null, now - 4 * hour),
                StateMessage(true, "yes", null, now - 3 * hour),
                StateMessage(false, "Shall I bring juice?", null, now - 2 * hour),
                StateMessage(false, null, "REACTION", now - hour),
            ),
            now,
        )
        assertThat(s.unansweredQuestions).containsExactly("What time?", "Shall I bring juice?").inOrder()
        assertThat(s.yourTurn).isTrue()
        assertThat(s.waitingSinceMillis).isEqualTo(now - 2 * hour)
    }

    @Test fun oldQuestionsExpireAfterThreeDays() {
        val s = ConversationStateUpdater.fold(listOf(StateMessage(false, "Are you coming?", null, now - 4 * 24 * hour)), now)
        assertThat(s.unansweredQuestions).isEmpty()
        assertThat(s.yourTurn).isTrue()
    }

    @Test fun moodFollowsTheServerProjection() {
        assertThat(EmotionDerivation.affect(EmotionDerivation.emotions("so happy, thank you ❤️")).valence).isGreaterThan(0.5)
        assertThat(EmotionDerivation.mood(listOf("This is ridiculous, I'm so annoyed 😡"))).isEqualTo(Mood.TENSE)
        assertThat(EmotionDerivation.mood(listOf("feeling sad and tired today"))).isEqualTo(Mood.LOW)
        assertThat(EmotionDerivation.mood(listOf("Great, thanks 😊"))).isEqualTo(Mood.WARM)
        assertThat(EmotionDerivation.mood(listOf("I'm not happy about this"))).isEqualTo(Mood.NEUTRAL)
        assertThat(EmotionDerivation.mood(listOf("see you at 3"))).isEqualTo(Mood.NEUTRAL)
        assertThat(EmotionDerivation.mood(emptyList())).isNull()
    }

    @Test fun insightShowsTurnQuestionsDecisionsAndMood() = runTest {
        val i = insights.observe(chat).first()
        assertThat(i.yourTurn).isTrue()
        assertThat(i.unansweredQuestions).containsExactly("Great 😊 what should I bring?", "and can you pick me up?").inOrder()
        assertThat(i.decisions).containsExactly("yes, let's do 10 at the market")
        assertThat(i.mood).isEqualTo(Mood.WARM)
        assertThat(i.summary).isNull()
    }

    @Test fun waitingListsOnlyOneToOneChatsInScopeWhereTheyWroteLast() = runTest {
        val waiting = insights.observeWaiting(setOf(WorkspaceId("ws"))).first()
        assertThat(waiting.map { it.id.value }).containsExactly("c1")
        assertThat(waiting.single().questions).isEqualTo(2)
        assertThat(insights.observeWaiting(setOf(WorkspaceId("biz"))).first().map { it.id.value }).containsExactly("b1")
    }

    @Test fun summaryIsGroundedStoredAndGoesOutOfDate() = runTest {
        model.reply = { GenerationResult.Success("""{"topic":"Saturday market","summary":"Chanda is coming Saturday; you agreed 10 at the market. She asked what to bring."}""", "gemma", 1) }
        assertThat(insights.summarize(chat)).isEqualTo(SummaryResult.Done)
        var i = insights.observe(chat).first()
        assertThat(i.topic).isEqualTo("Saturday market")
        assertThat(i.summaryOutdated).isFalse()
        msg("a5", "c1", "INCOMING", "hello?", now)
        i = insights.observe(chat).first()
        assertThat(i.summaryOutdated).isTrue()
    }

    @Test fun summaryWithAnInventedNumberIsRefused() = runTest {
        model.reply = { GenerationResult.Success("""{"topic":"Plans","summary":"You agreed to meet at 11 and pay K500."}""", "gemma", 1) }
        assertThat(insights.summarize(chat)).isInstanceOf(SummaryResult.Failed::class.java)
        assertThat(db.insightDao().byConversation("c1")).isNull()
    }

    @Test fun summaryNeedsAModel() = runTest {
        model.tier = AiTier.ESSENTIAL
        assertThat(insights.summarize(chat)).isEqualTo(SummaryResult.NoModel)
    }

    @Test fun drafterAnswersOpenQuestionsAndDoesNotRepeatTurnedDownDrafts() = runTest {
        insights.record(chat, "ok see you then", DraftAction.DISMISSED)
        model.reply = { GenerationResult.Success("""{"drafts":["ok see you then","just bring yourself, I'll pick you up"]}""", "fake", 1) }
        val drafter = LocalReplyDrafter(db, model, { now })
        val r = drafter.draft(chat) as DraftResult.Drafts
        assertThat(r.drafts).containsExactly("just bring yourself, I'll pick you up")
        val prompt = model.prompts.last()
        assertThat(prompt).contains("Their questions still unanswered")
        assertThat(prompt).contains("- and can you pick me up?")
        assertThat(prompt).contains("Already agreed:")
        assertThat(prompt).contains("don't offer these again")
    }

    @Test fun feedbackIsDeletedWithTheChat() = runTest {
        insights.record(chat, "draft", DraftAction.COPIED)
        db.conversationDao().delete("c1")
        assertThat(db.insightDao().draftActionCounts(listOf("ws"), 0)).isEmpty()
    }
}
