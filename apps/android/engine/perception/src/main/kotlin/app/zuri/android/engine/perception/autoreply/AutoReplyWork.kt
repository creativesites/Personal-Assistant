package app.zuri.android.engine.perception.autoreply

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import app.zuri.android.core.common.Clock
import app.zuri.android.data.local.db.ZuriDatabase
import app.zuri.android.domain.inbox.AutoReplies
import app.zuri.android.domain.inbox.AutoReplyEvent
import app.zuri.android.domain.inbox.AutoReplyOutcome
import app.zuri.android.domain.inbox.AutoReplyReason
import app.zuri.android.domain.inbox.AutoReplySettings
import app.zuri.android.domain.inbox.ConversationId
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.components.SingletonComponent
import java.util.concurrent.TimeUnit
import kotlin.random.Random
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

/** Runs one auto-reply once its delay has passed. */
class AutoReplyWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    @EntryPoint
    @InstallIn(SingletonComponent::class)
    interface Deps { fun engine(): AutoReplyEngine }

    override suspend fun doWork(): Result {
        val conv = inputData.getString(KEY_CONVERSATION) ?: return Result.failure()
        val trigger = inputData.getString(KEY_TRIGGER) ?: return Result.failure()
        EntryPointAccessors.fromApplication(applicationContext, Deps::class.java).engine().handle(conv, trigger)
        return Result.success()
    }

    companion object {
        const val KEY_CONVERSATION = "conversation"
        const val KEY_TRIGGER = "trigger"
    }
}

/**
 * Settings, per-chat switches and the log (D-22), and the scheduler: when a new message arrives in
 * an auto-reply chat it schedules a reply after a random delay in the owner's range. A newer
 * message replaces the pending one, so Zuri answers once the other person pauses.
 */
class AndroidAutoReplies(
    private val context: Context,
    private val db: ZuriDatabase,
    private val store: DataStore<Preferences>,
    private val clock: Clock,
    private val random: Random = Random.Default,
) : AutoReplies {
    private val pausedKey = booleanPreferencesKey("paused")
    private val minKey = intPreferencesKey("min_delay_minutes")
    private val maxKey = intPreferencesKey("max_delay_minutes")
    private val scheduled = mutableMapOf<String, String>()

    override val settings: Flow<AutoReplySettings> = store.data.map { p ->
        val d = AutoReplySettings()
        AutoReplySettings(p[pausedKey] ?: d.paused, p[minKey] ?: d.minDelayMinutes, p[maxKey] ?: d.maxDelayMinutes)
    }

    suspend fun current(): AutoReplySettings = settings.first()

    override suspend fun setPaused(paused: Boolean) {
        store.edit { it[pausedKey] = paused }
        if (paused) WorkManager.getInstance(context).cancelAllWorkByTag(TAG)
    }

    override suspend fun setDelay(minMinutes: Int, maxMinutes: Int) {
        val lo = minMinutes.coerceIn(0, AutoReplySettings.MAX_DELAY_MINUTES)
        val hi = maxMinutes.coerceIn(lo, AutoReplySettings.MAX_DELAY_MINUTES)
        store.edit { it[minKey] = lo; it[maxKey] = hi }
    }

    override fun observeEnabled(id: ConversationId): Flow<Boolean> = db.conversationDao().observeById(id.value).map { it?.autoReply == true }

    override suspend fun setEnabled(id: ConversationId, on: Boolean) {
        db.conversationDao().setAutoReply(id.value, on)
        if (!on) WorkManager.getInstance(context).cancelUniqueWork(workName(id.value))
    }

    override fun observeEvents(id: ConversationId): Flow<List<AutoReplyEvent>> = db.autoReplyDao().observe(id.value, 20).map { rows ->
        rows.map { e ->
            AutoReplyEvent(e.createdAt, AutoReplyOutcome.valueOf(e.outcome), e.reason?.let { runCatching { AutoReplyReason.valueOf(it) }.getOrNull() }, e.text)
        }
    }

    /** Watches auto-reply chats for new incoming messages for the life of the app process. */
    fun start(scope: CoroutineScope) = scope.launch {
        db.conversationDao().observeAutoReplyTriggers().collect { triggers ->
            val s = current()
            if (s.paused) return@collect
            val now = clock.nowMillis()
            for (t in triggers) {
                // Only messages that just arrived; never old ones when a chat is first switched on.
                if (now - t.createdAt > FRESH_MILLIS || scheduled[t.conversationId] == t.messageId) continue
                if (db.autoReplyDao().handled(t.messageId)) continue
                scheduled[t.conversationId] = t.messageId
                schedule(t.conversationId, t.messageId, delaySeconds(s))
            }
        }
    }

    internal fun delaySeconds(s: AutoReplySettings): Long {
        val lo = s.minDelayMinutes * 60L
        val hi = s.maxDelayMinutes * 60L
        return if (hi <= lo) lo else random.nextLong(lo, hi + 1)
    }

    private fun schedule(conversationId: String, messageId: String, delaySeconds: Long) {
        val request = OneTimeWorkRequestBuilder<AutoReplyWorker>()
            .setInitialDelay(delaySeconds, TimeUnit.SECONDS)
            .setInputData(workDataOf(AutoReplyWorker.KEY_CONVERSATION to conversationId, AutoReplyWorker.KEY_TRIGGER to messageId))
            .addTag(TAG)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(workName(conversationId), ExistingWorkPolicy.REPLACE, request)
    }

    private fun workName(conversationId: String) = "auto-reply-$conversationId"

    companion object {
        const val TAG = "auto-reply"
        const val FRESH_MILLIS = 15 * 60_000L
    }
}
