package app.zuri.android.engine.perception.drafts

import app.zuri.android.data.local.db.MemoryEntity
import app.zuri.android.data.local.db.MessageWithConversation
import app.zuri.android.data.local.db.ZuriDatabase
import app.zuri.android.domain.ai.AiTier
import app.zuri.android.domain.ai.GenerationRequest
import app.zuri.android.domain.ai.GenerationResult
import app.zuri.android.domain.ai.LocalLanguageModel
import app.zuri.android.domain.inbox.ConversationId
import app.zuri.android.domain.inbox.Direction
import app.zuri.android.domain.inbox.DraftResult
import app.zuri.android.domain.inbox.ReplyDrafter
import app.zuri.android.domain.memory.MemoryKind
import app.zuri.android.engine.perception.insight.ConversationStateUpdater
import app.zuri.android.engine.perception.insight.EmotionDerivation
import app.zuri.android.engine.perception.insight.StateMessage
import app.zuri.android.domain.inbox.Mood
import app.zuri.android.domain.context.ContextScope
import app.zuri.android.domain.context.Purpose
import app.zuri.android.domain.workspace.WorkspaceId
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * Reply drafts on the phone (ARCHITECTURE.md §7: 2–3 drafts, ≤120 tokens each, local voice
 * profile). The model sees the chat's latest messages, its open promises and requests, and notes
 * on how the owner writes, with a few of their own messages as examples. Drafts are checked
 * before they're shown: no bracketed placeholders, and no number (time, price, amount) that isn't
 * already in the conversation, so a draft can't make up a commitment. Without a model, a few
 * quick replies matched to the last message are offered, restyled to the owner's habits.
 */
class LocalReplyDrafter(
    private val db: ZuriDatabase,
    private val model: LocalLanguageModel,
    private val clock: () -> Long = System::currentTimeMillis,
    private val zone: () -> ZoneId = { ZoneId.systemDefault() },
) : ReplyDrafter {
    private val perception = db.perceptionDao()
    private val memories = db.memoryDao()
    private val insights = db.insightDao()

    override suspend fun draft(id: ConversationId): DraftResult {
        val ctx = context(id) ?: return DraftResult.NothingToAnswer
        if (model.tier() == AiTier.STANDARD) {
            when (val r = modelDrafts(ctx, auto = false)) {
                is ModelOutcome.Ok -> return DraftResult.Drafts(r.drafts, byModel = true)
                is ModelOutcome.Error -> if (r.engineStopped) return DraftResult.Failed(r.message, engineStopped = true)
                ModelOutcome.Empty -> Unit
            }
        }
        val quick = QuickReplies.forMessage(ctx.lastIncoming.text).map(ctx.voice::restyle).distinct()
        return DraftResult.Drafts(quick.filterNot { q -> ctx.dismissed.any { it.equals(q, ignoreCase = true) } }.ifEmpty { quick }, byModel = false)
    }

    override suspend fun draftForAuto(id: ConversationId): DraftResult {
        val ctx = context(id) ?: return DraftResult.NothingToAnswer
        if (model.tier() != AiTier.STANDARD) return DraftResult.NoModel
        return when (val r = modelDrafts(ctx, auto = true)) {
            is ModelOutcome.Ok -> DraftResult.Drafts(r.drafts.filterNot(Sensitive::inDraft).take(1), byModel = true)
            is ModelOutcome.Error -> DraftResult.Failed(r.message, r.engineStopped)
            ModelOutcome.Empty -> DraftResult.Drafts(emptyList(), byModel = true)
        }
    }

    /** Everything a reply draws on: the chat, what Zuri knows from it, and how the owner writes. */
    private class Context(
        val tail: List<MessageWithConversation>,
        val lastIncoming: MessageWithConversation,
        val open: List<MemoryEntity>,
        val facts: List<MemoryEntity>,
        val voice: VoiceProfile,
        val examples: List<String>,
        val questions: List<String>,
        val decisions: List<String>,
        val mood: Mood?,
        val summary: String?,
        /** Drafts the owner turned down in this chat lately (learning loop): not offered again. */
        val dismissed: List<String>,
    )

    private suspend fun context(id: ConversationId): Context? {
        val tail = fit(perception.tail(id.value, CONTEXT_MESSAGES))
        val lastIncoming = tail.lastOrNull { it.direction == Direction.INCOMING.name } ?: return null
        val ws = lastIncoming.workspaceId
        val own = perception.ownerMessages(ws, VOICE_MESSAGES)
        val items = memories.recentIn(listOf(ws), listOf(id.value), ITEM_KINDS, 16).filter { it.status == "OPEN" }
        val full = perception.tail(id.value, STATE_MESSAGES)
        val state = ConversationStateUpdater.fold(full.map { StateMessage(it.direction == Direction.OUTGOING.name, it.text, it.placeholderKind, it.sentAt) }, clock())
        val stored = insights.byConversation(id.value)?.takeIf { it.workspaceId == ws }
        // A reply draws only on its chat's own workspace (§8.2): checked before anything enters the prompt.
        ContextScope.single(WorkspaceId(ws), Purpose.DRAFT_REPLY)
            .requireAll(tail.map { it.workspaceId } + full.map { it.workspaceId } + own.map { it.workspaceId } + items.map { it.workspaceId }, "Draft context")
        return Context(
            tail = tail, lastIncoming = lastIncoming,
            open = items.filter { it.kind != MemoryKind.FACT.name }.take(6),
            facts = items.filter { it.kind == MemoryKind.FACT.name }.take(5),
            voice = VoiceProfile.from(own.mapNotNull { it.text }), examples = examples(own, id.value),
            questions = state.unansweredQuestions.takeLast(4), decisions = state.decisions.takeLast(3),
            mood = EmotionDerivation.mood(full.asReversed().filter { it.direction == Direction.INCOMING.name }.mapNotNull { it.text }),
            summary = stored?.summary,
            dismissed = insights.dismissedDrafts(id.value, clock() - DISMISSED_WINDOW_MILLIS, 6),
        )
    }

    /** The newest messages that fit the prompt budget; older ones are dropped first. */
    private fun fit(messages: List<MessageWithConversation>): List<MessageWithConversation> {
        val out = ArrayDeque<MessageWithConversation>()
        var used = 0
        for (m in messages.asReversed()) {
            val cost = (m.text?.length?.coerceAtMost(MESSAGE_CHARS) ?: 20) + 24
            if (out.isNotEmpty() && used + cost > CONTEXT_CHARS) break
            out.addFirst(m); used += cost
        }
        return out.toList()
    }

    private sealed interface ModelOutcome {
        data class Ok(val drafts: List<String>) : ModelOutcome
        data object Empty : ModelOutcome
        data class Error(val message: String, val engineStopped: Boolean) : ModelOutcome
    }

    @Serializable private data class Reply(val drafts: List<String> = emptyList())

    private suspend fun modelDrafts(ctx: Context, auto: Boolean): ModelOutcome {
        val chat = ctx.tail.first()
        val other = if (chat.isGroup) "the group ${chat.title}" else chat.title
        val lines = ctx.tail.map { m ->
            val who = if (m.direction == Direction.OUTGOING.name) "You" else (m.senderName ?: chat.title)
            val body = m.text?.take(MESSAGE_CHARS) ?: "(${m.placeholderKind?.lowercase()?.replace('_', ' ') ?: "message"} without text)"
            "[${STAMP.format(Instant.ofEpochMilli(m.sentAt).atZone(zone()))}] [$who] $body"
        }
        val prompt = buildString {
            append("It is now ").append(NOW.format(Instant.ofEpochMilli(clock()).atZone(zone()))).append(".\n\n")
            val notes = ctx.voice.notes()
            if (notes.isNotEmpty()) { append("How the owner writes:\n"); notes.forEach { append("- ").append(it).append('\n') }; append('\n') }
            if (ctx.examples.isNotEmpty()) { append("Messages the owner wrote before:\n"); ctx.examples.forEach { append("- ").append(it).append('\n') }; append('\n') }
            if (ctx.facts.isNotEmpty()) { append("What the owner knows about ").append(chat.title).append(":\n"); ctx.facts.forEach { append("- ").append(it.text).append('\n') }; append('\n') }
            if (ctx.open.isNotEmpty()) { append("Open items in this chat:\n"); ctx.open.forEach { append("- ").append(itemLine(it)).append('\n') }; append('\n') }
            if (ctx.summary != null) append("Earlier in this chat: ").append(ctx.summary).append("\n\n")
            if (ctx.decisions.isNotEmpty()) { append("Already agreed:\n"); ctx.decisions.forEach { append("- ").append(it).append('\n') }; append('\n') }
            if (ctx.questions.isNotEmpty()) { append("Their questions still unanswered (answer these if you can):\n"); ctx.questions.forEach { append("- ").append(it).append('\n') }; append('\n') }
            when (ctx.mood) {
                Mood.TENSE -> append("They seem upset or stressed: be calm and kind.\n\n")
                Mood.LOW -> append("They seem down: be warm and gentle.\n\n")
                Mood.WARM -> append("The mood is warm and friendly.\n\n")
                else -> Unit
            }
            if (ctx.dismissed.isNotEmpty()) { append("Replies the owner turned down here recently (don't offer these again):\n"); ctx.dismissed.forEach { append("- ").append(it).append('\n') }; append('\n') }
            append("Chat with ").append(other).append(", oldest first:\n")
            lines.forEach { append(it).append('\n') }
            append('\n')
            when {
                auto -> append("Write the reply to send now to the latest messages, using the whole chat for context.")
                ctx.tail.last().direction == Direction.OUTGOING.name -> append("The owner sent the last message. Draft short follow-ups the owner could send now.")
                else -> append("Draft replies the owner could send now to the latest messages, using the whole chat for context.")
            }
        }
        val system = if (auto) SYSTEM + AUTO_RULES else SYSTEM
        val r = model.generateJson(GenerationRequest(prompt, system, maxOutputTokens = 320), SCHEMA)
        if (r is GenerationResult.Failed) return ModelOutcome.Error(r.message, r.engineStopped)
        if (r !is GenerationResult.Success) return ModelOutcome.Empty
        val reply = runCatching { JSON.decodeFromString<Reply>(r.text.trim()) }.getOrNull() ?: return ModelOutcome.Empty
        // Numbers a draft may use: only those in what was said (not the timestamps added above).
        val context = (ctx.tail.mapNotNull { it.text } + ctx.open.map(::itemLine) + ctx.facts.map { it.text } + ctx.decisions + ctx.questions).joinToString("\n")
        val kept = DraftCheck.keep(reply.drafts, context, ctx.lastIncoming.text).filterNot { d -> ctx.dismissed.any { it.equals(d, ignoreCase = true) } }
        return if (kept.isEmpty()) ModelOutcome.Empty else ModelOutcome.Ok(kept)
    }

    private fun itemLine(m: MemoryEntity) = when (m.kind) {
        MemoryKind.MY_PROMISE.name -> "You promised: ${m.text}"
        MemoryKind.REQUEST_TO_ME.name -> "${m.personName} asked you: ${m.text}"
        MemoryKind.THEIR_PROMISE.name -> "${m.personName} promised: ${m.text}"
        else -> "Event: ${m.text}"
    } + (m.dueText?.let { " (when: $it)" } ?: "")

    /** The owner's own words, this chat first: up to six, short enough to show style, not content. */
    private fun examples(own: List<MessageWithConversation>, conversationId: String): List<String> {
        val texts = (own.filter { it.conversationId == conversationId } + own.filter { it.conversationId != conversationId })
            .mapNotNull { it.text?.trim() }.filter { it.length in 2..160 }.distinct()
        return texts.take(EXAMPLES)
    }

    private companion object {
        const val CONTEXT_MESSAGES = 30
        const val STATE_MESSAGES = 40
        const val DISMISSED_WINDOW_MILLIS = 14L * 24 * 60 * 60 * 1000
        const val CONTEXT_CHARS = 3_600
        const val MESSAGE_CHARS = 300
        const val VOICE_MESSAGES = 200
        const val EXAMPLES = 6
        val ITEM_KINDS = listOf(MemoryKind.MY_PROMISE.name, MemoryKind.REQUEST_TO_ME.name, MemoryKind.THEIR_PROMISE.name, MemoryKind.EVENT.name, MemoryKind.FACT.name)
        val JSON = Json { ignoreUnknownKeys = true }
        val STAMP: DateTimeFormatter = DateTimeFormatter.ofPattern("EEE HH:mm", Locale.ENGLISH)
        val NOW: DateTimeFormatter = DateTimeFormatter.ofPattern("EEEE d MMMM, HH:mm", Locale.ENGLISH)
        const val SYSTEM = """You draft chat replies for the phone's owner, written as the owner ("You" in the chat), in the owner's own voice: match how they write in length, tone, language and emoji.
Read the whole chat and answer the latest messages in that context. Give three different options, for example a direct answer, a warmer one and a very short one.
Never invent facts, times, dates, prices or amounts that aren't in the chat. If something is unknown, keep the reply general or ask. No placeholders in brackets. Reply text only, with no name, time or label in front."""
        const val AUTO_RULES = """
This reply is sent automatically, without the owner checking it first. Agree to nothing new: no payments, prices, meetings, dates or favours the owner hasn't already agreed to in the chat. If the message needs the owner's decision, reply warmly that you'll get back to them soon. Keep it short and natural."""
        const val SCHEMA = """{"type":"object","properties":{"drafts":{"type":"array","minItems":1,"maxItems":3,"items":{"type":"string","minLength":1,"maxLength":280}}},"required":["drafts"]}"""
    }
}

/** Messages and drafts an auto-reply must not handle: money, codes and passwords, serious news. */
object Sensitive {
    private val MONEY = Regex("\\b(k\\s?\\d|zmw|kwacha|usd|\\$\\s?\\d|pay|paid|payment|money|transfer|send me|loan|borrow|lend|owe|debt|bank|account|airtel money|mtn money|momo|mobile money|price|cost|invoice|deposit|refund)", RegexOption.IGNORE_CASE)
    private val SECRET = Regex("\\b(password|passcode|pin|otp|verification|code|cvv|card number|login)\\b", RegexOption.IGNORE_CASE)
    private val SERIOUS = Regex("\\b(died|death|dead|passed away|funeral|condolence|hospital|accident|emergency|urgent|sick|ill|pain|police|arrested|help me|depressed|suicide|divorce|pregnant|sorry for your loss)\\b", RegexOption.IGNORE_CASE)

    fun inMessage(text: String): Boolean = MONEY.containsMatchIn(text) || SECRET.containsMatchIn(text) || SERIOUS.containsMatchIn(text)
    fun inDraft(text: String): Boolean = MONEY.containsMatchIn(text) || SECRET.containsMatchIn(text)
}

/** Checks on model drafts before the owner sees them. */
object DraftCheck {
    private val NUMBER = Regex("\\d+")
    private val LABEL = Regex("^\\s*(\\[?(you|me|owner|reply|draft|option)\\s*\\d*]?\\s*[:\\-–]\\s*)", RegexOption.IGNORE_CASE)

    fun keep(drafts: List<String>, context: String, lastIncoming: String?): List<String> = drafts.asSequence()
        .map { it.trim().replace(LABEL, "").trim().trim('"', '“', '”').trim() }
        .filter { it.isNotEmpty() && it.length <= 280 }
        .filter { '[' !in it && ']' !in it && '{' !in it && '<' !in it }
        // Every number in a draft must already be in the chat: no invented times, prices or amounts.
        .filter { d -> NUMBER.findAll(d).all { n -> NUMBER.findAll(context).any { it.value == n.value } } }
        .filter { lastIncoming == null || !it.equals(lastIncoming.trim(), ignoreCase = true) }
        .distinctBy { it.lowercase().replace(Regex("[^\\p{L}\\p{N}]"), "") }
        .take(3).toList()
}

/** Essential tier: a few safe, general replies matched to the kind of message being answered. */
object QuickReplies {
    private val THANKS = Regex("\\b(thanks|thank you|thx|asante|appreciate)\\b", RegexOption.IGNORE_CASE)
    private val GREETING = Regex("^\\s*(hi|hey|hello|hallo|good (morning|afternoon|evening)|morning|muli shani|mwabuka)\\b", RegexOption.IGNORE_CASE)
    private val QUESTION = Regex("\\?\\s*$|^\\s*(what|when|where|who|why|how|can|could|will|would|are|is|do|did|have|has)\\b", RegexOption.IGNORE_CASE)

    fun forMessage(text: String?): List<String> {
        val t = text.orEmpty()
        return when {
            THANKS.containsMatchIn(t) -> listOf("You're welcome!", "Anytime 🙂", "No problem.")
            GREETING.containsMatchIn(t) && t.length < 40 -> listOf("Hi! How are you?", "Hello 👋", "Hey, good to hear from you.")
            QUESTION.containsMatchIn(t) -> listOf("Let me check and get back to you.", "Give me a moment, I'll confirm.", "Good question, I'll find out.")
            else -> listOf("Okay, noted.", "Thanks for letting me know.", "Got it 👍")
        }
    }
}
