package app.zuri.android.coreai.install

import android.content.Context
import androidx.work.WorkInfo
import androidx.work.WorkManager
import app.zuri.android.coreai.device.AndroidDeviceProfiler
import app.zuri.android.coreai.storage.ModelStorage
import app.zuri.android.domain.ai.DeviceProfile
import app.zuri.android.domain.ai.FailureReason
import app.zuri.android.domain.ai.ModelEntry
import app.zuri.android.domain.ai.ModelLibrary
import app.zuri.android.domain.ai.ModelSpec
import app.zuri.android.domain.ai.ModelState
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.withContext

/** The model library: catalog × what's on disk × what WorkManager is doing. */
class AndroidModelLibrary(
    private val context: Context,
    private val catalog: List<ModelSpec>,
    private val storage: ModelStorage,
    private val profiler: AndroidDeviceProfiler,
) : ModelLibrary {
    private val work get() = WorkManager.getInstance(context)
    private val diskChanged = MutableStateFlow(0)

    override val entries: Flow<List<ModelEntry>> = combine(
        catalog.map { spec -> work.getWorkInfosForUniqueWorkFlow(ModelDownloadWorker.uniqueName(spec.id)) } + diskChanged,
    ) { parts ->
        @Suppress("UNCHECKED_CAST")
        catalog.mapIndexed { i, spec -> ModelEntry(spec, stateOf(spec, (parts[i] as List<WorkInfo>).lastOrNull())) }
    }.flowOn(Dispatchers.IO)

    internal fun stateOf(spec: ModelSpec, info: WorkInfo?): ModelState {
        if (storage.isInstalled(spec)) return ModelState.Installed(spec.sizeBytes)
        val partial = storage.partialBytes(spec)
        return when (info?.state) {
            WorkInfo.State.RUNNING -> when {
                info.progress.getBoolean(ModelDownloadWorker.KEY_VERIFYING, false) -> ModelState.Verifying
                else -> ModelState.Downloading(info.progress.getLong(ModelDownloadWorker.KEY_DONE, partial), spec.sizeBytes)
            }
            WorkInfo.State.ENQUEUED, WorkInfo.State.BLOCKED -> ModelState.Queued(ModelDownloadWorker.TAG_WIFI_ONLY in info.tags)
            WorkInfo.State.FAILED -> ModelState.Failed(
                info.outputData.getString(ModelDownloadWorker.KEY_REASON)?.let { runCatching { FailureReason.valueOf(it) }.getOrNull() } ?: FailureReason.UNKNOWN,
            )
            else -> if (partial > 0) ModelState.Paused(partial, spec.sizeBytes) else ModelState.NotInstalled
        }
    }

    override fun deviceProfile(): DeviceProfile = profiler.profile()

    override fun download(id: String, allowMobileData: Boolean) {
        ModelDownloadWorker.enqueue(context, id, allowMobileData)
    }

    override fun pause(id: String) {
        work.cancelUniqueWork(ModelDownloadWorker.uniqueName(id))
    }

    override suspend fun delete(id: String) {
        val spec = catalog.firstOrNull { it.id == id } ?: return
        work.cancelUniqueWork(ModelDownloadWorker.uniqueName(id))
        withContext(Dispatchers.IO) { storage.delete(spec) }
        work.pruneWork()
        diskChanged.value++
    }
}
