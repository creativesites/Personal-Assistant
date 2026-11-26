package app.zuri.android.engine.perception.autoreply

import app.zuri.android.core.common.Clock
import app.zuri.android.core.common.UuidV7
import app.zuri.android.core.common.ZuriLog
import app.zuri.android.data.local.db.AutoReplyEventEntity
import app.zuri.android.data.local.db.ZuriDatabase
import app.zuri.android.domain.inbox.AutoReplyOutcome
import app.zuri.android.domain.inbox.AutoReplyReason
import app.zuri.android.domain.inbox.AutoReplySettings
import app.zuri.android.domain.inbox.ConversationId
import app.zuri.android.domain.inbox.Direction
import app.zuri.android.domain.inbox.DraftResult
import app.zuri.android.domain.inbox.ReplyDrafter
import app.zuri.android.domain.inbox.ReplyResult
import app.zuri.android.domain.inbox.ReplySender
import app.zuri.android.engine.perception.drafts.Sensitive

/**
 * Decides and sends one auto-reply (D-22). Runs after the delay, for the chat's newest incoming
 * message. Every path writes one event, so the owner can see what Zuri did and why. It holds back
 * (sends nothing) when a message is sensitive, unreadable, over the limits, or no safe draft exists.
 */
class AutoReplyEngine(
    private val db: ZuriDatabase,
    private val drafter: ReplyDrafter,
    private val sender: ReplySender,
    private val settings: suspend () -> AutoReplySettings,
    private val clock: Clock,
) {
    private val events = db.autoReplyDao()

    suspend fun handle(conversationId: String, triggerMessageId: String): AutoReplyOutcome? {
        if (events.handled(triggerMessageId)) return null
        val conv = db.conversationDao().byId(conversationId) ?: return null
        suspend fun log(outcome: AutoReplyOutcome, reason: AutoReplyReason?, text: String? = null): AutoReplyOutcome {
            val now = clock.nowMillis()
            events.insert(AutoReplyEventEntity(UuidV7.generate(clock), conv.id, triggerMessageId, outcome.name, reason?.name, text, now))
            ZuriLog.i("AutoReply", outcome.name.lowercase(), "reason" to (reason?.name ?: "-"))
            return outcome
        }

        if (!conv.autoReply || conv.isGroup) return log(AutoReplyOutcome.SKIPPED, AutoReplyReason.TURNED_OFF)
        if (settings().paused) return log(AutoReplyOutcome.SKIPPED, AutoReplyReason.PAUSED)
        stale(conversationId, triggerMessageId)?.let { return log(AutoReplyOutcome.SKIPPED, it) }

        // The messages being answered: everything they sent since the owner last wrote.
        val tail = db.perceptionDao().tail(conversationId, 20)
        val unanswered = tail.takeLastWhile { it.direction == Direction.INCOMING.name }
        val texts = unanswered.mapNotNull { it.text?.takeIf(String::isNotBlank) }
        if (texts.isEmpty()) return log(AutoReplyOutcome.HELD, AutoReplyReason.MEDIA_ONLY)
        if (texts.any(Sensitive::inMessage)) return log(AutoReplyOutcome.HELD, AutoReplyReason.SENSITIVE)

        val now = clock.nowMillis()
        if (events.sentSince(conv.id, now - HOUR) >= PER_CHAT_HOUR || events.sentSince(conv.id, now - DAY) >= PER_CHAT_DAY ||
            events.sentEverywhereSince(now - DAY) >= ALL_CHATS_DAY
        ) return log(AutoReplyOutcome.HELD, AutoReplyReason.LIMIT)

        val draft = when (val r = drafter.draftForAuto(ConversationId(conv.id))) {
            is DraftResult.Drafts -> r.drafts.firstOrNull() ?: return log(AutoReplyOutcome.HELD, AutoReplyReason.NO_SAFE_DRAFT)
            DraftResult.NoModel -> return log(AutoReplyOutcome.HELD, AutoReplyReason.NO_MODEL)
            DraftResult.NothingToAnswer -> return log(AutoReplyOutcome.SKIPPED, AutoReplyReason.OWNER_REPLIED)
            is DraftResult.Failed -> return log(AutoReplyOutcome.HELD, if (r.engineStopped) AutoReplyReason.ENGINE_STOPPED else AutoReplyReason.NO_SAFE_DRAFT)
        }
        // Drafting takes a while on the phone: check nothing changed in the meantime.
        stale(conversationId, triggerMessageId)?.let { return log(AutoReplyOutcome.SKIPPED, it, draft) }
        if (!db.conversationDao().byId(conversationId).let { it != null && it.autoReply } || settings().paused) {
            return log(AutoReplyOutcome.SKIPPED, AutoReplyReason.TURNED_OFF, draft)
        }

        return when (val sent = sender.reply(ConversationId(conv.id), draft, automatic = true)) {
            ReplyResult.Sent -> log(AutoReplyOutcome.SENT, null, draft)
            ReplyResult.NotAvailable -> log(AutoReplyOutcome.HELD, AutoReplyReason.NOTIFICATION_GONE, draft)
            is ReplyResult.Failed -> log(AutoReplyOutcome.FAILED, AutoReplyReason.SEND_ERROR, draft).also { ZuriLog.w("AutoReply", "send_failed", "error" to sent.message) }
        }
    }

    /** Why the trigger no longer needs an answer, or null when it still does. */
    private suspend fun stale(conversationId: String, triggerMessageId: String): AutoReplyReason? {
        val last = db.perceptionDao().tail(conversationId, 1).lastOrNull() ?: return AutoReplyReason.SUPERSEDED
        return when {
            last.direction == Direction.OUTGOING.name -> AutoReplyReason.OWNER_REPLIED
            last.id != triggerMessageId -> AutoReplyReason.SUPERSEDED
            else -> null
        }
    }

    companion object {
        const val PER_CHAT_HOUR = 3
        const val PER_CHAT_DAY = 15
        const val ALL_CHATS_DAY = 40
        private const val HOUR = 3_600_000L
        private const val DAY = 24 * HOUR
    }
}
