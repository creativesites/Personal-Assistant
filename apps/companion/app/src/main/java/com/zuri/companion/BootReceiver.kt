package com.zuri.companion

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            Log.d("ZuriBootReceiver", "Boot completed — NotificationListenerService restarts automatically")
            // NotificationListenerService re-binds automatically after reboot
            // if notification access is granted; no explicit start needed.
        }
    }
}
