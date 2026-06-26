package com.zuri.companion

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

class ZuriNotificationService : NotificationListenerService() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private lateinit var apiClient: ApiClient
    private lateinit var tokenManager: TokenManager

    override fun onCreate() {
        super.onCreate()
        tokenManager = TokenManager(this)
        apiClient = ApiClient(tokenManager)
        startForeground()
    }

    override fun onDestroy() {
        super.onDestroy()
        scope.cancel()
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val pkg = sbn.packageName
        if (pkg !in WHATSAPP_PACKAGES) return

        val extras = sbn.notification.extras
        val title = extras.getString(Notification.EXTRA_TITLE) ?: return
        val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString() ?: return

        // Skip group summaries and non-message notifications
        if (text.isBlank() || title.isBlank()) return
        if (sbn.notification.flags and Notification.FLAG_GROUP_SUMMARY != 0) return

        // Skip system/template notifications that have no real content
        if (text.length < 2) return

        val timestampMs = sbn.postTime

        Log.d(TAG, "Relaying from $pkg — sender: $title")

        scope.launch {
            apiClient.sendMessage(
                senderName = title,
                message = text,
                timestampMs = timestampMs,
                source = if (pkg == PKG_BUSINESS) "whatsapp_business" else "whatsapp",
            )
        }
    }

    private fun startForeground() {
        val channelId = "zuri_companion"
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(channelId, "Zuri Companion", NotificationManager.IMPORTANCE_LOW)
                .apply { description = "Keeps the notification relay running" }
        )

        val notification = NotificationCompat.Builder(this, channelId)
            .setContentTitle(getString(R.string.app_name))
            .setContentText(getString(R.string.status_active))
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setOngoing(true)
            .build()

        startForeground(NOTIFICATION_ID, notification)
    }

    companion object {
        private const val TAG = "ZuriNotificationService"
        private const val PKG_WHATSAPP = "com.whatsapp"
        private const val PKG_BUSINESS = "com.whatsapp.w4b"
        private val WHATSAPP_PACKAGES = setOf(PKG_WHATSAPP, PKG_BUSINESS)
        private const val NOTIFICATION_ID = 1001
    }
}
