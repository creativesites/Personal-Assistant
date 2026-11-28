package app.zuri.android.domain.settings

import app.zuri.android.domain.workspace.WorkspaceId
import kotlinx.coroutines.flow.Flow

/** Night sky (dark, the default), daylight sky (light), or follow the system. Every screen supports both. */
enum class ThemeMode { SYSTEM, LIGHT, DARK }

/** How fast the universe moves (MOBILE_UNIVERSE_DESIGN §3.5). Android's "Remove animations" still stops it. */
enum class MotionSpeed { CALM, COSMIC, HYPER }

data class AppPreferences(
    val themeMode: ThemeMode = ThemeMode.DARK,
    val motion: MotionSpeed = MotionSpeed.COSMIC,
    val onboardingCompleted: Boolean = false,
    val activeWorkspaceId: WorkspaceId? = null,
    /** Hybrid view (D-04): Personal plus these business workspaces, read together. */
    val hybridActive: Boolean = false,
    val hybridWorkspaceIds: Set<WorkspaceId> = emptySet(),
)

interface AppPreferencesRepository {
    val preferences: Flow<AppPreferences>
    suspend fun setThemeMode(mode: ThemeMode)
    suspend fun setMotion(speed: MotionSpeed)
    suspend fun setOnboardingCompleted(completed: Boolean)
    /** Switches to one workspace (and leaves Hybrid). */
    suspend fun setActiveWorkspace(id: WorkspaceId)
    /** Switches to Hybrid: Personal plus [businesses]. */
    suspend fun setHybrid(businesses: Set<WorkspaceId>)
}
