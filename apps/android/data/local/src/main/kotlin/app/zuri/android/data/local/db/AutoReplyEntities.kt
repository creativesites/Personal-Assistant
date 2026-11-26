package app.zuri.android.data.local.db

import androidx.room.ColumnInfo
import androidx.room.Dao
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.Insert
import androidx.room.PrimaryKey
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

/**
 * What Zuri did about one incoming message in an auto-reply chat (D-22): sent a reply, held it
 * back for the owner, or skipped it. One row per trigger message; the log the owner can read.
 */
@Entity(
    tableName = "auto_reply_event",
    foreignKeys = [ForeignKey(entity = ConversationEntity::class, parentColumns = ["id"], childColumns = ["conversation_id"], onDelete = ForeignKey.CASCADE)],
    indices = [Index(value = ["conversation_id", "created_at"]), Index("trigger_message_id")],
)
data class AutoReplyEventEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "conversation_id") val conversationId: String,
    @ColumnInfo(name = "trigger_message_id") val triggerMessageId: String,
    /** SENT, HELD, SKIPPED or FAILED. */
    val outcome: String,
    /** Why it was held, skipped or failed (an AutoReplyReason name). */
    val reason: String?,
    /** The reply sent, or the draft held back for the owner. */
    val text: String?,
    @ColumnInfo(name = "created_at") val createdAt: Long,
)

data class AutoReplyTrigger(val conversationId: String, val messageId: String, val createdAt: Long)

@Dao
interface AutoReplyDao {
    @Insert suspend fun insert(event: AutoReplyEventEntity)

    @Query("SELECT EXISTS(SELECT 1 FROM auto_reply_event WHERE trigger_message_id = :messageId)")
    suspend fun handled(messageId: String): Boolean

    @Query("SELECT COUNT(*) FROM auto_reply_event WHERE conversation_id = :conversationId AND outcome = 'SENT' AND created_at >= :since")
    suspend fun sentSince(conversationId: String, since: Long): Int

    @Query("SELECT COUNT(*) FROM auto_reply_event WHERE outcome = 'SENT' AND created_at >= :since")
    suspend fun sentEverywhereSince(since: Long): Int

    @Query("SELECT * FROM auto_reply_event WHERE conversation_id = :conversationId ORDER BY created_at DESC LIMIT :limit")
    fun observe(conversationId: String, limit: Int): Flow<List<AutoReplyEventEntity>>
}
