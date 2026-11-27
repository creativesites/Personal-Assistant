package app.zuri.android.engine.sync

import app.zuri.android.core.common.Clock
import app.zuri.android.core.common.ZuriLog
import app.zuri.android.data.local.db.ZuriDatabase
import app.zuri.android.data.remote.CloudApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * Pulls the change feed after the stored cursor until it is caught up (docs/SYNC_FEED.md). The feed
 * is gap-free and idempotent, so the cursor is saved after every applied page: a run killed half-way
 * resumes where it stopped, and the first import is just the same loop from no cursor.
 */
class SyncRunner(
    private val api: CloudApi,
    private val applier: FeedApplier,
    private val prefs: SyncPrefs,
    private val db: ZuriDatabase,
    private val clock: Clock,
) {
    private val mutex = Mutex()
    private val _running = MutableStateFlow<Progress?>(null)
    /** Non-null while a run is going; total is the server's row count during the first import. */
    val running: StateFlow<Progress?> = _running

    data class Progress(val applied: Long, val total: Long?)
    data class Result(val pages: Int, val changes: Int, val caughtUp: Boolean, val error: String? = null)

    suspend fun run(deadlineMillis: Long = Long.MAX_VALUE): Result {
        if (!prefs.enabled()) return Result(0, 0, caughtUp = false, error = "off")
        if (!mutex.tryLock()) return Result(0, 0, caughtUp = false, error = "busy")
        try {
            var cursor = prefs.cursor()
            val total = if (cursor == null) runCatching { api.state().counts.let { it.messages + it.conversations + it.contacts } }.getOrNull() else null
            var applied = 0L
            var pages = 0
            _running.value = Progress(0, total)
            while (clock.nowMillis() < deadlineMillis) {
                val page = api.changes(cursor, PAGE)
                applier.apply(page.changes)
                pages++
                applied += page.changes.size
                cursor = page.cursor ?: cursor
                prefs.setCursor(cursor)
                _running.value = Progress(applied, total)
                if (!page.hasMore) {
                    prefs.recordSuccess(clock.nowMillis())
                    ZuriLog.i("SYNC", "caught_up", "pages" to pages, "changes" to applied)
                    return Result(pages, applied.toInt(), caughtUp = true)
                }
            }
            return Result(pages, applied.toInt(), caughtUp = false)
        } catch (e: CloudApi.SignedOut) {
            prefs.recordError("Signed out of Zuri cloud")
            return Result(0, 0, caughtUp = false, error = "signed_out")
        } catch (e: Exception) {
            val msg = (e.message ?: e.javaClass.simpleName).take(200)
            ZuriLog.w("SYNC", "run_failed", "detail" to msg)
            prefs.recordError(msg)
            return Result(0, 0, caughtUp = false, error = msg)
        } finally {
            _running.value = null
            mutex.unlock()
        }
    }

    /** One page of older history for a chat. False when the server has no more (or the chat isn't linked). */
    suspend fun loadOlder(conversationId: String): Boolean {
        val conv = db.conversationDao().byId(conversationId) ?: return false
        val remote = conv.remoteId ?: return false
        val oldest = db.cloudSyncDao().oldestCloudMessage(conversationId)
        val before = oldest?.let { "b1.${it.sentAt * 1000}.${it.sortOrder ?: 0}" }
        val page = api.history(remote, before, HISTORY_PAGE)
        applier.applyHistory(page.messages)
        return page.hasMore
    }

    private companion object {
        const val PAGE = 500
        const val HISTORY_PAGE = 100
    }
}
