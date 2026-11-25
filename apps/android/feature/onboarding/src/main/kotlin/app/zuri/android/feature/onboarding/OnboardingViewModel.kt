package app.zuri.android.feature.onboarding

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.zuri.android.core.common.ZuriLog
import app.zuri.android.domain.settings.AppPreferencesRepository
import app.zuri.android.domain.workspace.WorkspaceRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

enum class SetupStatus { Idle, Working, Failed }

@HiltViewModel
class OnboardingViewModel @Inject constructor(
    private val preferences: AppPreferencesRepository,
    private val workspaces: WorkspaceRepository,
) : ViewModel() {
    private val _status = MutableStateFlow(SetupStatus.Idle)
    val status: StateFlow<SetupStatus> = _status.asStateFlow()

    /** Local-first start: create the Personal workspace, make it active, finish onboarding. */
    fun startLocally() {
        if (_status.value == SetupStatus.Working) return
        _status.value = SetupStatus.Working
        viewModelScope.launch {
            runCatching {
                val personal = workspaces.ensurePersonal()
                preferences.setActiveWorkspace(personal.id)
                preferences.setOnboardingCompleted(true)
            }.onFailure {
                ZuriLog.e("Onboarding", "local_start_failed", it)
                _status.value = SetupStatus.Failed
            }
        }
    }
}
