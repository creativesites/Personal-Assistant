package app.zuri.android.data.local.db

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Fts4
import androidx.room.FtsOptions
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * One understood item (M4). [sourceMessageId] is required and cascades: deleting a message deletes
 * everything understood from it, so a deletion leaves nothing derived behind.
 */
@Entity(
    tableName = "memory_item",
    foreignKeys = [
        ForeignKey(entity = ConversationEntity::class, parentColumns = ["id"], childColumns = ["conversation_id"], onDelete = ForeignKey.CASCADE),
        ForeignKey(entity = MessageEntity::class, parentColumns = ["id"], childColumns = ["source_message_id"], onDelete = ForeignKey.CASCADE),
    ],
    indices = [Index(value = ["workspace_id", "status", "review"]), Index("conversation_id"), Index("source_message_id"), Index("due_at")],
)
data class MemoryEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "workspace_id") val workspaceId: String,
    @ColumnInfo(name = "conversation_id") val conversationId: String,
    @ColumnInfo(name = "source_message_id") val sourceMessageId: String,
    /** [app.zuri.android.domain.memory.MemoryKind] name. */
    val kind: String,
    val text: String,
    @ColumnInfo(name = "person_name") val personName: String,
    @ColumnInfo(name = "source_quote") val sourceQuote: String,
    @ColumnInfo(name = "source_sent_at") val sourceSentAt: Long,
    @ColumnInfo(name = "due_at") val dueAt: Long?,
    @ColumnInfo(name = "due_text") val dueText: String?,
    @ColumnInfo(name = "due_has_time") val dueHasTime: Boolean,
    val confidence: Float,
    /** MODEL or RULES. */
    val origin: String,
    /** The model that produced it, when [origin] is MODEL. */
    @ColumnInfo(name = "model_id") val modelId: String?,
    /** OPEN, DONE or DISMISSED. */
    val status: String,
    /** SUGGESTED, CONFIRMED or REJECTED (rejected rows are hidden and kept only as feedback). */
    val review: String,
    @ColumnInfo(name = "created_at") val createdAt: Long,
    @ColumnInfo(name = "updated_at") val updatedAt: Long,
    @ColumnInfo(name = "sync_state") val syncState: String = SyncState.LOCAL_ONLY.name,
)

/** The learning loop: what the owner changed about an understood item. Deleted with the item. */
@Entity(
    tableName = "memory_feedback",
    foreignKeys = [ForeignKey(entity = MemoryEntity::class, parentColumns = ["id"], childColumns = ["memory_id"], onDelete = ForeignKey.CASCADE)],
    indices = [Index("memory_id")],
)
data class MemoryFeedbackEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "memory_id") val memoryId: String,
    /** CONFIRM, EDIT, REJECT, DONE or DISMISS. */
    val action: String,
    val before: String?,
    val after: String?,
    val at: Long,
)

/** Full-text index over message text for Ask Zuri. Room keeps it in step with `message` by triggers. */
@Fts4(contentEntity = MessageEntity::class, tokenizer = FtsOptions.TOKENIZER_UNICODE61)
@Entity(tableName = "message_fts")
data class MessageFtsEntity(val text: String?)
