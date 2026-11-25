package app.zuri.android

import android.app.Application
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import app.zuri.android.core.security.applock.AppLockController
import app.zuri.android.domain.capture.CaptureStatusProvider
import dagger.hilt.android.HiltAndroidApp
import javax.inject.Inject

@HiltAndroidApp
class ZuriApplication : Application() {
    @Inject lateinit var appLock: AppLockController
    @Inject lateinit var capture: CaptureStatusProvider

    override fun onCreate() {
        super.onCreate()
        // App lock timing follows the whole process, not individual screens.
        ProcessLifecycleOwner.get().lifecycle.addObserver(object : DefaultLifecycleObserver {
            override fun onStop(owner: LifecycleOwner) = appLock.onBackgrounded()
            override fun onStart(owner: LifecycleOwner) {
                appLock.onForegrounded()
                // Re-reads notification access and, when granted, starts ingest (picks up pending captures).
                capture.refresh()
            }
        })
    }
}
