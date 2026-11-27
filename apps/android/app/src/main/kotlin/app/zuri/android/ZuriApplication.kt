package app.zuri.android

import androidx.lifecycle.lifecycleScope
import app.zuri.android.data.remote.ClerkAuth
import app.zuri.android.engine.sync.CloudSyncImpl

import android.app.Application
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import app.zuri.android.core.security.applock.AppLockController
import app.zuri.android.domain.capture.CaptureStatusProvider
import dagger.Lazy
import app.zuri.android.engine.perception.autoreply.AndroidAutoReplies
import app.zuri.android.engine.perception.pipeline.AndroidPerceptionControls
import kotlinx.coroutines.DelicateCoroutinesApi
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.launch
import dagger.hilt.android.HiltAndroidApp
import javax.inject.Inject

@HiltAndroidApp
class ZuriApplication : Application() {
    // Lazy: the `:llm` process also creates this Application and must not build app singletons.
    @Inject lateinit var appLock: Lazy<AppLockController>
    @Inject lateinit var capture: Lazy<CaptureStatusProvider>
    @Inject lateinit var perception: Lazy<AndroidPerceptionControls>
    @Inject lateinit var autoReplies: Lazy<AndroidAutoReplies>
    @Inject lateinit var cloudSync: Lazy<CloudSyncImpl>

    override fun onCreate() {
        super.onCreate()
        // The model's process (core-ai LlmService) runs no app code: no lock, no capture, no database.
        if (getProcessName().endsWith(":llm")) return
        // Cloud account (M7): Clerk keeps its own session; Zuri exchanges it for this phone's session.
        ClerkAuth.initialize(this)
        @OptIn(DelicateCoroutinesApi::class)
        GlobalScope.launch { cloudSync.get().schedule() }
        // Hourly understanding of new messages (kept if already scheduled).
        @OptIn(DelicateCoroutinesApi::class)
        GlobalScope.launch { perception.get().schedule() }
        // Auto-replies (D-22): schedule a reply when a new message arrives in a chat that has them on.
        @OptIn(DelicateCoroutinesApi::class)
        autoReplies.get().start(GlobalScope)
        // App lock timing follows the whole process, not individual screens.
        ProcessLifecycleOwner.get().lifecycle.addObserver(object : DefaultLifecycleObserver {
            override fun onStop(owner: LifecycleOwner) {
                appLock.get().onBackgrounded()
                cloudSync.get().onBackground()
            }
            override fun onStart(owner: LifecycleOwner) {
                // While Zuri is open, new cloud messages show up within seconds (D-21).
                cloudSync.get().onForeground(owner.lifecycleScope)
                appLock.get().onForegrounded()
                // Re-reads notification access and, when granted, starts ingest (picks up pending captures).
                capture.get().refresh()
            }
        })
    }
}
