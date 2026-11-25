package app.zuri.android.engine.ingest.reply

import android.app.Notification
import android.app.PendingIntent
import android.app.RemoteInput
import android.service.notification.StatusBarNotification
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

/** A source notification's reply button: valid only while that notification is showing. */
class LiveReply(val packageName: String, val intent: PendingIntent, val inputs: Array<RemoteInput>, val postedAt: Long)

/**
 * The reply buttons of notifications currently showing, by notification key. Held in memory only
 * (a PendingIntent can't outlive the notification anyway) and only for sources the owner enabled:
 * the ingest pipeline offers a notification here after its capture gate has passed it.
 */
class ReplyActions {
    private val live = MutableStateFlow<Map<String, LiveReply>>(emptyMap())
    val byKey: StateFlow<Map<String, LiveReply>> = live.asStateFlow()

    fun offer(sbn: StatusBarNotification) {
        val reply = replyActionOf(sbn.notification) ?: return remove(sbn.key)
        live.update { it + (sbn.key to LiveReply(sbn.packageName, reply.actionIntent, reply.remoteInputs, sbn.postTime)) }
    }

    fun remove(key: String) = live.update { it - key }

    internal fun put(key: String, reply: LiveReply) = live.update { it + (key to reply) }

    companion object {
        /** The action that takes free text: the semantic reply action, else the first with a text input. */
        fun replyActionOf(n: Notification): Notification.Action? {
            val withText = n.actions.orEmpty().filter { a -> a.remoteInputs.orEmpty().any { it.allowFreeFormInput } && a.actionIntent != null }
            return withText.firstOrNull { it.semanticAction == Notification.Action.SEMANTIC_ACTION_REPLY } ?: withText.firstOrNull()
        }
    }
}
