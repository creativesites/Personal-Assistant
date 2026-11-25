package app.zuri.android.engine.ingest.platform

import android.content.ComponentName
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import app.zuri.android.engine.ingest.pipeline.IngestPipeline
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

/**
 * Zuri's NotificationListenerService. It never reads a notification from a source the user hasn't
 * enabled, never posts or dismisses anything, and never replies (D-11).
 */
@AndroidEntryPoint
class ZuriNotificationListener : NotificationListenerService() {
    @Inject lateinit var pipeline: IngestPipeline
    @Inject lateinit var connection: ListenerConnection

    override fun onListenerConnected() {
        connection.set(true)
        pipeline.start()
        pipeline.kick()
    }

    override fun onListenerDisconnected() {
        connection.set(false)
        // Ask to be bound again; some OEMs and app updates unbind listeners (ARCHITECTURE.md §5.6).
        requestRebind(ComponentName(this, ZuriNotificationListener::class.java))
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        if (sbn.packageName == packageName) return
        pipeline.onPosted(sbn)
    }
}
