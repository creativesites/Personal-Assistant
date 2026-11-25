package app.zuri.android.data.local.capture

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import app.zuri.android.core.common.Clock
import app.zuri.android.data.local.db.SourceAppEntity
import app.zuri.android.data.local.db.ZuriDatabase
import app.zuri.android.domain.capture.SourceKind
import app.zuri.android.domain.capture.SourceSetting
import app.zuri.android.domain.capture.SourceSettingsRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map

/** Every source starts off. Nothing is read from an app until the user turns its source on. */
class RoomSourceSettingsRepository(
    db: ZuriDatabase,
    private val prefs: DataStore<Preferences>,
    private val clock: Clock,
) : SourceSettingsRepository {
    private val dao = db.sourceAppDao()
    private val pausedKey = booleanPreferencesKey("capture_paused")

    override val settings: Flow<List<SourceSetting>> = dao.observeAll().map { rows ->
        val byKind = rows.associateBy { it.kind }
        SourceKind.entries.map { kind -> byKind[kind.name]?.toDomain(kind) ?: SourceSetting(kind) }
    }.distinctUntilChanged()

    override val paused: Flow<Boolean> = prefs.data.map { it[pausedKey] ?: false }.distinctUntilChanged()

    override suspend fun setEnabled(kind: SourceKind, enabled: Boolean) = update(kind) { it.copy(enabled = enabled) }
    override suspend fun setStoreOnly(kind: SourceKind, storeOnly: Boolean) = update(kind) { it.copy(storeOnly = storeOnly) }
    override suspend fun setRetention(kind: SourceKind, days: Int?) = update(kind) {
        require(days == null || days > 0) { "Retention must be positive" }
        it.copy(retentionDays = days)
    }

    override suspend fun setPaused(paused: Boolean) { prefs.edit { it[pausedKey] = paused } }

    private suspend fun update(kind: SourceKind, change: (SourceSetting) -> SourceSetting) {
        val current = dao.all().firstOrNull { it.kind == kind.name }?.toDomain(kind) ?: SourceSetting(kind)
        val next = change(current)
        dao.upsert(SourceAppEntity(kind.name, next.enabled, next.storeOnly, next.retentionDays, clock.nowMillis()))
    }
}

private fun SourceAppEntity.toDomain(kind: SourceKind) = SourceSetting(kind, enabled, storeOnly, retentionDays)
