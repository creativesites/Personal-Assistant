package app.zuri.android.domain.memory

import app.zuri.android.domain.inbox.ConversationId
import app.zuri.android.domain.inbox.MessageId
import app.zuri.android.domain.workspace.WorkspaceId
import kotlinx.coroutines.flow.Flow

/** What Zuri understood from a message (M4 perception). */
enum class MemoryKind {
    /** Something the owner said they would do. */
    MY_PROMISE,
    /** Something the other person said they would do. */
    THEIR_PROMISE,
    /** Something the other person asked the owner to do. */
    REQUEST_TO_ME,
    /** A meeting, appointment or occasion with a time. */
    EVENT,
    /** A lasting fact about the person ("Chanda's daughter starts school in January"). */
    FACT,
}

enum class MemoryStatus { OPEN, DONE, DISMISSED }

/** SUGGESTED until the owner confirms it; rejected items are kept only as feedback, never shown. */
enum class MemoryReview { SUGGESTED, CONFIRMED }

/** How it was found: the on-device model, or the Essential-tier rules. */
enum class MemoryOrigin { MODEL, RULES }

@JvmInline value class MemoryId(val value: String)

/**
 * One understood item. Every item points at the message it came from ([sourceMessageId] is required
 * and the row is deleted with its message), and carries the exact words it rests on ([sourceQuote]).
 */
data class MemoryItem(
    val id: MemoryId,
    val kind: MemoryKind,
    val text: String,
    val personName: String,
    val conversationId: ConversationId,
    val sourceMessageId: MessageId,
    val sourceQuote: String,
    val sourceSentAtMillis: Long,
    val dueAtMillis: Long?,
    /** The words the due date came from, kept when they couldn't be turned into a date. */
    val dueText: String?,
    val dueHasTime: Boolean,
    /** 0..1, from how well the item is grounded in its source (see engine/perception Grounding). */
    val confidence: Float,
    val origin: MemoryOrigin,
    val status: MemoryStatus,
    val review: MemoryReview,
    val createdAtMillis: Long,
)

data class MemoryFilter(
    val kinds: Set<MemoryKind> = MemoryKind.entries.toSet(),
    val statuses: Set<MemoryStatus> = setOf(MemoryStatus.OPEN),
    val conversation: ConversationId? = null,
)

interface MemoryRepository {
    fun observe(workspaces: Set<WorkspaceId>, filter: MemoryFilter): Flow<List<MemoryItem>>
    fun observe(workspace: WorkspaceId, filter: MemoryFilter): Flow<List<MemoryItem>> = observe(setOf(workspace), filter)
    suspend fun confirm(id: MemoryId)
    suspend fun edit(id: MemoryId, text: String, dueAtMillis: Long?)
    suspend fun setStatus(id: MemoryId, status: MemoryStatus)
    /** Hides the item and records that it was wrong, so extraction can be measured against it. */
    suspend fun reject(id: MemoryId)
    suspend fun delete(id: MemoryId)
}

/** Where understanding stands, for the Memory screen header. */
data class PerceptionStatus(
    val tier: app.zuri.android.domain.ai.AiTier,
    val waitingMessages: Int,
    val lastRunAtMillis: Long?,
    val running: Boolean,
    /** True when the owner asked for understanding to run only while charging. */
    val onlyWhileCharging: Boolean,
)

interface PerceptionControls {
    fun observeStatus(workspace: WorkspaceId): Flow<PerceptionStatus>
    /** Runs understanding now, whatever the charging preference. */
    fun runNow()
    suspend fun setOnlyWhileCharging(enabled: Boolean)
}
