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
class LocalReplyDrafter(private val db: ZuriDatabase, private val model: LocalLanguageModel) : ReplyDrafter {
    private val perception = db.perceptionDao()
    private val memories = db.memoryDao()

    override suspend fun draft(id: ConversationId): DraftResult {
        val tail = perception.tail(id.value, CONTEXT_MESSAGES)
        val lastIncoming = tail.lastOrNull { it.direction == Direction.INCOMING.name } ?: return DraftResult.NothingToAnswer
        val ws = lastIncoming.workspaceId
        val own = perception.ownerMessages(ws, VOICE_MESSAGES)
        val voice = VoiceProfile.from(own.mapNotNull { it.text })

        if (model.tier() == AiTier.STANDARD) {
            val open = memories.recentIn(ws, listOf(id.value), OPEN_KINDS, 6).filter { it.status == "OPEN" }
            when (val r = modelDrafts(tail, open, voice, examples(own, id.value))) {
                is ModelOutcome.Ok -> return DraftResult.Drafts(r.drafts, byModel = true)
                is ModelOutcome.Error -> if (r.engineStopped) return DraftResult.Failed(r.message)
                ModelOutcome.Empty -> Unit
            }
        }
        return DraftResult.Drafts(QuickReplies.forMessage(lastIncoming.text).map(voice::restyle).distinct(), byModel = false)
    }

    private sealed interface ModelOutcome {
        data class Ok(val drafts: List<String>) : ModelOutcome
        data object Empty : ModelOutcome
        data class Error(val message: String, val engineStopped: Boolean) : ModelOutcome
    }

    @Serializable private data class Reply(val drafts: List<String> = emptyList())

    private suspend fun modelDrafts(tail: List<MessageWithConversation>, open: List<MemoryEntity>, voice: VoiceProfile, examples: List<String>): ModelOutcome {
        val chat = tail.first()
        val other = if (chat.isGroup) "the group ${chat.title}" else chat.title
        val lines = tail.map { m ->
            val who = if (m.direction == Direction.OUTGOING.name) "You" else (m.senderName ?: chat.title)
            val body = m.text?.take(300) ?: "(${m.placeholderKind?.lowercase() ?: "message"} without text)"
            "[$who] $body"
        }
        val prompt = buildString {
            val notes = voice.notes()
            if (notes.isNotEmpty()) { append("How the owner writes:\n"); notes.forEach { append("- ").append(it).append('\n') }; append('\n') }
            if (examples.isNotEmpty()) { append("Messages the owner wrote before:\n"); examples.forEach { append("- ").append(it).append('\n') }; append('\n') }
            if (open.isNotEmpty()) { append("Open items in this chat:\n"); open.forEach { append("- ").append(itemLine(it)).append('\n') }; append('\n') }
            append("Chat with ").append(other).append(", oldest first:\n")
            lines.forEach { append(it).append('\n') }
            append('\n')
            if (tail.last().direction == Direction.OUTGOING.name) append("The owner sent the last message. Draft short follow-ups the owner could send now.")
            else append("Draft replies the owner could send now.")
        }
        val r = model.generateJson(GenerationRequest(prompt, SYSTEM, maxOutputTokens = 320), SCHEMA)
        if (r is GenerationResult.Failed) return ModelOutcome.Error(r.message, r.engineStopped)
        if (r !is GenerationResult.Success) return ModelOutcome.Empty
        val reply = runCatching { JSON.decodeFromString<Reply>(r.text.trim()) }.getOrNull() ?: return ModelOutcome.Empty
        val context = (lines + open.map(::itemLine)).joinToString("\n")
        val kept = DraftCheck.keep(reply.drafts, context, tail.lastOrNull { it.direction == Direction.INCOMING.name }?.text)
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
        const val CONTEXT_MESSAGES = 14
        const val VOICE_MESSAGES = 200
        const val EXAMPLES = 6
        val OPEN_KINDS = listOf(MemoryKind.MY_PROMISE.name, MemoryKind.REQUEST_TO_ME.name, MemoryKind.THEIR_PROMISE.name, MemoryKind.EVENT.name)
        val JSON = Json { ignoreUnknownKeys = true }
        const val SYSTEM = """You draft chat replies for the phone's owner, written as the owner ("You" in the chat), in the owner's own voice: match how they write in length, tone, language and emoji.
Answer the latest messages. Give three different options, for example a direct answer, a warmer one and a very short one.
Never invent facts, times, dates, prices or amounts that aren't in the chat. If something is unknown, keep the reply general or ask. No placeholders in brackets. Reply text only, with no name or label in front."""
        const val SCHEMA = """{"type":"object","properties":{"drafts":{"type":"array","minItems":1,"maxItems":3,"items":{"type":"string","minLength":1,"maxLength":280}}},"required":["drafts"]}"""
    }
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
