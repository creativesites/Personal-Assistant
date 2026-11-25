package app.zuri.android.feature.models

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.zuri.android.domain.ai.DeviceProfile
import app.zuri.android.domain.ai.ModelEntry
import app.zuri.android.domain.ai.ModelLibrary
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class ModelsState(val loading: Boolean = true, val device: DeviceProfile? = null, val entries: List<ModelEntry> = emptyList())

@HiltViewModel
class ModelsViewModel @Inject constructor(private val library: ModelLibrary) : ViewModel() {
    private val device = MutableStateFlow<DeviceProfile?>(null)

    val state: StateFlow<ModelsState> = combine(library.entries, device) { entries, d ->
        ModelsState(loading = false, device = d, entries = entries)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), ModelsState())

    fun refreshDevice() { device.value = library.deviceProfile() }
    fun download(id: String, allowMobileData: Boolean) { library.download(id, allowMobileData); refreshDevice() }
    fun pause(id: String) = library.pause(id)
    fun delete(id: String) = viewModelScope.launch { library.delete(id); refreshDevice() }
}
