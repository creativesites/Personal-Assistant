package app.zuri.android.domain.capture

/** The listener's health, read from the platform and from what was actually captured. */
data class CaptureStatus(
    /** The user granted Notification access to Zuri in system settings. */
    val accessGranted: Boolean,
    /** Android has bound the listener in this process (it can drop after updates or on some OEMs). */
    val listenerConnected: Boolean,
    val paused: Boolean,
    val enabledSources: Set<SourceKind>,
    val lastCaptureAtMillis: Long?,
    val capturedToday: Int,
) {
    val state: CaptureHealth
        get() = when {
            enabledSources.isEmpty() || paused -> CaptureHealth.OFF
            !accessGranted -> CaptureHealth.NEEDS_ACCESS
            !listenerConnected -> CaptureHealth.DISCONNECTED
            else -> CaptureHealth.LISTENING
        }

    companion object {
        val Off = CaptureStatus(false, false, false, emptySet(), null, 0)
    }
}

enum class CaptureHealth { OFF, NEEDS_ACCESS, DISCONNECTED, LISTENING }

interface CaptureStatusProvider {
    val status: kotlinx.coroutines.flow.Flow<CaptureStatus>
    /** Re-reads platform state (for example after returning from system settings). */
    fun refresh()
    /** Asks Android to rebind the listener after it was disconnected. */
    fun requestRebind()
}

interface SourceSettingsRepository {
    /** One entry per [SourceKind], in declaration order. */
    val settings: kotlinx.coroutines.flow.Flow<List<SourceSetting>>
    val paused: kotlinx.coroutines.flow.Flow<Boolean>
    suspend fun setEnabled(kind: SourceKind, enabled: Boolean)
    suspend fun setStoreOnly(kind: SourceKind, storeOnly: Boolean)
    suspend fun setRetention(kind: SourceKind, days: Int?)
    suspend fun setPaused(paused: Boolean)
}

/** Platform actions the Sources screen needs; implemented by the ingest engine. */
interface CaptureControls {
    /** Opens Android's Notification access screen for Zuri. */
    fun openAccessSettings()
    /** Opens Zuri's App info page (where sideloaded installs allow restricted settings). */
    fun openAppInfo()
    /** Opens battery optimisation settings, for phones that kill background listeners. */
    fun openBatterySettings()
    fun isBatteryOptimised(): Boolean
    /** Which supported source apps are installed (only these packages are visible to Zuri). */
    fun installedSources(): Set<SourceKind>
}
