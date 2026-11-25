package app.zuri.android.shell

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.zuri.android.core.ui.components.CaptureState
import app.zuri.android.domain.capture.CaptureHealth
import app.zuri.android.domain.capture.CaptureStatusProvider
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

/** The capture dot in every root top bar: green listening, amber needs attention, grey off. */
@HiltViewModel
class CaptureIndicatorViewModel @Inject constructor(capture: CaptureStatusProvider) : ViewModel() {
    val state: StateFlow<CaptureState> = capture.status.map {
        when (it.state) {
            CaptureHealth.LISTENING -> CaptureState.Listening
            CaptureHealth.NEEDS_ACCESS, CaptureHealth.DISCONNECTED -> CaptureState.Degraded
            CaptureHealth.OFF -> CaptureState.Off
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), CaptureState.Off)
}
