package app.zuri.android.domain.settings

import app.zuri.android.domain.workspace.WorkspaceId
import kotlinx.coroutines.flow.Flow

/** Light, dark, or follow the system setting. Every screen supports both themes. */
enum class ThemeMode { SYSTEM, LIGHT, DARK }

data class AppPreferences(
    val themeMode: ThemeMode = ThemeMode.SYSTEM,
    val onboardingCompleted: Boolean = false,
    val activeWorkspaceId: WorkspaceId? = null,
    /** Hybrid view (D-04): Personal plus these business workspaces, read together. */
    val hybridActive: Boolean = false,
    val hybridWorkspaceIds: Set<WorkspaceId> = emptySet(),
)

interface AppPreferencesRepository {
    val preferences: Flow<AppPreferences>
    suspend fun setThemeMode(mode: ThemeMode)
    suspend fun setOnboardingCompleted(completed: Boolean)
    /** Switches to one workspace (and leaves Hybrid). */
    suspend fun setActiveWorkspace(id: WorkspaceId)
    /** Switches to Hybrid: Personal plus [businesses]. */
    suspend fun setHybrid(businesses: Set<WorkspaceId>)
}
