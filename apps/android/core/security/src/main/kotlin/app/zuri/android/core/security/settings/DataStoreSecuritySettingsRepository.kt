package app.zuri.android.core.security.settings

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import app.zuri.android.domain.settings.LockTimeout
import app.zuri.android.domain.settings.SecuritySettings
import app.zuri.android.domain.settings.SecuritySettingsRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

class DataStoreSecuritySettingsRepository(private val store: DataStore<Preferences>) : SecuritySettingsRepository {
    private val lockEnabled = booleanPreferencesKey("app_lock_enabled")
    private val lockTimeout = stringPreferencesKey("app_lock_timeout")
    private val blockShots = booleanPreferencesKey("block_screenshots")
    private val defaults = SecuritySettings()

    override val settings: Flow<SecuritySettings> = store.data.map { p ->
        SecuritySettings(
            appLockEnabled = p[lockEnabled] ?: defaults.appLockEnabled,
            lockTimeout = p[lockTimeout]?.let { runCatching { LockTimeout.valueOf(it) }.getOrNull() } ?: defaults.lockTimeout,
            blockScreenshots = p[blockShots] ?: defaults.blockScreenshots,
        )
    }

    override suspend fun setAppLockEnabled(enabled: Boolean) { store.edit { it[lockEnabled] = enabled } }
    override suspend fun setLockTimeout(timeout: LockTimeout) { store.edit { it[lockTimeout] = timeout.name } }
    override suspend fun setBlockScreenshots(block: Boolean) { store.edit { it[blockShots] = block } }
}
