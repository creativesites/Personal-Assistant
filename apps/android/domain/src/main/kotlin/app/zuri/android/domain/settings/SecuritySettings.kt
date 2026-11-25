package app.zuri.android.domain.settings

import kotlinx.coroutines.flow.Flow

/** How long Zuri may stay in the background before it locks again. */
enum class LockTimeout(val millis: Long?) {
    IMMEDIATELY(0L),
    ONE_MINUTE(60_000L),
    FIVE_MINUTES(5 * 60_000L),
    FIFTEEN_MINUTES(15 * 60_000L),
    /** Lock only on a cold start. */
    ON_RESTART_ONLY(null),
}

/** Defaults are the protective choice for new installs (SECURITY_AND_PRIVACY.md §3.3–3.4). */
data class SecuritySettings(
    val appLockEnabled: Boolean = true,
    val lockTimeout: LockTimeout = LockTimeout.FIVE_MINUTES,
    val blockScreenshots: Boolean = true,
)

interface SecuritySettingsRepository {
    val settings: Flow<SecuritySettings>
    suspend fun setAppLockEnabled(enabled: Boolean)
    suspend fun setLockTimeout(timeout: LockTimeout)
    suspend fun setBlockScreenshots(block: Boolean)
}
