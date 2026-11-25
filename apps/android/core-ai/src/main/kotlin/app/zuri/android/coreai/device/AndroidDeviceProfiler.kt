package app.zuri.android.coreai.device

import android.app.ActivityManager
import android.content.Context
import android.os.Build
import android.os.StatFs
import app.zuri.android.domain.ai.DeviceProfile

/** Measures what decides model fit: RAM, free storage where models go, ABI, SoC. */
class AndroidDeviceProfiler(private val context: Context) {
    fun profile(): DeviceProfile {
        val ram = runCatching {
            ActivityManager.MemoryInfo().also { context.getSystemService(ActivityManager::class.java).getMemoryInfo(it) }.totalMem
        }.getOrDefault(0L)
        val free = runCatching { StatFs(context.noBackupFilesDir.path).availableBytes }.getOrDefault(0L)
        val soc = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) Build.SOC_MODEL.takeIf { it.isNotBlank() && it != Build.UNKNOWN } else null
        return DeviceProfile(ram, free, Build.SUPPORTED_ABIS.toList(), soc, Build.VERSION.SDK_INT)
    }
}
