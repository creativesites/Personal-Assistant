package app.zuri.android.engine.ingest.platform

import android.content.ComponentName
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import app.zuri.android.engine.ingest.pipeline.IngestPipeline
import app.zuri.android.engine.ingest.reply.ReplyActions
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

/**
 * Zuri's NotificationListenerService. It never reads a notification from a source the user hasn't
 * enabled, never posts or dismisses anything, and never replies on its own (D-11): it only keeps a
 * live notification's reply button so the owner can reply from Zuri by tapping Send.
 */
@AndroidEntryPoint
class ZuriNotificationListener : NotificationListenerService() {
    @Inject lateinit var pipeline: IngestPipeline
    @Inject lateinit var connection: ListenerConnection
    @Inject lateinit var replies: ReplyActions

    override fun onListenerConnected() {
        connection.set(true)
        pipeline.start()
        pipeline.kick()
        // Messages already waiting in the shade are today's unread ones: take them too (the gate
        // still drops sources that aren't on, and fingerprint dedup makes this safe to repeat).
        runCatching { activeNotifications }.getOrNull()?.forEach { if (it.packageName != packageName) posted(it) }
    }

    override fun onListenerDisconnected() {
        connection.set(false)
        // Ask to be bound again; some OEMs and app updates unbind listeners (ARCHITECTURE.md §5.6).
        requestRebind(ComponentName(this, ZuriNotificationListener::class.java))
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        if (sbn.packageName == packageName) return
        posted(sbn)
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification) = replies.remove(sbn.key)

    private fun posted(sbn: StatusBarNotification) {
        pipeline.onPosted(sbn)
        if (pipeline.allowsNow(sbn.packageName)) replies.offer(sbn)
    }
}
