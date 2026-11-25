package app.zuri.android.engine.ingest.parse

import app.zuri.android.domain.capture.SourceKind
import app.zuri.android.engine.ingest.snapshot.NotificationSnapshot

/**
 * Chat apps that post MessagingStyle notifications (ARCHITECTURE.md §5.2). Each message in the style
 * becomes one [ParsedMessage]; apps or versions that don't use the style fall back to title and text,
 * flagged as approximate time.
 */
class MessagingAdapter(
    private val summaryPatterns: List<Regex> = emptyList(),
    /** Legacy WhatsApp group titles look like "Sender @ Group". */
    private val atGroupTitles: Boolean = false,
) : SourceAdapter {
    override val version = 1

    override fun parse(snapshot: NotificationSnapshot): ParseResult {
        if (snapshot.isGroupSummary) return ParseResult.Skipped("group summary")
        if (snapshot.isOngoing) return ParseResult.Skipped("ongoing")
        if (snapshot.category in skippedCategories) return ParseResult.Skipped("category ${snapshot.category}")
        val texts = listOfNotNull(snapshot.title, snapshot.text)
        if (texts.any { t -> summaryPatterns.any { it.matches(t.trim()) } }) return ParseResult.Skipped("summary")
        return if (snapshot.messages.isNotEmpty()) fromStyle(snapshot) else fromTitleAndText(snapshot)
    }

    private fun fromStyle(s: NotificationSnapshot): ParseResult {
        val isGroup = s.isGroupConversation
        val firstIncoming = s.messages.firstOrNull { !it.fromSelf }?.senderName
        val rawTitle = (if (isGroup) s.conversationTitle else null) ?: s.title ?: s.conversationTitle ?: firstIncoming
            ?: return ParseResult.Failed("no conversation title")
        val title = cleanTitle(rawTitle) ?: return ParseResult.Failed("blank conversation title")
        val chat = ParsedChat(ChatKeys.of(s.shortcutId, title, isGroup), title, isGroup)
        val out = s.messages.mapNotNull { m ->
            val c = Normaliser.classify(m.text) ?: return@mapNotNull null
            val name = if (m.fromSelf) null else (m.senderName?.let(::cleanTitle) ?: if (!isGroup) title else null)
            ParsedMessage(
                chat = chat,
                senderKey = ChatKeys.sender(m.fromSelf, m.senderKey, m.senderUri, name, title),
                senderName = name,
                fromMe = m.fromSelf,
                text = c.text, placeholder = c.placeholder, placeholderDetail = c.detail,
                sentAt = if (m.timestamp > 0) m.timestamp else s.postTime,
                exactTime = m.timestamp > 0,
            )
        }
        return if (out.isEmpty()) ParseResult.Skipped("no readable messages") else ParseResult.Messages(out)
    }

    private fun fromTitleAndText(s: NotificationSnapshot): ParseResult {
        val rawTitle = s.title?.let(::cleanTitle) ?: return ParseResult.Skipped("no title")
        val body = Normaliser.classify(s.bigText ?: s.text) ?: return ParseResult.Skipped("no text")
        var isGroup = false
        var title = rawTitle
        var sender: String = rawTitle
        if (atGroupTitles && " @ " in rawTitle) {
            val who = rawTitle.substringBefore(" @ ").trim()
            val group = rawTitle.substringAfter(" @ ").trim()
            if (who.isNotEmpty() && group.isNotEmpty()) {
                isGroup = true
                sender = who
                title = group
            }
        }
        val chat = ParsedChat(ChatKeys.of(s.shortcutId, title, isGroup), title, isGroup)
        return ParseResult.Messages(
            listOf(
                ParsedMessage(
                    chat = chat, senderKey = ChatKeys.sender(false, null, null, sender, title), senderName = sender, fromMe = false,
                    text = body.text, placeholder = body.placeholder, placeholderDetail = body.detail,
                    sentAt = s.postTime, exactTime = false,
                ),
            ),
        )
    }

    companion object {
        private val skippedCategories = setOf("call", "progress", "service", "transport", "alarm", "sys", "status", "navigation", "stopwatch", "location_sharing")

        /** "Family (3 messages)" → "Family"; also drops WhatsApp's trailing unread counts. */
        fun cleanTitle(raw: String): String? =
            Normaliser.clean(raw)?.replace(Regex("\\s*\\(\\d+ (new )?messages?\\)$", RegexOption.IGNORE_CASE), "")?.trim()?.ifEmpty { null }
    }
}

/** Gmail: one message per notification, the sender as the conversation, subject plus snippet as text. */
class GmailAdapter : SourceAdapter {
    override val version = 1

    override fun parse(snapshot: NotificationSnapshot): ParseResult {
        if (snapshot.isGroupSummary || snapshot.textLines.isNotEmpty()) return ParseResult.Skipped("summary")
        val sender = snapshot.title?.let { Normaliser.clean(it) } ?: return ParseResult.Skipped("no sender")
        val body = Normaliser.clean(snapshot.bigText ?: snapshot.text) ?: return ParseResult.Skipped("no text")
        if (Regex("^\\d+ new (messages|emails)$", RegexOption.IGNORE_CASE).matches(sender)) return ParseResult.Skipped("summary")
        val chat = ParsedChat(ChatKeys.of(null, sender, false), sender, false)
        return ParseResult.Messages(
            listOf(ParsedMessage(chat, ChatKeys.sender(false, null, null, sender, sender), sender, false, body, null, null, snapshot.postTime, false)),
        )
    }
}

object Adapters {
    private val whatsappSummaries = listOf(
        Regex("^\\d+ (new )?messages? from \\d+ chats?$", RegexOption.IGNORE_CASE),
        Regex("^\\d+ new messages?$", RegexOption.IGNORE_CASE),
        Regex("^whatsapp web is currently active$", RegexOption.IGNORE_CASE),
        Regex("^checking for new messages$", RegexOption.IGNORE_CASE),
    )
    private val genericSummaries = listOf(Regex("^\\d+ new messages?( from \\d+ chats?)?$", RegexOption.IGNORE_CASE))

    private val whatsapp = MessagingAdapter(whatsappSummaries, atGroupTitles = true)
    private val messaging = MessagingAdapter(genericSummaries)
    private val gmail = GmailAdapter()

    fun forSource(kind: SourceKind): SourceAdapter = when (kind) {
        SourceKind.WHATSAPP, SourceKind.WHATSAPP_BUSINESS -> whatsapp
        SourceKind.GMAIL -> gmail
        else -> messaging
    }
}
