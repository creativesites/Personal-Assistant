package app.zuri.android.data.local.memory

import androidx.room.withTransaction
import app.zuri.android.core.common.Clock
import app.zuri.android.core.common.UuidV7
import app.zuri.android.data.local.db.MemoryEntity
import app.zuri.android.data.local.db.MemoryFeedbackEntity
import app.zuri.android.data.local.db.ZuriDatabase
import app.zuri.android.domain.inbox.ConversationId
import app.zuri.android.domain.inbox.MessageId
import app.zuri.android.domain.memory.MemoryFilter
import app.zuri.android.domain.memory.MemoryId
import app.zuri.android.domain.memory.MemoryItem
import app.zuri.android.domain.memory.MemoryKind
import app.zuri.android.domain.memory.MemoryOrigin
import app.zuri.android.domain.memory.MemoryRepository
import app.zuri.android.domain.memory.MemoryReview
import app.zuri.android.domain.memory.MemoryStatus
import app.zuri.android.domain.workspace.WorkspaceId
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

class RoomMemoryRepository(private val db: ZuriDatabase, private val clock: Clock) : MemoryRepository {
    private val dao = db.memoryDao()

    override fun observe(workspaces: Set<WorkspaceId>, filter: MemoryFilter): Flow<List<MemoryItem>> {
        val kinds = filter.kinds.map { it.name }
        val statuses = filter.statuses.map { it.name }
        val ws = workspaces.map { it.value }
        val rows = filter.conversation?.let { dao.observeIn(ws, it.value, kinds, statuses) }
            ?: dao.observe(ws, kinds, statuses)
        return rows.map { list -> list.mapNotNull { it.toDomain() } }
    }

    override suspend fun confirm(id: MemoryId) = change(id, "CONFIRM", null, null) { dao.setReview(id.value, MemoryReview.CONFIRMED.name, it) }

    override suspend fun edit(id: MemoryId, text: String, dueAtMillis: Long?) {
        val before = dao.byId(id.value) ?: return
        change(id, "EDIT", before.text, text) {
            val keepTime = dueAtMillis != null && dueAtMillis == before.dueAt && before.dueHasTime
            dao.edit(id.value, text.trim(), dueAtMillis, keepTime, it)
        }
    }

    override suspend fun setStatus(id: MemoryId, status: MemoryStatus) =
        change(id, if (status == MemoryStatus.DONE) "DONE" else if (status == MemoryStatus.DISMISSED) "DISMISS" else "REOPEN", null, null) {
            dao.setStatus(id.value, status.name, it)
        }

    override suspend fun reject(id: MemoryId) = change(id, "REJECT", null, null) { dao.setReview(id.value, "REJECTED", it) }

    override suspend fun delete(id: MemoryId) = dao.delete(id.value)

    private suspend fun change(id: MemoryId, action: String, before: String?, after: String?, apply: suspend (Long) -> Unit) {
        val now = clock.nowMillis()
        db.withTransaction {
            apply(now)
            if (dao.byId(id.value) != null) dao.insertFeedback(MemoryFeedbackEntity(UuidV7.generate(clock), id.value, action, before, after, now))
        }
    }
}

internal fun MemoryEntity.toDomain(): MemoryItem? {
    val kind = MemoryKind.entries.firstOrNull { it.name == kind } ?: return null
    return MemoryItem(
        id = MemoryId(id), kind = kind, text = text, personName = personName,
        conversationId = ConversationId(conversationId), sourceMessageId = MessageId(sourceMessageId),
        sourceQuote = sourceQuote, sourceSentAtMillis = sourceSentAt,
        dueAtMillis = dueAt, dueText = dueText, dueHasTime = dueHasTime, confidence = confidence,
        origin = if (origin == MemoryOrigin.MODEL.name) MemoryOrigin.MODEL else MemoryOrigin.RULES,
        status = MemoryStatus.entries.firstOrNull { it.name == status } ?: MemoryStatus.OPEN,
        review = if (review == MemoryReview.CONFIRMED.name) MemoryReview.CONFIRMED else MemoryReview.SUGGESTED,
        createdAtMillis = createdAt,
    )
}
