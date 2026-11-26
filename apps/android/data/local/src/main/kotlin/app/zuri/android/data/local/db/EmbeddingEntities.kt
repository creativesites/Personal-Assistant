package app.zuri.android.data.local.db

import androidx.room.ColumnInfo
import androidx.room.Dao
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Upsert

/**
 * A message's meaning vector for Ask Zuri (EmbeddingGemma, 256 floats, unit length). Deleted with
 * its message; re-made when the message's text changes (its `updated_at` is newer than [createdAt]).
 */
@Entity(
    tableName = "message_embedding",
    foreignKeys = [ForeignKey(entity = MessageEntity::class, parentColumns = ["id"], childColumns = ["message_id"], onDelete = ForeignKey.CASCADE)],
    indices = [Index("workspace_id"), Index("conversation_id")],
)
data class MessageEmbeddingEntity(
    @PrimaryKey @ColumnInfo(name = "message_id") val messageId: String,
    @ColumnInfo(name = "workspace_id") val workspaceId: String,
    @ColumnInfo(name = "conversation_id") val conversationId: String,
    @ColumnInfo(name = "model_id") val modelId: String,
    val dim: Int,
    /** Little-endian float32. */
    val vector: ByteArray,
    @ColumnInfo(name = "created_at") val createdAt: Long,
)

/** A message waiting to be embedded. */
data class EmbedCandidate(
    val id: String,
    @ColumnInfo(name = "workspace_id") val workspaceId: String,
    @ColumnInfo(name = "conversation_id") val conversationId: String,
    @ColumnInfo(name = "sender_name") val senderName: String?,
    val direction: String,
    val text: String,
)

data class StoredVector(
    @ColumnInfo(name = "message_id") val messageId: String,
    @ColumnInfo(name = "conversation_id") val conversationId: String,
    val vector: ByteArray,
)

@Dao
interface EmbeddingDao {
    @Upsert
    suspend fun upsert(rows: List<MessageEmbeddingEntity>)

    /** Text messages with no vector from [modelId], or whose text changed since; newest first. */
    @Query(
        """SELECT m.id, m.workspace_id, m.conversation_id, m.sender_name, m.direction, m.text FROM message m
           JOIN conversation c ON c.id = m.conversation_id
           LEFT JOIN message_embedding e ON e.message_id = m.id AND e.model_id = :modelId
           WHERE m.text IS NOT NULL AND length(m.text) >= 3 AND m.deleted_at IS NULL AND c.deleted_at IS NULL
           AND m.sent_at >= :since AND (e.message_id IS NULL OR m.updated_at > e.created_at)
           ORDER BY m.sent_at DESC LIMIT :limit""",
    )
    suspend fun pending(modelId: String, since: Long, limit: Int): List<EmbedCandidate>

    @Query(
        """SELECT COUNT(*) FROM message m JOIN conversation c ON c.id = m.conversation_id
           LEFT JOIN message_embedding e ON e.message_id = m.id AND e.model_id = :modelId
           WHERE m.text IS NOT NULL AND length(m.text) >= 3 AND m.deleted_at IS NULL AND c.deleted_at IS NULL
           AND m.sent_at >= :since AND (e.message_id IS NULL OR m.updated_at > e.created_at)""",
    )
    suspend fun pendingCount(modelId: String, since: Long): Int

    /** Vectors in the given workspaces only (scope is applied here, before any ranking). */
    @Query(
        """SELECT e.message_id, e.conversation_id, e.vector FROM message_embedding e
           JOIN message m ON m.id = e.message_id
           WHERE e.workspace_id IN (:workspaces) AND e.model_id = :modelId AND m.text IS NOT NULL
           ORDER BY m.sent_at DESC LIMIT :limit""",
    )
    suspend fun vectors(workspaces: List<String>, modelId: String, limit: Int): List<StoredVector>

    @Query("SELECT COUNT(*) FROM message_embedding WHERE model_id = :modelId")
    suspend fun count(modelId: String): Int

    /** Vectors from a model that is no longer installed are useless: free their space. */
    @Query("DELETE FROM message_embedding WHERE model_id != :modelId")
    suspend fun deleteOtherModels(modelId: String): Int
}
