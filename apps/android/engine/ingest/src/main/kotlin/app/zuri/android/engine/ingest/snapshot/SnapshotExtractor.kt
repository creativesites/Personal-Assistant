package app.zuri.android.engine.ingest.snapshot

import android.app.Notification
import android.service.notification.StatusBarNotification
import androidx.core.app.NotificationCompat
import androidx.core.app.Person

/** Copies the readable parts of a notification into a [NotificationSnapshot]. Never throws on odd shapes. */
object SnapshotExtractor {
    /** Bounds stored text so one malformed notification can't bloat the database. */
    private const val MAX_TEXT = 4_000
    private const val MAX_MESSAGES = 50

    fun extract(sbn: StatusBarNotification): NotificationSnapshot =
        extract(sbn.packageName, sbn.key, sbn.postTime, sbn.notification)

    fun extract(packageName: String, key: String, postTime: Long, n: Notification): NotificationSnapshot {
        val extras = n.extras
        fun cs(name: String) = extras?.getCharSequence(name)?.toString()?.take(MAX_TEXT)
        val style = runCatching { NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(n) }.getOrNull()
        val self = style?.user
        val messages = style?.messages.orEmpty().takeLast(MAX_MESSAGES).map { m ->
            val p = m.person
            SnapshotMessage(
                text = m.text?.toString()?.take(MAX_TEXT),
                timestamp = m.timestamp,
                senderName = p?.name?.toString(),
                senderKey = p?.key,
                senderUri = p?.uri,
                fromSelf = p == null || isSamePerson(p, self),
                dataMimeType = m.dataMimeType,
            )
        }
        val lines = extras?.getCharSequenceArray(NotificationCompat.EXTRA_TEXT_LINES)?.map { it.toString().take(MAX_TEXT) }.orEmpty()
        return NotificationSnapshot(
            packageName = packageName,
            key = key,
            postTime = postTime,
            isGroupSummary = n.flags and Notification.FLAG_GROUP_SUMMARY != 0,
            isOngoing = n.flags and Notification.FLAG_ONGOING_EVENT != 0,
            category = n.category,
            title = cs(NotificationCompat.EXTRA_TITLE),
            text = cs(NotificationCompat.EXTRA_TEXT),
            bigText = cs(NotificationCompat.EXTRA_BIG_TEXT),
            subText = cs(NotificationCompat.EXTRA_SUB_TEXT),
            textLines = lines.take(MAX_MESSAGES),
            conversationTitle = style?.conversationTitle?.toString(),
            isGroupConversation = style?.isGroupConversation == true,
            shortcutId = n.shortcutId,
            selfName = self?.name?.toString(),
            messages = messages,
            hasReplyAction = n.actions.orEmpty().any { !it.remoteInputs.isNullOrEmpty() },
        )
    }

    private fun isSamePerson(p: Person, self: Person?): Boolean {
        if (self == null) return false
        if (p.key != null && p.key == self.key) return true
        return p.key == null && self.key == null && p.uri == null && p.name != null && p.name.toString() == self.name?.toString()
    }
}
