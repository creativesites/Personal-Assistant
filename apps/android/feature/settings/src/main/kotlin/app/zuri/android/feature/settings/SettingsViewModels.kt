package app.zuri.android.feature.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.zuri.android.domain.privacy.DeviceAccessInspector
import app.zuri.android.domain.privacy.DeviceAccessReport
import app.zuri.android.domain.privacy.StorageInspector
import app.zuri.android.domain.privacy.StorageReport
import app.zuri.android.domain.settings.AppPreferencesRepository
import app.zuri.android.domain.settings.LockTimeout
import app.zuri.android.domain.settings.SecuritySettings
import app.zuri.android.domain.settings.SecuritySettingsRepository
import app.zuri.android.domain.settings.ThemeMode
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class SettingsState(
    val themeMode: ThemeMode = ThemeMode.DARK,
    val security: SecuritySettings = SecuritySettings(),
    val deviceCanLock: Boolean = true,
    val motion: app.zuri.android.domain.settings.MotionSpeed = app.zuri.android.domain.settings.MotionSpeed.COSMIC,
)

@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val preferences: AppPreferencesRepository,
    private val security: SecuritySettingsRepository,
    private val access: DeviceAccessInspector,
) : ViewModel() {
    val state: StateFlow<SettingsState> = combine(preferences.preferences, security.settings) { p, s ->
        SettingsState(p.themeMode, s, access.report().deviceLockConfigured, motion = p.motion)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), SettingsState())

    fun setTheme(mode: ThemeMode) = viewModelScope.launch { preferences.setThemeMode(mode) }
    fun setMotion(speed: app.zuri.android.domain.settings.MotionSpeed) = viewModelScope.launch { preferences.setMotion(speed) }
    fun setAppLock(enabled: Boolean) = viewModelScope.launch { security.setAppLockEnabled(enabled) }
    fun setTimeout(timeout: LockTimeout) = viewModelScope.launch { security.setLockTimeout(timeout) }
    fun setBlockScreenshots(block: Boolean) = viewModelScope.launch { security.setBlockScreenshots(block) }
}

data class PrivacyState(val storage: StorageReport? = null, val access: DeviceAccessReport? = null)

@HiltViewModel
class PrivacyCenterViewModel @Inject constructor(
    private val storage: StorageInspector,
    private val access: DeviceAccessInspector,
) : ViewModel() {
    private val _state = MutableStateFlow(PrivacyState())
    val state: StateFlow<PrivacyState> = _state.asStateFlow()

    fun refresh() = viewModelScope.launch {
        _state.value = PrivacyState(storage = storage.report(), access = access.report())
    }
}
