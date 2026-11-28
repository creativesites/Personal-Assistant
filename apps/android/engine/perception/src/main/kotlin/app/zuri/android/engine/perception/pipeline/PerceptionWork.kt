package app.zuri.android.engine.perception.pipeline

import android.content.Context
import android.os.PowerManager
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkInfo
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import app.zuri.android.core.common.Clock
import app.zuri.android.core.common.ZuriLog
import app.zuri.android.data.local.db.ZuriDatabase
import app.zuri.android.domain.ai.LocalLanguageModel
import app.zuri.android.domain.memory.PerceptionControls
import app.zuri.android.domain.memory.PerceptionStatus
import app.zuri.android.domain.workspace.WorkspaceId
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.components.SingletonComponent
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

/** One perception run as background work. Stops before WorkManager's 10-minute limit. */
class PerceptionWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    @EntryPoint
    @InstallIn(SingletonComponent::class)
    interface Deps {
        fun runner(): PerceptionRunner
        fun indexer(): app.zuri.android.engine.perception.embed.SemanticIndexer
        fun controls(): AndroidPerceptionControls
        fun relate(): app.zuri.android.engine.perception.relate.RelateEngine
    }

    override suspend fun doWork(): Result {
        val deps = EntryPointAccessors.fromApplication(applicationContext, Deps::class.java)
        // A 2B model on the CPU heats the phone; stop between batches once Android reports severe heat.
        val power = applicationContext.getSystemService(PowerManager::class.java)
        val hot = { power.currentThermalStatus >= PowerManager.THERMAL_STATUS_SEVERE }
        if (hot()) return Result.retry()
        val stats = deps.runner().run(deadlineMillis = System.currentTimeMillis() + RUN_BUDGET_MILLIS, pause = hot)
        ZuriLog.i("PERCEPTION", "run", "batches" to stats.batches, "messages" to stats.messages, "stored" to stats.stored, "early" to stats.stoppedEarly, "hot" to hot())
        // Meaning-based search index: cheap next to perception, and only with an embedding model installed.
        if (stats.failure == null && !hot()) {
            val idx = deps.indexer().run(deadlineMillis = System.currentTimeMillis() + INDEX_BUDGET_MILLIS, pause = hot)
            ZuriLog.i("EMBED", "run", "embedded" to idx.embedded, "early" to idx.stoppedEarly)
        }
        // Relationship health, rhythm and missions (M6): cheap, deterministic, every run.
        runCatching { deps.relate().run() }.onFailure { ZuriLog.w("RELATE", "run_failed", "detail" to (it.message ?: "")) }
        deps.controls().recordRun()
        // A run the owner asked for keeps going until the backlog is read (or the engine fails).
        if (inputData.getBoolean(KEY_NOW, false) && stats.stoppedEarly && stats.failure == null && !hot()) deps.controls().runNow()
        return Result.success()
    }

    companion object {
        const val KEY_NOW = "now"
        const val RUN_BUDGET_MILLIS = 8 * 60_000L
        const val INDEX_BUDGET_MILLIS = 60_000L
    }
}

/**
 * The morning brief (M6 acceptance: built by 07:00 with no network). At 06:30 every day it
 * recomputes relationships and missions so Today is ready when the owner wakes.
 */
class MorningBriefWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val deps = EntryPointAccessors.fromApplication(applicationContext, PerceptionWorker.Deps::class.java)
        val stats = deps.relate().run()
        ZuriLog.i("RELATE", "morning", "people" to stats.people, "missions" to stats.newMissions)
        return Result.success()
    }

    companion object {
        /** Milliseconds from [now] to the next 06:30 local time. */
        fun delayTo0630(now: java.time.ZonedDateTime): Long {
            var next = now.withHour(6).withMinute(30).withSecond(0).withNano(0)
            if (!next.isAfter(now)) next = next.plusDays(1)
            return java.time.Duration.between(now, next).toMillis()
        }
    }
}

class AndroidPerceptionControls(
    private val context: Context,
    private val db: ZuriDatabase,
    private val model: LocalLanguageModel,
    private val store: DataStore<Preferences>,
    private val clock: Clock,
) : PerceptionControls {
    private val chargingKey = booleanPreferencesKey("only_while_charging")
    private val lastRunKey = longPreferencesKey("last_run_at")
    private val work get() = WorkManager.getInstance(context)

    override fun observeStatus(workspace: WorkspaceId): Flow<PerceptionStatus> = combine(
        db.perceptionDao().observeWaiting(workspace.value, clock.nowMillis() - PerceptionRunner.WINDOW_MILLIS),
        store.data,
        work.getWorkInfosFlow(androidx.work.WorkQuery.fromUniqueWorkNames(PERIODIC, NOW)).map { infos -> infos.any { it.state == WorkInfo.State.RUNNING } },
    ) { waiting, prefs, running ->
        PerceptionStatus(model.tier(), waiting, prefs[lastRunKey], running, prefs[chargingKey] ?: false)
    }

    override fun runNow() {
        work.enqueueUniqueWork(NOW, ExistingWorkPolicy.KEEP, OneTimeWorkRequestBuilder<PerceptionWorker>().setInputData(workDataOf(PerceptionWorker.KEY_NOW to true)).build())
    }

    override suspend fun setOnlyWhileCharging(enabled: Boolean) {
        store.edit { it[chargingKey] = enabled }
        schedule(ExistingPeriodicWorkPolicy.UPDATE)
    }

    /** Hourly, when the battery isn't low (and only while charging, if the owner chose that). */
    suspend fun schedule(policy: ExistingPeriodicWorkPolicy = ExistingPeriodicWorkPolicy.KEEP) {
        val charging = store.data.first()[chargingKey] ?: false
        val constraints = Constraints.Builder().setRequiresBatteryNotLow(true).setRequiresCharging(charging).build()
        work.enqueueUniquePeriodicWork(PERIODIC, policy, PeriodicWorkRequestBuilder<PerceptionWorker>(1, TimeUnit.HOURS).setConstraints(constraints).build())
        // No constraints: the brief must be ready by 07:00 even on battery and offline.
        work.enqueueUniquePeriodicWork(
            MORNING, ExistingPeriodicWorkPolicy.UPDATE,
            PeriodicWorkRequestBuilder<MorningBriefWorker>(24, TimeUnit.HOURS)
                .setInitialDelay(MorningBriefWorker.delayTo0630(java.time.ZonedDateTime.now()), TimeUnit.MILLISECONDS).build(),
        )
    }

    internal suspend fun recordRun() = store.edit { it[lastRunKey] = clock.nowMillis() }

    private companion object {
        const val PERIODIC = "perception"
        const val MORNING = "morning_brief"
        const val NOW = "perception_now"
    }
}
