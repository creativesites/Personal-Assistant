package app.zuri.android.domain.settings

import app.zuri.android.domain.workspace.WorkspaceId
import kotlinx.coroutines.flow.Flow

/** Light, dark, or follow the system setting. Every screen supports both themes. */
enum class ThemeMode { SYSTEM, LIGHT, DARK }

data class AppPreferences(
    val themeMode: ThemeMode = ThemeMode.SYSTEM,
    val onboardingCompleted: Boolean = false,
    val activeWorkspaceId: WorkspaceId? = null,
)

interface AppPreferencesRepository {
    val preferences: Flow<AppPreferences>
    suspend fun setThemeMode(mode: ThemeMode)
    suspend fun setOnboardingCompleted(completed: Boolean)
    suspend fun setActiveWorkspace(id: WorkspaceId)
}
