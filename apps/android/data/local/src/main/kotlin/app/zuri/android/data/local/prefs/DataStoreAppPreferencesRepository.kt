package app.zuri.android.data.local.prefs

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.core.stringSetPreferencesKey
import app.zuri.android.domain.settings.AppPreferences
import app.zuri.android.domain.settings.AppPreferencesRepository
import app.zuri.android.domain.settings.ThemeMode
import app.zuri.android.domain.workspace.WorkspaceId
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

/** Non-sensitive UI preferences. Secrets go to SecretStore, never here. */
class DataStoreAppPreferencesRepository(private val store: DataStore<Preferences>) : AppPreferencesRepository {
    private val theme = stringPreferencesKey("theme_mode")
    private val motion = stringPreferencesKey("motion_speed")
    private val onboarded = booleanPreferencesKey("onboarding_completed")
    private val activeWorkspace = stringPreferencesKey("active_workspace_id")
    private val hybrid = booleanPreferencesKey("hybrid_active")
    private val hybridIds = stringSetPreferencesKey("hybrid_workspace_ids")

    override val preferences: Flow<AppPreferences> = store.data.map { p ->
        AppPreferences(
            themeMode = p[theme]?.let { runCatching { ThemeMode.valueOf(it) }.getOrNull() } ?: ThemeMode.DARK,
            motion = p[motion]?.let { runCatching { app.zuri.android.domain.settings.MotionSpeed.valueOf(it) }.getOrNull() } ?: app.zuri.android.domain.settings.MotionSpeed.COSMIC,
            onboardingCompleted = p[onboarded] ?: false,
            activeWorkspaceId = p[activeWorkspace]?.takeIf { it.isNotBlank() }?.let(::WorkspaceId),
            hybridActive = p[hybrid] ?: false,
            hybridWorkspaceIds = p[hybridIds].orEmpty().filter { it.isNotBlank() }.map(::WorkspaceId).toSet(),
        )
    }

    override suspend fun setThemeMode(mode: ThemeMode) { store.edit { it[theme] = mode.name } }
    override suspend fun setMotion(speed: app.zuri.android.domain.settings.MotionSpeed) { store.edit { it[motion] = speed.name } }
    override suspend fun setOnboardingCompleted(completed: Boolean) { store.edit { it[onboarded] = completed } }
    override suspend fun setActiveWorkspace(id: WorkspaceId) { store.edit { it[activeWorkspace] = id.value; it[hybrid] = false } }
    override suspend fun setHybrid(businesses: Set<WorkspaceId>) {
        store.edit { it[hybridIds] = businesses.map { b -> b.value }.toSet(); it[hybrid] = true }
    }
}
