package app.zuri.android.engine.sync

import android.content.Context
import androidx.room.withTransaction
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import app.zuri.android.core.common.ZuriLog
import app.zuri.android.data.local.db.ZuriDatabase
import app.zuri.android.domain.cloud.CloudSync
import app.zuri.android.domain.cloud.CloudSyncStatus
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.components.SingletonComponent
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Sync scheduling (M9 messaging slice): a pull every 15 minutes in the background, every
 * [FOREGROUND_POLL_MILLIS] while the app is open, and on demand. The feed is the source of truth;
 * Socket.io and FCM tickles come later (G7).
 */
class CloudSyncImpl(
    private val context: Context,
    private val runner: SyncRunner,
    private val prefs: SyncPrefs,
    private val media: CloudMediaStore,
    private val db: ZuriDatabase,
) : CloudSync {
    private val work get() = WorkManager.getInstance(context)
    private var foreground: Job? = null

    override val status: Flow<CloudSyncStatus> = combine(prefs.data, runner.running, counts()) { p, running, counts ->
        CloudSyncStatus(
            enabled = prefs.enabledOf(p), running = running != null,
            progress = running?.let { CloudSyncStatus.Progress(it.applied, it.total) },
            lastSuccessAt = prefs.lastSuccessOf(p), lastError = prefs.lastErrorOf(p),
            cloudMessages = counts.first, mediaWifiOnly = prefs.wifiOnlyOf(p), mediaCacheBytes = counts.second, uploadCaptures = prefs.uploadOf(p),
        )
    }

    private fun counts(): Flow<Pair<Int, Long>> = flow {
        while (true) {
            emit(db.cloudSyncDao().cloudMessageCount() to media.bytesStored())
            delay(3_000)
        }
    }

    override suspend fun setEnabled(enabled: Boolean) {
        prefs.setEnabled(enabled)
        if (enabled) { schedule(); syncNow() } else work.cancelUniqueWork(PERIODIC)
    }

    override fun syncNow() {
        work.enqueueUniqueWork(
            NOW, ExistingWorkPolicy.KEEP,
            OneTimeWorkRequestBuilder<SyncWorker>().setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build(),
        )
    }

    override suspend fun loadOlder(conversationId: String): Boolean =
        runCatching { runner.loadOlder(conversationId) }.onFailure { ZuriLog.w("SYNC", "history_failed", "detail" to (it.message ?: "")) }.getOrDefault(false)

    override suspend fun setMediaWifiOnly(wifiOnly: Boolean) { prefs.setWifiOnly(wifiOnly) }
    override suspend fun setUploadCaptures(on: Boolean) { prefs.setUpload(on, System.currentTimeMillis()); if (on) syncNow() }
    override suspend fun clearMediaCache() { media.clear() }

    suspend fun schedule() {
        if (!prefs.enabled()) return
        work.enqueueUniquePeriodicWork(
            PERIODIC, ExistingPeriodicWorkPolicy.KEEP,
            PeriodicWorkRequestBuilder<SyncWorker>(15, TimeUnit.MINUTES)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build(),
        )
    }

    /** While the app is in the foreground, pull often so new messages show up within seconds. */
    fun onForeground(scope: CoroutineScope) {
        foreground?.cancel()
        foreground = scope.launch {
            while (isActive) {
                if (prefs.enabled()) runner.run(deadlineMillis = System.currentTimeMillis() + 120_000)
                delay(FOREGROUND_POLL_MILLIS)
            }
        }
    }

    fun onBackground() { foreground?.cancel(); foreground = null }

    suspend fun onDisconnected() {
        onBackground()
        work.cancelUniqueWork(PERIODIC)
        work.cancelUniqueWork(NOW)
        prefs.clear()
    }

    suspend fun removeCloudData() {
        media.clear()
        java.io.File(context.filesDir, "avatars").deleteRecursively()
        val dao = db.cloudSyncDao()
        db.withTransaction {
            dao.deleteCloudMessages()
            dao.deleteCloudConversations()
            dao.unlinkAll()
            dao.deleteContacts()
            dao.deleteAllPending()
        }
    }

    private companion object {
        const val PERIODIC = "cloud_sync"
        const val NOW = "cloud_sync_now"
        const val FOREGROUND_POLL_MILLIS = 20_000L
    }
}

class SyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    @EntryPoint
    @InstallIn(SingletonComponent::class)
    interface Deps { fun cloudSyncRunner(): SyncRunner; fun cloudAvatarStore(): AvatarStore; fun captureUploader(): CaptureUploader }

    override suspend fun doWork(): Result {
        val deps = EntryPointAccessors.fromApplication(applicationContext, Deps::class.java)
        val runner = deps.cloudSyncRunner()
        // Under WorkManager's 10-minute limit; a first import continues on the next run.
        val r = runner.run(deadlineMillis = System.currentTimeMillis() + 8 * 60_000L)
        // Profile pictures for the most recent chats (only new or changed ones are downloaded).
        if (r.caughtUp) runCatching { deps.cloudAvatarStore().prefetch() }
        // G5: phone captures to the cloud, only if the owner turned it on.
        runCatching { deps.captureUploader().run() }
        ZuriLog.i("SYNC", "worker", "pages" to r.pages, "changes" to r.changes, "caught_up" to r.caughtUp)
        if (!r.caughtUp && r.error == null) {
            WorkManager.getInstance(applicationContext).enqueueUniqueWork(
                "cloud_sync_more", ExistingWorkPolicy.REPLACE,
                OneTimeWorkRequestBuilder<SyncWorker>().setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build(),
            )
        }
        return if (r.error != null && r.error != "off" && r.error != "busy" && r.error != "signed_out") Result.retry() else Result.success()
    }
}
