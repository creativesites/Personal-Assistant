package app.zuri.android.engine.sync

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first

/** Sync settings and bookkeeping (not secret: the cursor is an opaque position in the feed). */
class SyncPrefs(private val store: DataStore<Preferences>) {
    private val enabledKey = booleanPreferencesKey("enabled")
    private val cursorKey = stringPreferencesKey("cursor")
    private val lastSuccessKey = longPreferencesKey("last_success_at")
    private val lastErrorKey = stringPreferencesKey("last_error")
    private val wifiOnlyKey = booleanPreferencesKey("media_wifi_only")

    val data: Flow<Preferences> get() = store.data

    suspend fun enabled() = store.data.first()[enabledKey] ?: false
    suspend fun setEnabled(on: Boolean) = store.edit { it[enabledKey] = on }
    suspend fun cursor(): String? = store.data.first()[cursorKey]
    suspend fun setCursor(c: String?) = store.edit { if (c == null) it.remove(cursorKey) else it[cursorKey] = c }
    suspend fun recordSuccess(at: Long) = store.edit { it[lastSuccessKey] = at; it.remove(lastErrorKey) }
    suspend fun recordError(msg: String) = store.edit { it[lastErrorKey] = msg }
    suspend fun wifiOnly() = store.data.first()[wifiOnlyKey] ?: true
    suspend fun setWifiOnly(on: Boolean) = store.edit { it[wifiOnlyKey] = on }
    suspend fun clear() = store.edit { it.clear() }

    fun enabledOf(p: Preferences) = p[enabledKey] ?: false
    fun lastSuccessOf(p: Preferences) = p[lastSuccessKey]
    fun lastErrorOf(p: Preferences) = p[lastErrorKey]
    fun wifiOnlyOf(p: Preferences) = p[wifiOnlyKey] ?: true
}
