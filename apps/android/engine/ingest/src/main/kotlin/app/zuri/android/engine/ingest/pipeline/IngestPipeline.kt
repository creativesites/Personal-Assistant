package app.zuri.android.engine.ingest.pipeline

import android.service.notification.StatusBarNotification
import app.zuri.android.core.common.Clock
import app.zuri.android.core.common.UuidV7
import app.zuri.android.core.common.ZuriLog
import app.zuri.android.data.local.db.CaptureRawEntity
import app.zuri.android.data.local.db.ZuriDatabase
import app.zuri.android.domain.capture.SourceKind
import app.zuri.android.domain.capture.SourceSettingsRepository
import app.zuri.android.engine.ingest.parse.Adapters
import app.zuri.android.engine.ingest.snapshot.NotificationSnapshot
import app.zuri.android.engine.ingest.snapshot.SnapshotExtractor
import java.util.concurrent.atomic.AtomicBoolean
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

/** Which packages may be read right now. Anything else is dropped before its extras are touched. */
data class CaptureGate(val allowedPackages: Set<String>, val paused: Boolean) {
    fun allows(pkg: String) = !paused && pkg in allowedPackages
}

/**
 * The capture side of ARCHITECTURE.md §5.1.
 * - [onPosted] runs on the listener's main thread and only reads an in-memory gate (budget < 5 ms).
 * - Snapshotting and the `capture_raw` insert happen on a background dispatcher.
 * - A single conflated consumer then drains pending rows through [IngestProcessor]. Conflation is
 *   the debounce: a burst of notifications triggers one pass, never a queue of passes.
 *
 * Ingest runs in-process instead of as WorkManager work (a plan deviation): the bound listener keeps
 * the process alive, the work needs no model, and rows left PENDING by a killed process are picked
 * up on the next start. Retention runs at most every [MAINTENANCE_INTERVAL_MS], piggybacking on ingest.
 */
@Singleton
class IngestPipeline internal constructor(
    private val database: dagger.Lazy<ZuriDatabase>,
    private val settings: SourceSettingsRepository,
    private val clock: Clock,
    dispatcher: CoroutineDispatcher,
) {
    @Inject constructor(database: dagger.Lazy<ZuriDatabase>, settings: SourceSettingsRepository, clock: Clock) :
        this(database, settings, clock, Dispatchers.IO)

    @OptIn(ExperimentalCoroutinesApi::class)
    private val scope = CoroutineScope(SupervisorJob() + dispatcher.limitedParallelism(1))
    private val wake = Channel<Unit>(Channel.CONFLATED)
    private val started = AtomicBoolean(false)
    private val _gate = MutableStateFlow<CaptureGate?>(null)
    val gate: StateFlow<CaptureGate?> = _gate.asStateFlow()

    private val _lastCaptureAt = MutableStateFlow<Long?>(null)
    val lastCaptureAt: StateFlow<Long?> = _lastCaptureAt.asStateFlow()

    private var lastMaintenanceAt = 0L

    fun start() {
        if (!started.compareAndSet(false, true)) return
        scope.launch {
            combine(settings.settings, settings.paused) { list, paused ->
                CaptureGate(list.filter { it.enabled }.flatMap { it.kind.packages }.toSet(), paused)
            }.collect { _gate.value = it }
        }
        scope.launch {
            for (signal in wake) drain()
        }
        wake.trySend(Unit)
    }

    /** Called for every posted notification. Cheap by design: no I/O on this thread. */
    /** Whether the capture gate currently lets [packageName] through (false until it is known). */
    fun allowsNow(packageName: String): Boolean =
        SourceKind.forPackage(packageName) != null && _gate.value?.allows(packageName) == true

    fun onPosted(sbn: StatusBarNotification) {
        val g = _gate.value
        if (g != null && !g.allows(sbn.packageName)) return
        if (SourceKind.forPackage(sbn.packageName) == null) return
        scope.launch {
            val current = _gate.filterNotNull().first()
            if (!current.allows(sbn.packageName)) return@launch
            val snapshot = runCatching { SnapshotExtractor.extract(sbn) }.getOrElse {
                ZuriLog.w("Ingest", "Snapshot failed", "error" to it.javaClass.simpleName)
                return@launch
            }
            capture(snapshot)
        }
    }

    /** Stores one snapshot as PENDING and wakes the consumer. Also the entry point for tests. */
    suspend fun capture(snapshot: NotificationSnapshot) {
        val now = clock.nowMillis()
        val kind = SourceKind.forPackage(snapshot.packageName) ?: return
        runCatching {
            database.get().captureRawDao().insert(
                CaptureRawEntity(
                    id = UuidV7.generate(clock), packageName = snapshot.packageName, notificationKey = snapshot.key,
                    postedAt = snapshot.postTime, capturedAt = now,
                    payload = IngestProcessor.json.encodeToString(NotificationSnapshot.serializer(), snapshot),
                    adapterVersion = Adapters.forSource(kind).version, state = IngestProcessor.STATE_PENDING,
                ),
            )
        }.onFailure { ZuriLog.w("Ingest", "Could not store a capture", "error" to it.javaClass.simpleName); return }
        _lastCaptureAt.value = now
        wake.trySend(Unit)
    }

    /** Processes anything pending (for example rows left by a killed process). */
    fun kick() {
        wake.trySend(Unit)
    }

    private suspend fun drain() {
        runCatching {
            val db = database.get()
            val stats = IngestProcessor(db, clock).processPending()
            if (stats.snapshots > 0) ZuriLog.i("Ingest", "Processed", "snapshots" to stats.snapshots, "inserted" to stats.inserted, "duplicates" to stats.duplicates)
            val now = clock.nowMillis()
            if (now - lastMaintenanceAt > MAINTENANCE_INTERVAL_MS) {
                lastMaintenanceAt = now
                RetentionSweeper(db, clock).sweep()
            }
        }.onFailure { ZuriLog.w("Ingest", "Ingest pass failed", "error" to it.javaClass.simpleName) }
    }

    companion object {
        const val MAINTENANCE_INTERVAL_MS = 12 * 60 * 60 * 1000L
    }
}
