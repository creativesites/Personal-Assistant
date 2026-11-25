package app.zuri.android.engine.ingest.pipeline

import androidx.room.withTransaction
import app.zuri.android.core.common.Clock
import app.zuri.android.data.local.db.ZuriDatabase
import app.zuri.android.domain.capture.SourceKind

/**
 * Applies retention (ARCHITECTURE.md §5.4): processed raw snapshots expire after [RAW_RETENTION_MS],
 * and each source's messages expire after the user's chosen number of days (none by default).
 */
class RetentionSweeper(private val db: ZuriDatabase, private val clock: Clock) {
    data class Result(val rawDeleted: Int, val messagesDeleted: Int)

    suspend fun sweep(): Result = db.withTransaction {
        val now = clock.nowMillis()
        val rawDeleted = db.captureRawDao().deleteProcessedBefore(now - RAW_RETENTION_MS)
        var messagesDeleted = 0
        for (setting in db.sourceAppDao().all()) {
            val days = setting.retentionDays ?: continue
            val kind = SourceKind.entries.firstOrNull { it.name == setting.kind } ?: continue
            messagesDeleted += db.messageDao().deleteForPackagesBefore(kind.packages.toList(), now - days * DAY_MS)
        }
        if (messagesDeleted > 0) {
            db.conversationDao().deleteEmpty()
            db.conversationDao().recomputeLastMessageAt()
        }
        Result(rawDeleted, messagesDeleted)
    }

    companion object {
        const val DAY_MS = 86_400_000L
        const val RAW_RETENTION_MS = 7 * DAY_MS
    }
}
