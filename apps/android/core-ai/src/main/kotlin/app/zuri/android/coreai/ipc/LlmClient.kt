package app.zuri.android.coreai.ipc

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.Message
import android.os.Messenger
import android.os.RemoteException
import app.zuri.android.core.common.ZuriLog
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.CancellableContinuation
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeout

/** The engine process ended while a call was running (a crash, or the system reclaimed its memory). */
class EngineStoppedException : Exception("The on-device AI engine stopped")

/** The engine crashed repeatedly; calls are refused for a while so batch work doesn't keep crashing it. */
class EngineUnstableException : Exception("The on-device AI engine keeps stopping; paused for now")

/**
 * The app side of the `:llm` process. Binds on first use, unbinds after [idleMillis] without calls
 * (ending the process and freeing the model's memory), and turns an engine death into an exception
 * for the calls in flight rather than a crash of the app.
 */
class LlmClient(
    private val context: Context,
    private val idleMillis: Long = 90_000,
    private val now: () -> Long = System::currentTimeMillis,
) {
    private val bindLock = Mutex()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val nextId = AtomicInteger()
    private val pending = ConcurrentHashMap<Int, CancellableContinuation<Bundle>>()
    private val replies = Messenger(Handler(Looper.getMainLooper()) { m -> pending.remove(m.arg1)?.resume(Bundle(m.data)); true })

    @Volatile private var messenger: Messenger? = null
    @Volatile private var connection: ServiceConnection? = null
    private var idleJob: Job? = null
    private val deaths = ArrayDeque<Long>()

    /** Engine deaths in the last 10 minutes; at [MAX_DEATHS] calls are refused until they age out. */
    fun recentDeaths(): Int = synchronized(deaths) {
        while (deaths.isNotEmpty() && now() - deaths.first() > DEATH_WINDOW_MILLIS) deaths.removeFirst()
        deaths.size
    }

    suspend fun call(op: Int, args: Bundle): Bundle {
        if (recentDeaths() >= MAX_DEATHS) throw EngineUnstableException()
        val target = connect()
        synchronized(this) { idleJob?.cancel() }
        try {
            return suspendCancellableCoroutine { cont ->
                val id = nextId.incrementAndGet()
                pending[id] = cont
                cont.invokeOnCancellation { pending.remove(id) }
                val msg = Message.obtain(null, op, id, 0).apply { data = args; replyTo = replies }
                try {
                    target.send(msg)
                } catch (e: RemoteException) {
                    pending.remove(id)
                    cont.resumeWithException(EngineStoppedException())
                }
            }
        } finally {
            scheduleIdleUnbind()
        }
    }

    private suspend fun connect(): Messenger = bindLock.withLock {
        messenger ?: withTimeout(BIND_TIMEOUT_MILLIS) { bind() }
    }

    private suspend fun bind(): Messenger = suspendCancellableCoroutine { cont ->
        val conn = object : ServiceConnection {
            override fun onServiceConnected(name: ComponentName, binder: IBinder) {
                val m = Messenger(binder)
                messenger = m
                if (cont.isActive) cont.resume(m)
            }
            override fun onServiceDisconnected(name: ComponentName) = engineDied(this)
            override fun onBindingDied(name: ComponentName) = engineDied(this)
            override fun onNullBinding(name: ComponentName) {
                if (cont.isActive) cont.resumeWithException(EngineStoppedException())
            }
        }
        connection = conn
        val bound = runCatching { context.bindService(Intent(context, LlmService::class.java), conn, Context.BIND_AUTO_CREATE) }.getOrDefault(false)
        if (!bound) {
            connection = null
            cont.resumeWithException(EngineStoppedException())
        }
    }

    /** The `:llm` process died. Fail the calls in flight; the next call starts a fresh process. */
    private fun engineDied(conn: ServiceConnection) {
        if (connection !== conn) return
        synchronized(deaths) { deaths.addLast(now()) }
        ZuriLog.w("AI", "engine_stopped", "in_flight" to pending.size)
        messenger = null
        connection = null
        runCatching { context.unbindService(conn) }
        val inFlight = pending.values.toList()
        pending.clear()
        inFlight.forEach { if (it.isActive) it.resumeWithException(EngineStoppedException()) }
    }

    private fun scheduleIdleUnbind() = synchronized(this) {
        idleJob?.cancel()
        idleJob = scope.launch {
            delay(idleMillis)
            if (pending.isEmpty()) unbind()
        }
    }

    /** Ends the engine process now (frees its memory). */
    fun unbind() {
        val conn = connection ?: return
        connection = null
        messenger = null
        runCatching { context.unbindService(conn) }
    }

    private companion object {
        const val MAX_DEATHS = 3
        const val DEATH_WINDOW_MILLIS = 10 * 60_000L
        const val BIND_TIMEOUT_MILLIS = 15_000L
    }
}
