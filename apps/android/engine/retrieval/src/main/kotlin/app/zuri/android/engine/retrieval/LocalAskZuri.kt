package app.zuri.android.engine.retrieval

import app.zuri.android.data.local.db.MemoryEntity
import app.zuri.android.data.local.db.MessageWithConversation
import app.zuri.android.data.local.db.ZuriDatabase
import app.zuri.android.domain.ai.AiTier
import app.zuri.android.domain.ai.EmbedPurpose
import app.zuri.android.domain.ai.EmbedResult
import app.zuri.android.domain.ai.LocalEmbedder
import app.zuri.android.data.local.db.Vectors
import app.zuri.android.domain.ai.GenerationRequest
import app.zuri.android.domain.ai.GenerationResult
import app.zuri.android.domain.ai.LocalLanguageModel
import app.zuri.android.domain.inbox.ConversationId
import app.zuri.android.domain.inbox.Direction
import app.zuri.android.domain.inbox.MessageId
import app.zuri.android.domain.memory.AskAnswer
import app.zuri.android.domain.memory.AskSource
import app.zuri.android.domain.memory.AskZuri
import app.zuri.android.domain.memory.MemoryKind
import app.zuri.android.domain.context.ContextScope
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * Ask Zuri, entirely on the phone (M4). Retrieval is scoped and hybrid: people named in the question
 * narrow it to their conversations; the question's intent picks which understood items to use; and
 * a full-text search over message text adds the messages themselves. With a model, the answer is
 * written from those sources only and must cite them; without one (Essential tier) Zuri lists the
 * items it found. Either way an answer with no valid citation is reported as not found.
 */
class LocalAskZuri(
    private val db: ZuriDatabase,
    private val model: LocalLanguageModel,
    private val zone: () -> ZoneId = { ZoneId.systemDefault() },
    private val embedder: LocalEmbedder? = null,
) : AskZuri {
    private val perception = db.perceptionDao()
    private val memories = db.memoryDao()
    private val embeddings = db.embeddingDao()

    override suspend fun ask(scope: ContextScope, question: String): AskAnswer {
        val q = question.trim()
        if (q.isEmpty()) return AskAnswer.NotFound(emptyList())
        val plan = QueryPlanner.plan(q, perception.conversationTitles(scope.ids))
        val sources = gather(scope, plan, q)
        if (sources.isEmpty()) return AskAnswer.NotFound(emptyList())

        if (model.tier() == AiTier.STANDARD) {
            modelAnswer(q, sources)?.let { return it }
        }
        return essentialAnswer(plan, sources)
    }

    /** Items first (they are the distilled facts), then matching messages; one source per message. */
    private suspend fun gather(scope: ContextScope, plan: QueryPlan, question: String): List<AskSource> {
        val ws = scope.ids
        val kinds = plan.kinds.map { it.name }
        val items = if (plan.scope.isNotEmpty()) memories.recentIn(ws, plan.scope, kinds, 8) else memories.recent(ws, kinds, 40)
        val keptItems = if (plan.scope.isNotEmpty() || plan.intent != Intent.GENERAL) items.take(8)
        else items.filter { m -> plan.keywords.any { k -> m.text.contains(k, true) || m.sourceQuote.contains(k, true) } }.take(6)

        val ftsQuery = plan.keywords.joinToString(" OR ") { "$it*" }
        val keyword = if (ftsQuery.isEmpty()) emptyList()
        else runCatching { if (plan.scope.isNotEmpty()) perception.searchIn(ws, plan.scope, ftsQuery, 8) else perception.search(ws, ftsQuery, 8) }.getOrDefault(emptyList())
        val meaning = semantic(ws, plan.scope, question)
        val messages = buildList {
            addAll(fuse(keyword, meaning))
            if (isEmpty() && plan.scope.isNotEmpty()) addAll(perception.latestIn(ws, plan.scope, 10))
        }

        val itemMessages = perception.messages(ws, keptItems.map { it.sourceMessageId }).associateBy { it.id }
        // The prompt assembler's check: nothing outside the scope may become a source.
        scope.requireAll(keptItems.map { it.workspaceId } + itemMessages.values.map { it.workspaceId } + messages.map { it.workspaceId }, "Ask sources")
        val out = mutableListOf<AskSource>()
        val used = mutableSetOf<String>()
        for (m in keptItems) {
            val msg = itemMessages[m.sourceMessageId] ?: continue
            if (used.add(msg.id)) out += source(out.size + 1, msg, itemText(m))
        }
        for (msg in messages) {
            val text = msg.text
            if (text.isNullOrBlank() || !used.add(msg.id)) continue
            out += source(out.size + 1, msg, text)
            if (out.size >= MAX_SOURCES) break
        }
        return out.take(MAX_SOURCES)
    }

    /**
     * Meaning-based matches (EmbeddingGemma): the question's vector against the stored message
     * vectors of this workspace only, so "when is the party" finds "the braai is on Saturday".
     * Empty when no embedding model is installed or nothing is indexed yet.
     */
    private suspend fun semantic(ws: List<String>, scope: List<String>, question: String): List<MessageWithConversation> {
        val e = embedder ?: return emptyList()
        val modelId = e.modelId() ?: return emptyList()
        val stored = embeddings.vectors(ws, modelId, MAX_VECTORS).let { all -> if (scope.isEmpty()) all else all.filter { it.conversationId in scope } }
        if (stored.isEmpty()) return emptyList()
        val q = (e.embed(listOf(question), EmbedPurpose.QUERY) as? EmbedResult.Vectors)?.vectors?.firstOrNull() ?: return emptyList()
        val best = stored.map { it.messageId to Vectors.cosine(q, Vectors.unpack(it.vector)) }
            .filter { it.second >= MIN_SIMILARITY }.sortedByDescending { it.second }.take(SEMANTIC_HITS)
        if (best.isEmpty()) return emptyList()
        val rows = perception.messages(ws, best.map { it.first }).associateBy { it.id }
        return best.mapNotNull { rows[it.first] }
    }

    private fun itemText(m: MemoryEntity): String {
        val due = m.dueAt?.let { " (due " + DUE.format(Instant.ofEpochMilli(it).atZone(zone())) + ")" }.orEmpty()
        val label = when (m.kind) {
            MemoryKind.MY_PROMISE.name -> "You promised ${m.personName}"
            MemoryKind.THEIR_PROMISE.name -> "${m.personName} promised you"
            MemoryKind.REQUEST_TO_ME.name -> "${m.personName} asked you"
            MemoryKind.EVENT.name -> "Event with ${m.personName}"
            else -> "About ${m.personName}"
        }
        return "$label: ${m.text}$due. Their words: \"${m.sourceQuote}\""
    }

    private fun source(n: Int, msg: MessageWithConversation, text: String) = AskSource(
        number = n, conversationId = ConversationId(msg.conversationId), conversationTitle = msg.title,
        messageId = MessageId(msg.id), speaker = if (msg.direction == Direction.OUTGOING.name) "You" else msg.senderName ?: msg.title,
        text = text, sentAtMillis = msg.sentAt,
    )

    @Serializable private data class Reply(val known: Boolean, val answer: String, val sources: List<Int> = emptyList())

    private suspend fun modelAnswer(question: String, sources: List<AskSource>): AskAnswer? {
        val prompt = buildString {
            append("Question: ").append(question).append("\n\nSources:\n")
            sources.forEach { s ->
                append('[').append(s.number).append("] ").append(s.speaker).append(" in chat with ").append(s.conversationTitle)
                append(", ").append(STAMP.format(Instant.ofEpochMilli(s.sentAtMillis).atZone(zone()))).append(": ").append(s.text.take(500)).append('\n')
            }
        }
        val r = model.generateJson(GenerationRequest(prompt = prompt, system = SYSTEM, maxOutputTokens = 300), SCHEMA)
        if (r !is GenerationResult.Success) return null // fall back to the Essential answer
        val reply = runCatching { JSON.decodeFromString<Reply>(r.text.trim()) }.getOrNull() ?: return null
        val valid = sources.map { it.number }.toSet()
        val cited = (reply.sources + Regex("\\[(\\d+)]").findAll(reply.answer).map { it.groupValues[1].toInt() }).filter { it in valid }.distinct()
        if (!reply.known || cited.isEmpty() || reply.answer.isBlank()) return AskAnswer.NotFound(sources.take(3))
        // Citations the model made up are removed from the text; at least one real one remains.
        val text = Regex("\\[(\\d+)]").replace(reply.answer.trim()) { m -> if (m.groupValues[1].toInt() in valid) m.value else "" }
        val withCite = if (Regex("\\[\\d+]").containsMatchIn(text)) text else text + " " + cited.joinToString("") { "[$it]" }
        return AskAnswer.Answered(withCite, sources.filter { it.number in cited }, byModel = true)
    }

    /** Without a model: list what was found for promise-style questions; otherwise show the matches. */
    private fun essentialAnswer(plan: QueryPlan, sources: List<AskSource>): AskAnswer {
        val itemSources = sources.filter { it.text.startsWith("You promised") || it.text.contains(" promised you") || it.text.contains(" asked you") || it.text.startsWith("Event with") }
        if (plan.intent != Intent.GENERAL && itemSources.isNotEmpty()) {
            val text = itemSources.joinToString("\n") { "• " + it.text.substringBefore(". Their words:") + " [${it.number}]" }
            return AskAnswer.Answered(text, itemSources, byModel = false)
        }
        return AskAnswer.NotFound(sources.take(5))
    }

    private companion object {
        const val MAX_SOURCES = 10
        const val MAX_VECTORS = 6_000
        const val SEMANTIC_HITS = 8
        const val MIN_SIMILARITY = 0.35f
        val JSON = Json { ignoreUnknownKeys = true }
        val STAMP: DateTimeFormatter = DateTimeFormatter.ofPattern("EEE d MMM yyyy HH:mm", Locale.ENGLISH)
        val DUE: DateTimeFormatter = DateTimeFormatter.ofPattern("EEE d MMM", Locale.ENGLISH)
        const val SYSTEM = """You answer the owner's question using only the numbered sources, which come from their own messages on this phone. "You" in a source is the owner.
Write a short, direct answer addressed to the owner and cite every source you rely on like [2].
If the sources don't answer the question, set known to false. Never use outside knowledge and never guess."""
        const val SCHEMA = """{"type":"object","properties":{"known":{"type":"boolean"},"answer":{"type":"string","maxLength":600},"sources":{"type":"array","maxItems":10,"items":{"type":"integer","minimum":1,"maximum":10}}},"required":["known","answer","sources"]}"""
    }
}

/**
 * Reciprocal-rank fusion of keyword and meaning matches: a message found both ways ranks first;
 * otherwise the two lists alternate. One entry per message.
 */
internal fun fuse(keyword: List<MessageWithConversation>, meaning: List<MessageWithConversation>, k: Int = 60): List<MessageWithConversation> {
    val score = mutableMapOf<String, Double>()
    val byId = mutableMapOf<String, MessageWithConversation>()
    keyword.forEachIndexed { i, m -> score[m.id] = (score[m.id] ?: 0.0) + 1.0 / (k + i); byId[m.id] = m }
    meaning.forEachIndexed { i, m -> score[m.id] = (score[m.id] ?: 0.0) + 1.0 / (k + i); byId[m.id] = m }
    return score.entries.sortedByDescending { it.value }.map { byId.getValue(it.key) }
}

