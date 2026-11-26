package app.zuri.android.engine.perception.insight

import app.zuri.android.core.common.UuidV7
import app.zuri.android.data.local.db.ConversationInsightEntity
import app.zuri.android.data.local.db.DraftFeedbackEntity
import app.zuri.android.data.local.db.MessageWithConversation
import app.zuri.android.data.local.db.ZuriDatabase
import app.zuri.android.domain.ai.AiTier
import app.zuri.android.domain.ai.GenerationRequest
import app.zuri.android.domain.ai.GenerationResult
import app.zuri.android.domain.ai.LocalLanguageModel
import app.zuri.android.domain.inbox.ConversationId
import app.zuri.android.domain.inbox.ConversationInsight
import app.zuri.android.domain.inbox.ConversationInsights
import app.zuri.android.domain.inbox.Direction
import app.zuri.android.domain.inbox.DraftAction
import app.zuri.android.domain.inbox.DraftFeedback
import app.zuri.android.domain.inbox.PlaceholderKind
import app.zuri.android.domain.inbox.SummaryResult
import app.zuri.android.domain.inbox.WaitingChat
import app.zuri.android.domain.workspace.WorkspaceId
import app.zuri.android.domain.context.ContextScope
import app.zuri.android.domain.context.Purpose
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * Chat state on the phone (M4): rules for whose turn it is, open questions, decisions and mood,
 * worked out from the stored messages on every read; the summary is written by the on-device model
 * only when the owner asks, and kept until newer messages make it out of date.
 */
class LocalConversationInsights(
    private val db: ZuriDatabase,
    private val model: LocalLanguageModel,
    private val clock: () -> Long = System::currentTimeMillis,
    private val zone: () -> ZoneId = { ZoneId.systemDefault() },
) : ConversationInsights, DraftFeedback {
    private val insights = db.insightDao()
    private val perception = db.perceptionDao()

    override fun observe(id: ConversationId): Flow<ConversationInsight> =
        combine(db.messageDao().observeFor(id.value), insights.observe(id.value)) { messages, stored ->
            val live = messages.filter { it.deletedAt == null }.takeLast(TAIL)
            val state = ConversationStateUpdater.fold(
                live.map { StateMessage(it.direction == Direction.OUTGOING.name, it.text, it.placeholderKind, it.sentAt) }, clock(),
            )
            val lastAt = live.lastOrNull()?.sentAt
            ConversationInsight(
                yourTurn = state.yourTurn, waitingSinceMillis = state.waitingSinceMillis,
                unansweredQuestions = state.unansweredQuestions, decisions = state.decisions,
                mood = EmotionDerivation.mood(live.asReversed().filter { it.direction == Direction.INCOMING.name }.mapNotNull { it.text }),
                topic = stored?.topic, summary = stored?.summary, summaryAtMillis = stored?.summaryAt,
                summaryOutdated = stored != null && lastAt != null && lastAt > stored.summaryUpto,
            )
        }

    /** The rules' view of a chat, for the drafter and Today. */
    suspend fun stateOf(conversationId: String): Pair<ChatState, app.zuri.android.domain.inbox.Mood?> {
        val tail = perception.tail(conversationId, TAIL)
        return stateFrom(tail)
    }

    private fun stateFrom(tail: List<MessageWithConversation>): Pair<ChatState, app.zuri.android.domain.inbox.Mood?> {
        val state = ConversationStateUpdater.fold(tail.map { StateMessage(it.direction == Direction.OUTGOING.name, it.text, it.placeholderKind, it.sentAt) }, clock())
        val mood = EmotionDerivation.mood(tail.asReversed().filter { it.direction == Direction.INCOMING.name }.mapNotNull { it.text })
        return state to mood
    }

    override fun observeWaiting(workspaces: Set<WorkspaceId>): Flow<List<WaitingChat>> =
        insights.observeWaiting(workspaces.map { it.value }, clock() - WAITING_WINDOW_MILLIS, WAITING_LIMIT).map { rows ->
            rows.map { r ->
                val (state, mood) = stateFrom(perception.tail(r.id, TAIL))
                WaitingChat(
                    id = ConversationId(r.id), title = r.title, lastText = r.lastText,
                    lastPlaceholder = r.lastPlaceholder?.let { runCatching { PlaceholderKind.valueOf(it) }.getOrNull() },
                    waitingSinceMillis = state.waitingSinceMillis ?: r.lastAt,
                    questions = state.unansweredQuestions.size, mood = mood,
                )
            }
        }

    @Serializable private data class Summary(val topic: String = "", val summary: String = "")

    override suspend fun summarize(id: ConversationId): SummaryResult {
        val tail = fit(perception.tail(id.value, SUMMARY_MESSAGES).filter { it.text != null })
        if (tail.size < 2) return SummaryResult.NothingToSummarize
        if (model.tier() != AiTier.STANDARD) return SummaryResult.NoModel
        val chat = tail.first()
        ContextScope.single(WorkspaceId(chat.workspaceId), Purpose.BROWSE).requireAll(tail.map { it.workspaceId }, "Summary context")
        val prompt = buildString {
            append("Chat with ").append(if (chat.isGroup) "the group ${chat.title}" else chat.title).append(", oldest first:\n")
            tail.forEach { m ->
                val who = if (m.direction == Direction.OUTGOING.name) "Owner" else (m.senderName ?: chat.title)
                append('[').append(STAMP.format(Instant.ofEpochMilli(m.sentAt).atZone(zone()))).append("] [").append(who).append("] ")
                append(m.text!!.take(MESSAGE_CHARS)).append('\n')
            }
            append("\nSummarise this chat for the owner.")
        }
        val r = model.generateJson(GenerationRequest(prompt, SYSTEM, maxOutputTokens = 220), SCHEMA)
        if (r is GenerationResult.Failed) return SummaryResult.Failed(r.message, r.engineStopped)
        if (r !is GenerationResult.Success) return SummaryResult.NoModel
        val parsed = runCatching { JSON.decodeFromString<Summary>(r.text.trim()) }.getOrNull()
            ?: return SummaryResult.Failed("unreadable summary")
        val texts = tail.joinToString("\n") { it.text.orEmpty() }
        val summary = parsed.summary.trim().takeIf { it.isNotEmpty() && SummaryCheck.grounded(it, texts) }
            ?: return SummaryResult.Failed("summary not grounded in the chat")
        val topic = parsed.topic.trim().take(TOPIC_CHARS).takeIf { it.isNotEmpty() && SummaryCheck.grounded(it, texts) }
        insights.upsert(
            ConversationInsightEntity(
                conversationId = id.value, workspaceId = chat.workspaceId, topic = topic, summary = summary.take(SUMMARY_CHARS),
                summaryUpto = perception.tail(id.value, 1).lastOrNull()?.sentAt ?: tail.last().sentAt,
                summaryAt = clock(), modelId = r.modelId,
            ),
        )
        return SummaryResult.Done
    }

    override suspend fun record(id: ConversationId, draft: String, action: DraftAction, finalText: String?) {
        val conv = db.conversationDao().byId(id.value) ?: return
        insights.insertFeedback(
            DraftFeedbackEntity(
                id = UuidV7.generate { clock() }, conversationId = conv.id, workspaceId = conv.workspaceId,
                draft = draft.take(SUMMARY_CHARS), action = action.name, finalText = finalText?.take(SUMMARY_CHARS), at = clock(),
            ),
        )
    }

    private fun fit(messages: List<MessageWithConversation>): List<MessageWithConversation> {
        val out = ArrayDeque<MessageWithConversation>()
        var used = 0
        for (m in messages.asReversed()) {
            val cost = (m.text?.length?.coerceAtMost(MESSAGE_CHARS) ?: 0) + 24
            if (out.isNotEmpty() && used + cost > CONTEXT_CHARS) break
            out.addFirst(m); used += cost
        }
        return out.toList()
    }

    companion object {
        const val TAIL = 40
        const val WAITING_WINDOW_MILLIS = 7L * 24 * 60 * 60 * 1000
        const val WAITING_LIMIT = 20
        private const val SUMMARY_MESSAGES = 80
        private const val CONTEXT_CHARS = 4_000
        private const val MESSAGE_CHARS = 300
        private const val SUMMARY_CHARS = 500
        private const val TOPIC_CHARS = 60
        private val JSON = Json { ignoreUnknownKeys = true }
        private val STAMP: DateTimeFormatter = DateTimeFormatter.ofPattern("EEE d MMM HH:mm", Locale.ENGLISH)
        private const val SYSTEM = """You summarise a chat for the phone's owner. Use only what is in the chat. In "summary", write two or three short sentences: what the chat is about, what was agreed, and anything still open. In "topic", give the main subject in a few words. Never add facts, names, times, dates or amounts that aren't in the chat."""
        private const val SCHEMA = """{"type":"object","properties":{"topic":{"type":"string","maxLength":60},"summary":{"type":"string","minLength":1,"maxLength":500}},"required":["topic","summary"]}"""
    }
}

/** A summary may only use numbers that are in the chat's own words (no invented times or amounts). */
object SummaryCheck {
    private val NUMBER = Regex("\\d+")

    fun grounded(text: String, chat: String): Boolean {
        val have = NUMBER.findAll(chat).map { it.value }.toSet()
        return '[' !in text && '{' !in text && NUMBER.findAll(text).all { it.value in have }
    }
}
