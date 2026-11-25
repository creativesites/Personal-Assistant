package app.zuri.android.domain.ai

import kotlinx.coroutines.flow.Flow

/** What an on-device model is for. */
enum class ModelRole { CHAT, EMBEDDING }

/** Model tiers (ARCHITECTURE.md §7): what a phone can realistically run. */
enum class ModelTier { LITE, STANDARD, HIGH }

/**
 * One downloadable model file from the catalog. Size and checksum are the publisher's own values,
 * checked when the catalog was written; a download that doesn't hash to [sha256] is deleted, never used.
 */
data class ModelSpec(
    val id: String,
    val name: String,
    val role: ModelRole,
    val tier: ModelTier,
    val fileName: String,
    val url: String,
    val sha256: String,
    val sizeBytes: Long,
    /** The phone's total RAM below which the model isn't offered as a good fit. */
    val minRamBytes: Long,
    val licence: String,
    val publisher: String,
    val contextTokens: Int?,
    val parameters: String,
)

/** Facts about this phone that decide which models fit, measured at runtime. */
data class DeviceProfile(
    val totalRamBytes: Long,
    val freeStorageBytes: Long,
    val abis: List<String>,
    val socModel: String?,
    val androidSdk: Int,
)

enum class FitVerdict {
    GOOD,
    /** Works, but slowly or with pressure on memory. */
    TIGHT,
    /** Would exceed the memory the system lets one app use (half of total RAM): refused. */
    TOO_LARGE_FOR_MEMORY,
    /** Not enough free storage for the file plus headroom. */
    NOT_ENOUGH_STORAGE,
    UNSUPPORTED_DEVICE,
}

object ModelFit {
    /** Storage left free after a download, so the phone isn't pushed to full. */
    const val STORAGE_HEADROOM_BYTES = 1_000_000_000L

    fun verdict(spec: ModelSpec, device: DeviceProfile, installed: Boolean = false): FitVerdict = when {
        "arm64-v8a" !in device.abis -> FitVerdict.UNSUPPORTED_DEVICE
        device.totalRamBytes > 0 && spec.sizeBytes > device.totalRamBytes / 2 -> FitVerdict.TOO_LARGE_FOR_MEMORY
        !installed && device.freeStorageBytes < spec.sizeBytes + STORAGE_HEADROOM_BYTES -> FitVerdict.NOT_ENOUGH_STORAGE
        device.totalRamBytes in 1 until spec.minRamBytes -> FitVerdict.TIGHT
        else -> FitVerdict.GOOD
    }

    /** Storage the person would need to free before [spec] can be downloaded (0 when it fits). */
    fun storageShortfall(spec: ModelSpec, device: DeviceProfile): Long =
        (spec.sizeBytes + STORAGE_HEADROOM_BYTES - device.freeStorageBytes).coerceAtLeast(0)
}

sealed interface ModelState {
    data object NotInstalled : ModelState
    data class Queued(val waitingForWifi: Boolean) : ModelState
    data class Downloading(val bytesDone: Long, val bytesTotal: Long) : ModelState
    /** Stopped by the person; the partial file stays and the download resumes from it. */
    data class Paused(val bytesDone: Long, val bytesTotal: Long) : ModelState
    data object Verifying : ModelState
    data class Installed(val sizeBytes: Long) : ModelState
    data class Failed(val reason: FailureReason) : ModelState
}

enum class FailureReason { NETWORK, CHECKSUM_MISMATCH, NOT_ENOUGH_STORAGE, UNKNOWN }

data class ModelEntry(val spec: ModelSpec, val state: ModelState)

interface ModelLibrary {
    val entries: Flow<List<ModelEntry>>
    fun deviceProfile(): DeviceProfile
    /** Starts or resumes a download. Nothing is downloaded except by this explicit call. */
    fun download(id: String, allowMobileData: Boolean)
    fun pause(id: String)
    suspend fun delete(id: String)
}
