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
        fun db(): ZuriDatabase
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
        runCatching { postBrief(deps.db()) }.onFailure { ZuriLog.w("RELATE", "brief_failed", "detail" to (it.message ?: "")) }
        return Result.success()
    }

    /** "Your day": what's waiting, only when there is something real (no empty "good morning" pings). */
    private suspend fun postBrief(db: ZuriDatabase) {
        val ctx = applicationContext
        if (ctx.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) return
        val zone = java.time.ZoneId.systemDefault()
        val start = java.time.LocalDate.now(zone).atStartOfDay(zone).toInstant().toEpochMilli()
        val life = db.lifeDao()
        val missions = life.openMissions()
        val due = life.dueBetween(start, start + 86_400_000L)
        if (missions == 0 && due == 0) return
        val parts = buildList {
            if (missions > 0) add(if (missions == 1) "1 person to check in with" else "$missions missions")
            if (due > 0) add(if (due == 1) "1 plan or promise today" else "$due plans and promises today")
        }
        val nm = ctx.getSystemService(android.app.NotificationManager::class.java) ?: return
        nm.createNotificationChannel(android.app.NotificationChannel(CHANNEL, "Morning brief", android.app.NotificationManager.IMPORTANCE_DEFAULT).apply {
            description = "Once a morning, only when something needs you"
        })
        val open = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)?.let {
            android.app.PendingIntent.getActivity(ctx, 0, it, android.app.PendingIntent.FLAG_IMMUTABLE or android.app.PendingIntent.FLAG_UPDATE_CURRENT)
        }
        val n = android.app.Notification.Builder(ctx, CHANNEL)
            .setSmallIcon(ctx.applicationInfo.icon)
            .setContentTitle("Your day")
            .setContentText(parts.joinToString(" · "))
            .setContentIntent(open).setAutoCancel(true)
            // Lock screen shows only that there is a brief, never names (privacy).
            .setVisibility(android.app.Notification.VISIBILITY_PRIVATE)
            .build()
        nm.notify(NOTIFICATION_ID, n)
    }

    companion object {
        const val CHANNEL = "morning_brief"
        const val NOTIFICATION_ID = 7001
        /** Milliseconds from [now] to the next 06:45 local time (recompute, then brief, before 07:00). */
        fun delayTo0700(now: java.time.ZonedDateTime): Long {
            var next = now.withHour(6).withMinute(45).withSecond(0).withNano(0)
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
                .setInitialDelay(MorningBriefWorker.delayTo0700(java.time.ZonedDateTime.now()), TimeUnit.MILLISECONDS).build(),
        )
    }

    internal suspend fun recordRun() = store.edit { it[lastRunKey] = clock.nowMillis() }

    private companion object {
        const val PERIODIC = "perception"
        const val MORNING = "morning_brief"
        const val NOW = "perception_now"
    }
}
