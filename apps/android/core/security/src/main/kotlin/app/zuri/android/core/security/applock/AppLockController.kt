package app.zuri.android.core.security.applock

import app.zuri.android.core.common.Clock
import app.zuri.android.domain.settings.SecuritySettings
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Decides when the UI is locked. Pure logic: the app feeds it lifecycle events and settings.
 * Locked on a cold start when app lock is on; re-locked when the app returns after the timeout.
 * If the device has no screen lock, the app can't authenticate, so it never locks (and Settings says so).
 */
class AppLockController(private val clock: Clock) {
    private val _locked = MutableStateFlow(false)
    val locked: StateFlow<Boolean> = _locked.asStateFlow()

    private var backgroundedAt: Long? = null
    private var settings: SecuritySettings = SecuritySettings()
    private var deviceCanAuthenticate: Boolean = true
    private var coldStartHandled = false

    fun updateSettings(settings: SecuritySettings, deviceCanAuthenticate: Boolean) {
        this.settings = settings
        this.deviceCanAuthenticate = deviceCanAuthenticate
        if (!coldStartHandled) {
            coldStartHandled = true
            _locked.value = shouldLockAtAll()
        } else if (!shouldLockAtAll()) {
            _locked.value = false
        }
    }

    fun onBackgrounded() {
        backgroundedAt = clock.nowMillis()
    }

    fun onForegrounded() {
        val since = backgroundedAt ?: return
        backgroundedAt = null
        if (!shouldLockAtAll()) return
        val timeout = settings.lockTimeout.millis ?: return // ON_RESTART_ONLY
        if (clock.nowMillis() - since >= timeout) _locked.value = true
    }

    fun onAuthenticated() {
        _locked.value = false
    }

    private fun shouldLockAtAll() = settings.appLockEnabled && deviceCanAuthenticate
}
