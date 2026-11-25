package app.zuri.android.core.security

import app.zuri.android.core.common.Clock
import app.zuri.android.core.security.applock.AppLockController
import app.zuri.android.domain.settings.LockTimeout
import app.zuri.android.domain.settings.SecuritySettings
import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AppLockControllerTest {
    private var now = 0L
    private val controller = AppLockController(Clock { now })

    @Test fun locksOnColdStartWhenEnabled() {
        controller.updateSettings(SecuritySettings(appLockEnabled = true), deviceCanAuthenticate = true)
        assertThat(controller.locked.value).isTrue()
    }

    @Test fun neverLocksWhenDeviceHasNoScreenLock() {
        controller.updateSettings(SecuritySettings(appLockEnabled = true), deviceCanAuthenticate = false)
        assertThat(controller.locked.value).isFalse()
    }

    @Test fun relocksOnlyAfterTimeout() {
        controller.updateSettings(SecuritySettings(lockTimeout = LockTimeout.FIVE_MINUTES), true)
        controller.onAuthenticated()
        controller.onBackgrounded(); now += 4 * 60_000L; controller.onForegrounded()
        assertThat(controller.locked.value).isFalse()
        controller.onBackgrounded(); now += 5 * 60_000L; controller.onForegrounded()
        assertThat(controller.locked.value).isTrue()
    }

    @Test fun restartOnlyNeverRelocksWhileRunning() {
        controller.updateSettings(SecuritySettings(lockTimeout = LockTimeout.ON_RESTART_ONLY), true)
        controller.onAuthenticated()
        controller.onBackgrounded(); now += 24 * 3_600_000L; controller.onForegrounded()
        assertThat(controller.locked.value).isFalse()
    }

    @Test fun disablingAppLockUnlocks() {
        controller.updateSettings(SecuritySettings(appLockEnabled = true), true)
        controller.updateSettings(SecuritySettings(appLockEnabled = false), true)
        assertThat(controller.locked.value).isFalse()
    }
}
