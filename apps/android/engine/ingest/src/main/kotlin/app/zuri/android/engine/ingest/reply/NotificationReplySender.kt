package app.zuri.android.engine.ingest.reply

import android.app.PendingIntent
import android.app.RemoteInput
import android.content.Context
import android.content.Intent
import android.os.Bundle
import androidx.room.withTransaction
import app.zuri.android.core.common.Clock
import app.zuri.android.core.common.UuidV7
import app.zuri.android.core.common.ZuriLog
import app.zuri.android.data.local.db.MessageEntity
import app.zuri.android.data.local.db.ZuriDatabase
import app.zuri.android.domain.inbox.ConversationId
import app.zuri.android.domain.inbox.Direction
import app.zuri.android.domain.inbox.ReplyResult
import app.zuri.android.domain.inbox.ReplySender
import app.zuri.android.domain.inbox.SentFromZuri
import app.zuri.android.engine.ingest.parse.ChatKeys
import app.zuri.android.engine.ingest.parse.ParsedChat
import app.zuri.android.engine.ingest.parse.ParsedMessage
import app.zuri.android.engine.ingest.pipeline.Fingerprints
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine

/**
 * Sends the owner's reply through the source app's notification reply action, then stores it as
 * an outgoing message. The stored message uses the same fingerprint ingest would compute, so when
 * the app re-posts its notification with the reply in it, ingest recognises it and doesn't store it
 * twice.
 */
class NotificationReplySender(
    private val context: Context,
    private val db: ZuriDatabase,
    private val actions: ReplyActions,
    private val clock: Clock,
    private val send: (LiveReply, Intent) -> Unit = { r, i -> r.intent.send(context, 0, i) },
) : ReplySender {

    override fun observeCanReply(id: ConversationId): Flow<Boolean> =
        combine(db.messageDao().observeNotificationKeys(id.value), actions.byKey) { keys, live -> keys.any { it in live } }

    override suspend fun reply(id: ConversationId, text: String, automatic: Boolean): ReplyResult {
        val body = text.trim()
        if (body.isEmpty()) return ReplyResult.Failed("Empty reply")
        val conv = db.conversationDao().byId(id.value) ?: return ReplyResult.NotAvailable
        val live = actions.byKey.value
        // The newest of this chat's notifications that still has a reply button.
        val key = db.messageDao().notificationKeys(id.value).firstOrNull { it in live } ?: return ReplyResult.NotAvailable
        val reply = live.getValue(key)
        try {
            val results = Bundle().apply { reply.inputs.forEach { putCharSequence(it.resultKey, body) } }
            val intent = Intent().also { RemoteInput.addResultsToIntent(reply.inputs, it, results) }
            send(reply, intent)
        } catch (e: PendingIntent.CanceledException) {
            actions.remove(key)
            return ReplyResult.NotAvailable
        } catch (e: RuntimeException) {
            ZuriLog.w("Reply", "send_failed", "error" to e.javaClass.simpleName)
            return ReplyResult.Failed(e.javaClass.simpleName)
        }

        val now = clock.nowMillis()
        val parsed = ParsedMessage(
            chat = ParsedChat(conv.chatKey, conv.title, conv.isGroup), senderKey = ChatKeys.SELF, senderName = null, fromMe = true,
            text = body, placeholder = null, placeholderDetail = null, sentAt = now, exactTime = true,
        )
        db.withTransaction {
            db.messageDao().insert(
                MessageEntity(
                    id = UuidV7.generate(clock), conversationId = conv.id, workspaceId = conv.workspaceId,
                    direction = Direction.OUTGOING.name, senderKey = ChatKeys.SELF, senderName = null, text = body,
                    placeholderKind = null, placeholderDetail = null, sentAt = now, exactTime = true,
                    fingerprint = Fingerprints.of(parsed), sourcePackage = conv.packageName,
                    notificationKey = key, notificationPostedAt = reply.postedAt, capturedAt = now,
                    adapterVersion = if (automatic) SentFromZuri.AUTO_REPLY else SENT_FROM_ZURI, createdAt = now, updatedAt = now,
                ),
            )
            db.conversationDao().touch(conv.id, conv.title, now, 0, now)
            db.conversationDao().markRead(conv.id)
        }
        return ReplyResult.Sent
    }

    companion object {
        /** Adapter version recorded on messages the owner sent from Zuri (no adapter parsed them). */
        const val SENT_FROM_ZURI = SentFromZuri.TAPPED
    }
}
