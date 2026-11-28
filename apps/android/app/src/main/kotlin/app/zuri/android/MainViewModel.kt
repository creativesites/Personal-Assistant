package app.zuri.android

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.zuri.android.core.common.ZuriLog
import app.zuri.android.core.security.applock.AppLockController
import app.zuri.android.domain.privacy.DeviceAccessInspector
import app.zuri.android.domain.settings.AppPreferencesRepository
import app.zuri.android.domain.settings.SecuritySettingsRepository
import app.zuri.android.domain.settings.ThemeMode
import app.zuri.android.domain.workspace.Workspace
import app.zuri.android.domain.workspace.WorkspaceAccent
import app.zuri.android.domain.workspace.WorkspaceId
import app.zuri.android.domain.workspace.WorkspaceRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

sealed interface AppState {
    data object Loading : AppState
    data object Onboarding : AppState
    data object Locked : AppState
    data class Ready(
        val active: Workspace,
        val workspaces: List<Workspace>,
        val blockScreenshots: Boolean,
        /** Hybrid view: Personal plus [hybridMembers]' businesses, read together. */
        val hybrid: Boolean = false,
        val hybridMembers: List<Workspace> = emptyList(),
    ) : AppState {
        val label: String get() = if (hybrid) hybridMembers.joinToString(" + ") { it.name } else active.name
    }
    data object CannotOpenData : AppState
}

@HiltViewModel
class MainViewModel @Inject constructor(
    private val preferences: AppPreferencesRepository,
    private val workspacesLazy: dagger.Lazy<WorkspaceRepository>,
    private val security: SecuritySettingsRepository,
    private val appLock: AppLockController,
    private val access: DeviceAccessInspector,
    private val activeContext: app.zuri.android.domain.context.ActiveContextProvider,
) : ViewModel() {
    val themeMode: StateFlow<ThemeMode> = preferences.preferences.map { it.themeMode }
        .stateIn(viewModelScope, SharingStarted.Eagerly, ThemeMode.DARK)
    val motion: StateFlow<app.zuri.android.domain.settings.MotionSpeed> = preferences.preferences.map { it.motion }
        .stateIn(viewModelScope, SharingStarted.Eagerly, app.zuri.android.domain.settings.MotionSpeed.COSMIC)

    private val _state = MutableStateFlow<AppState>(AppState.Loading)
    val state: StateFlow<AppState> = _state.asStateFlow()

    private var workspaces: WorkspaceRepository? = null

    init {
        viewModelScope.launch {
            // Opening the encrypted database unwraps its key; failure must be shown, never papered over.
            val repo = try {
                withContext(Dispatchers.IO) { workspacesLazy.get().also { it.ensurePersonal() } }
            } catch (e: Exception) {
                ZuriLog.e("Main", "database_open_failed", e)
                _state.value = AppState.CannotOpenData
                return@launch
            }
            workspaces = repo
            var first = true
            combine(preferences.preferences, repo.observeAll(), security.settings, appLock.locked, activeContext.active) { prefs, all, sec, locked, ctx ->
                if (first) {
                    first = false
                    appLock.updateSettings(sec, access.report().deviceLockConfigured)
                    // Someone still onboarding has nothing to protect yet; don't lock them out mid-setup.
                    if (!prefs.onboardingCompleted) appLock.onAuthenticated()
                } else {
                    appLock.updateSettings(sec, access.report().deviceLockConfigured)
                }
                when {
                    !prefs.onboardingCompleted -> AppState.Onboarding
                    locked -> AppState.Locked
                    all.isEmpty() -> AppState.Loading
                    else -> AppState.Ready(
                        active = ctx?.primary ?: all.firstOrNull { it.id == prefs.activeWorkspaceId } ?: all.first(),
                        workspaces = all,
                        blockScreenshots = sec.blockScreenshots,
                        hybrid = ctx?.hybrid == true,
                        hybridMembers = if (ctx?.hybrid == true) ctx.members else emptyList(),
                    )
                }
            }.collect { _state.value = it }
        }
    }

    fun onUnlocked() = appLock.onAuthenticated()

    fun switchTo(id: WorkspaceId) = viewModelScope.launch { preferences.setActiveWorkspace(id) }

    fun switchToHybrid(businesses: Set<WorkspaceId>) = viewModelScope.launch {
        if (businesses.isEmpty()) return@launch
        preferences.setHybrid(businesses)
    }

    fun createBusiness(name: String, accent: WorkspaceAccent) = viewModelScope.launch {
        val repo = workspaces ?: return@launch
        runCatching { repo.createBusiness(name, accent) }
            .onSuccess { preferences.setActiveWorkspace(it.id) }
            .onFailure { ZuriLog.w("Main", "create_workspace_rejected") }
    }
}
