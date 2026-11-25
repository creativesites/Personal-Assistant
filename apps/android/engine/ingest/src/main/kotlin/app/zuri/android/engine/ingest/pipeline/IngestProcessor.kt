package app.zuri.android.engine.ingest.pipeline

import androidx.room.withTransaction
import app.zuri.android.core.common.Clock
import app.zuri.android.core.common.UuidV7
import app.zuri.android.data.local.db.CaptureRawEntity
import app.zuri.android.data.local.db.ConversationEntity
import app.zuri.android.data.local.db.MessageEntity
import app.zuri.android.data.local.db.ZuriDatabase
import app.zuri.android.domain.capture.SourceKind
import app.zuri.android.domain.inbox.Direction
import app.zuri.android.domain.inbox.PlaceholderKind
import app.zuri.android.engine.ingest.parse.Adapters
import app.zuri.android.engine.ingest.parse.ParseResult
import app.zuri.android.engine.ingest.parse.ParsedMessage
import app.zuri.android.engine.ingest.snapshot.NotificationSnapshot
import kotlinx.serialization.json.Json

/** What happened to one batch of raw snapshots; used by tests and the debug log. */
data class IngestStats(
    var snapshots: Int = 0,
    var inserted: Int = 0,
    var duplicates: Int = 0,
    var edited: Int = 0,
    var deletedBySender: Int = 0,
    var excluded: Int = 0,
    var reparsed: Int = 0,
    var skipped: Int = 0,
    var failed: Int = 0,
)

/**
 * Turns pending `capture_raw` rows into conversations and messages (ARCHITECTURE.md §5.1 IngestWorker):
 * parse with the source's adapter, drop excluded conversations, deduplicate, apply edits and
 * deletions, and assign the workspace. Cheap and deterministic: no model runs here.
 *
 * Workspace assignment (until M5's rules): every captured conversation goes to Personal.
 */
class IngestProcessor(private val db: ZuriDatabase, private val clock: Clock) {
    private val raw = db.captureRawDao()
    private val conversations = db.conversationDao()
    private val messages = db.messageDao()
    private val exclusions = db.captureExclusionDao()
    private val workspaces = db.workspaceDao()

    suspend fun processPending(batch: Int = 50): IngestStats {
        val stats = IngestStats()
        // Nothing to attach messages to until onboarding creates Personal; they wait as PENDING.
        if (workspaces.personal() == null) return stats
        while (true) {
            val rows = raw.pending(batch)
            if (rows.isEmpty()) break
            rows.forEach { process(it, stats) }
        }
        return stats
    }

    private suspend fun process(row: CaptureRawEntity, stats: IngestStats) {
        stats.snapshots++
        val now = clock.nowMillis()
        val snapshot = runCatching { json.decodeFromString<NotificationSnapshot>(row.payload) }.getOrElse {
            stats.failed++
            raw.mark(row.id, STATE_FAILED, "unreadable snapshot", now)
            return
        }
        val kind = SourceKind.forPackage(row.packageName)
        if (kind == null) {
            stats.skipped++
            raw.delete(row.id)
            return
        }
        when (val result = Adapters.forSource(kind).parse(snapshot)) {
            is ParseResult.Skipped -> { stats.skipped++; raw.mark(row.id, STATE_SKIPPED, result.reason, now) }
            is ParseResult.Failed -> { stats.failed++; raw.mark(row.id, STATE_FAILED, result.reason, now) }
            is ParseResult.Messages -> db.withTransaction {
                val personal = checkNotNull(workspaces.personal())
                val storeOnly = db.sourceAppDao().all().firstOrNull { it.kind == kind.name }?.storeOnly ?: false
                var keptAny = false
                var excludedAll = true
                for ((chatKey, group) in result.messages.groupBy { it.chat.key }) {
                    if (exclusions.isExcluded(row.packageName, chatKey)) { stats.excluded += group.size; continue }
                    excludedAll = false
                    val conv = conversationFor(personal.id, kind, row.packageName, group.first(), storeOnly, now)
                    var unread = 0
                    var lastAt = 0L
                    for (m in group) {
                        when (apply(conv, m, row, snapshot, now)) {
                            Outcome.INSERTED -> { stats.inserted++; keptAny = true; if (!m.fromMe) unread++ }
                            Outcome.EDITED -> stats.edited++
                            Outcome.DELETED_BY_SENDER -> stats.deletedBySender++
                            Outcome.DUPLICATE -> stats.duplicates++
                            Outcome.REPARSED -> stats.reparsed++
                        }
                        lastAt = maxOf(lastAt, m.sentAt)
                    }
                    conversations.touch(conv.id, group.last().chat.title, lastAt, unread, now)
                }
                if (excludedAll) {
                    // Nothing from an excluded conversation is kept, not even the raw snapshot.
                    raw.delete(row.id)
                } else {
                    raw.mark(row.id, STATE_DONE, if (keptAny) null else "no new messages", now)
                }
            }
        }
    }

    private enum class Outcome { INSERTED, DUPLICATE, EDITED, DELETED_BY_SENDER, REPARSED }

    private suspend fun conversationFor(
        workspaceId: String, kind: SourceKind, pkg: String, m: ParsedMessage, storeOnly: Boolean, now: Long,
    ): ConversationEntity {
        conversations.find(workspaceId, pkg, m.chat.key)?.let { return it }
        val entity = ConversationEntity(
            id = UuidV7.generate(clock), workspaceId = workspaceId, sourceKind = kind.name, packageName = pkg,
            chatKey = m.chat.key, title = m.chat.title, isGroup = m.chat.isGroup,
            analyse = !m.chat.isGroup && !storeOnly,
            lastMessageAt = m.sentAt, unreadCount = 0, createdAt = now, updatedAt = now,
        )
        conversations.insert(entity)
        return entity
    }

    private suspend fun apply(conv: ConversationEntity, m: ParsedMessage, row: CaptureRawEntity, s: NotificationSnapshot, now: Long): Outcome {
        val fingerprint = Fingerprints.of(m)
        if (m.exactTime) {
            val existing = messages.findExact(conv.id, m.senderKey, m.sentAt)
            if (existing != null) return revise(existing, m, fingerprint, row.adapterVersion, now)
        }
        if (messages.anyFingerprint(conv.id, Fingerprints.withNeighbours(m))) return Outcome.DUPLICATE
        messages.insert(
            MessageEntity(
                id = UuidV7.generate(clock), conversationId = conv.id, workspaceId = conv.workspaceId,
                direction = (if (m.fromMe) Direction.OUTGOING else Direction.INCOMING).name,
                senderKey = m.senderKey, senderName = m.senderName, text = m.text,
                placeholderKind = m.placeholder?.name, placeholderDetail = m.placeholderDetail,
                sentAt = m.sentAt, exactTime = m.exactTime, fingerprint = fingerprint,
                sourcePackage = row.packageName, notificationKey = s.key, notificationPostedAt = s.postTime,
                capturedAt = row.capturedAt, adapterVersion = row.adapterVersion, createdAt = now, updatedAt = now,
            ),
        )
        return Outcome.INSERTED
    }

    /**
     * The same sender and exact timestamp as a stored message: unchanged (a re-post), changed (an
     * edit, which keeps the earlier text in the history), or "This message was deleted" (which
     * removes the text and its history: the sender withdrew it).
     */
    private suspend fun revise(existing: MessageEntity, m: ParsedMessage, fingerprint: String, adapterVersion: Int, now: Long): Outcome {
        if (existing.fingerprint == fingerprint) return Outcome.DUPLICATE
        if (adapterVersion > existing.adapterVersion && m.placeholder != PlaceholderKind.DELETED) {
            // A newer reader re-parsed the same notification: an improvement, not a sender edit.
            messages.reparse(existing.id, m.text, m.placeholder?.name, m.placeholderDetail, fingerprint, adapterVersion, now)
            return Outcome.REPARSED
        }
        val history = (existing.editHistory?.let { runCatching { json.decodeFromString<List<String>>(it) }.getOrNull() } ?: emptyList()) +
            listOfNotNull(existing.text)
        val historyJson = if (history.isEmpty()) null else json.encodeToString(history)
        if (m.placeholder == PlaceholderKind.DELETED) {
            // The sender withdrew it: Zuri keeps no copy of the text, including earlier edits.
            messages.revise(existing.id, null, PlaceholderKind.DELETED.name, null, fingerprint, existing.edited, null, now)
            return Outcome.DELETED_BY_SENDER
        }
        if (existing.placeholderKind == PlaceholderKind.DELETED.name) return Outcome.DUPLICATE
        messages.revise(existing.id, m.text, m.placeholder?.name, m.placeholderDetail, fingerprint, true, historyJson, now)
        return Outcome.EDITED
    }

    companion object {
        const val STATE_PENDING = "PENDING"
        const val STATE_DONE = "DONE"
        const val STATE_SKIPPED = "SKIPPED"
        const val STATE_FAILED = "FAILED"
        val json = Json { ignoreUnknownKeys = true; encodeDefaults = false }
    }
}
