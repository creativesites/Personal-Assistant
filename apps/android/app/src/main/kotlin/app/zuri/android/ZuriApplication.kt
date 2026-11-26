package app.zuri.android

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

    override fun onCreate() {
        super.onCreate()
        // The model's process (core-ai LlmService) runs no app code: no lock, no capture, no database.
        if (getProcessName().endsWith(":llm")) return
        // Hourly understanding of new messages (kept if already scheduled).
        @OptIn(DelicateCoroutinesApi::class)
        GlobalScope.launch { perception.get().schedule() }
        // Auto-replies (D-22): schedule a reply when a new message arrives in a chat that has them on.
        @OptIn(DelicateCoroutinesApi::class)
        autoReplies.get().start(GlobalScope)
        // App lock timing follows the whole process, not individual screens.
        ProcessLifecycleOwner.get().lifecycle.addObserver(object : DefaultLifecycleObserver {
            override fun onStop(owner: LifecycleOwner) = appLock.get().onBackgrounded()
            override fun onStart(owner: LifecycleOwner) {
                appLock.get().onForegrounded()
                // Re-reads notification access and, when granted, starts ingest (picks up pending captures).
                capture.get().refresh()
            }
        })
    }
}
