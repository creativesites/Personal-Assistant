package app.zuri.android.coreai.install

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.ServiceInfo
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.ForegroundInfo
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import app.zuri.android.coreai.R
import app.zuri.android.domain.ai.FailureReason
import app.zuri.android.domain.ai.ModelSpec
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.components.SingletonComponent
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.runBlocking

/**
 * One model download as background work (from MeetingMind's ModelDownloadWorker). It keeps going
 * when the person leaves the app, waits for Wi-Fi when asked to, resumes from the partial file on
 * every attempt, and shows a progress notification with Pause. Pausing is cancelling the work.
 */
class ModelDownloadWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    @EntryPoint
    @InstallIn(SingletonComponent::class)
    interface Deps {
        fun installer(): ModelInstaller
        fun catalog(): List<@JvmSuppressWildcards ModelSpec>
    }

    private val deps by lazy { EntryPointAccessors.fromApplication(applicationContext, Deps::class.java) }
    private val spec: ModelSpec? get() = deps.catalog().firstOrNull { it.id == inputData.getString(KEY_ID) }

    override suspend fun doWork(): Result {
        val spec = spec ?: return Result.failure(workDataOf(KEY_REASON to FailureReason.UNKNOWN.name))
        // Android 12+ refuses a foreground start from the background; the work still runs then.
        runCatching { setForeground(foregroundInfo(spec, 0, spec.sizeBytes)) }
        var last = 0L
        val result = deps.installer().install(
            spec,
            onProgress = { done, total ->
                val now = System.currentTimeMillis()
                if (now - last >= 700) {
                    last = now
                    runBlocking {
                        runCatching { setProgress(workDataOf(KEY_DONE to done, KEY_TOTAL to total)) }
                        runCatching { setForeground(foregroundInfo(spec, done, total)) }
                    }
                }
            },
            onVerifying = { runBlocking { runCatching { setProgress(workDataOf(KEY_VERIFYING to true)) } } },
        )
        return when (result) {
            InstallResult.Installed -> Result.success()
            is InstallResult.Failed -> when {
                result.reason == FailureReason.NETWORK && runAttemptCount < MAX_ATTEMPTS -> Result.retry()
                else -> Result.failure(workDataOf(KEY_REASON to result.reason.name))
            }
        }
    }

    override suspend fun getForegroundInfo(): ForegroundInfo = foregroundInfo(spec, 0, spec?.sizeBytes ?: 0)

    private fun foregroundInfo(spec: ModelSpec?, done: Long, total: Long): ForegroundInfo {
        val nm = applicationContext.getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL, applicationContext.getString(R.string.channel_downloads), NotificationManager.IMPORTANCE_LOW)
                    .apply { description = applicationContext.getString(R.string.channel_downloads_desc) },
            )
        }
        val percent = if (total > 0) (done * 100 / total).toInt() else 0
        val n = NotificationCompat.Builder(applicationContext, CHANNEL)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle(applicationContext.getString(R.string.download_title, spec?.name ?: "model"))
            .setProgress(100, percent, total <= 0)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .addAction(0, applicationContext.getString(R.string.download_pause), WorkManager.getInstance(applicationContext).createCancelPendingIntent(id))
            .build()
        val notificationId = 4100 + (spec?.id?.hashCode() ?: 0).mod(500)
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ForegroundInfo(notificationId, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            ForegroundInfo(notificationId, n)
        }
    }

    companion object {
        const val KEY_ID = "id"
        const val KEY_DONE = "done"
        const val KEY_TOTAL = "total"
        const val KEY_VERIFYING = "verifying"
        const val KEY_REASON = "reason"
        const val TAG_WIFI_ONLY = "wifi_only"
        private const val CHANNEL = "model_downloads"
        private const val MAX_ATTEMPTS = 8

        fun uniqueName(id: String) = "model_download_$id"

        fun enqueue(context: Context, id: String, allowMobileData: Boolean) {
            val request = OneTimeWorkRequestBuilder<ModelDownloadWorker>()
                .setInputData(workDataOf(KEY_ID to id))
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(if (allowMobileData) NetworkType.CONNECTED else NetworkType.UNMETERED)
                        .setRequiresStorageNotLow(true)
                        .build(),
                )
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 20, TimeUnit.SECONDS)
                .apply { if (!allowMobileData) addTag(TAG_WIFI_ONLY) }
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork(uniqueName(id), ExistingWorkPolicy.KEEP, request)
        }
    }
}
