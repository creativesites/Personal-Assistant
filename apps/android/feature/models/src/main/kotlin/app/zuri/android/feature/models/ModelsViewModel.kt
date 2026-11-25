package app.zuri.android.feature.models

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.zuri.android.domain.ai.Benchmark
import app.zuri.android.domain.ai.DeviceProfile
import app.zuri.android.domain.ai.ModelBenchmarks
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

data class ModelsState(
    val loading: Boolean = true,
    val device: DeviceProfile? = null,
    val entries: List<ModelEntry> = emptyList(),
    val benchmarks: Map<String, Benchmark> = emptyMap(),
    val testing: String? = null,
    val testFailed: String? = null,
)

@HiltViewModel
class ModelsViewModel @Inject constructor(private val library: ModelLibrary, private val benchmarks: ModelBenchmarks) : ViewModel() {
    private val device = MutableStateFlow<DeviceProfile?>(null)
    private val testing = MutableStateFlow<Pair<String?, String?>>(null to null)

    val state: StateFlow<ModelsState> = combine(library.entries, device, benchmarks.results, testing) { entries, d, b, t ->
        ModelsState(loading = false, device = d, entries = entries, benchmarks = b, testing = t.first, testFailed = t.second)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), ModelsState())

    fun refreshDevice() { device.value = library.deviceProfile() }
    fun download(id: String, allowMobileData: Boolean) { library.download(id, allowMobileData); refreshDevice() }
    fun pause(id: String) = library.pause(id)

    /** Loads the model and answers one fixed prompt; nothing personal is involved. */
    fun test(id: String) = viewModelScope.launch {
        testing.value = id to null
        val r = benchmarks.run(id)
        testing.value = null to r.exceptionOrNull()?.let { id }
    }
    fun delete(id: String) = viewModelScope.launch { library.delete(id); refreshDevice() }
}
