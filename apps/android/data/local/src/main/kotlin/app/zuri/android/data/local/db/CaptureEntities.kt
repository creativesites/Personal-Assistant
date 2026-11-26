package app.zuri.android.data.local.db

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

/** One row per supported source (ARCHITECTURE.md §4.3, `source_app`). Device configuration, never synced. */
@Entity(tableName = "source_app")
data class SourceAppEntity(
    /** [app.zuri.android.domain.capture.SourceKind] name. */
    @PrimaryKey val kind: String,
    val enabled: Boolean,
    @ColumnInfo(name = "store_only") val storeOnly: Boolean,
    @ColumnInfo(name = "retention_days") val retentionDays: Int?,
    @ColumnInfo(name = "updated_at") val updatedAt: Long,
)

/**
 * A notification snapshot as it arrived, kept only for the raw retention window (7 days) so it can be
 * reprocessed when an adapter improves. The whole database is SQLCipher-encrypted.
 */
@Entity(tableName = "capture_raw", indices = [Index("state"), Index("captured_at")])
data class CaptureRawEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "package_name") val packageName: String,
    @ColumnInfo(name = "notification_key") val notificationKey: String,
    @ColumnInfo(name = "posted_at") val postedAt: Long,
    @ColumnInfo(name = "captured_at") val capturedAt: Long,
    /** JSON-encoded NotificationSnapshot. */
    val payload: String,
    @ColumnInfo(name = "adapter_version") val adapterVersion: Int,
    /** PENDING, DONE, SKIPPED or FAILED. */
    val state: String,
    val detail: String? = null,
    @ColumnInfo(name = "processed_at") val processedAt: Long? = null,
)

/** A conversation the user excluded: its notifications are dropped before anything is stored. */
@Entity(tableName = "capture_exclusion", indices = [Index(value = ["package_name", "chat_key"], unique = true)])
data class CaptureExclusionEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "package_name") val packageName: String,
    @ColumnInfo(name = "chat_key") val chatKey: String,
    @ColumnInfo(name = "created_at") val createdAt: Long,
)

@Entity(
    tableName = "conversation",
    foreignKeys = [ForeignKey(entity = WorkspaceEntity::class, parentColumns = ["id"], childColumns = ["workspace_id"])],
    indices = [Index(value = ["workspace_id", "package_name", "chat_key"], unique = true), Index("last_message_at")],
)
data class ConversationEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "workspace_id") val workspaceId: String,
    @ColumnInfo(name = "source_kind") val sourceKind: String,
    @ColumnInfo(name = "package_name") val packageName: String,
    @ColumnInfo(name = "chat_key") val chatKey: String,
    val title: String,
    @ColumnInfo(name = "is_group") val isGroup: Boolean,
    /** Groups are stored and shown but not analysed unless the user opts in (Q-13). */
    val analyse: Boolean,
    @ColumnInfo(name = "last_message_at") val lastMessageAt: Long,
    @ColumnInfo(name = "unread_count") val unreadCount: Int,
    @ColumnInfo(name = "created_at") val createdAt: Long,
    @ColumnInfo(name = "updated_at") val updatedAt: Long,
    val origin: String = Origin.DEVICE.name,
    @ColumnInfo(name = "remote_id") val remoteId: String? = null,
    @ColumnInfo(name = "sync_state") val syncState: String = SyncState.LOCAL_ONLY.name,
    @ColumnInfo(name = "deleted_at") val deletedAt: Long? = null,
    /** The owner turned on auto-replies for this chat (D-22). Never for groups. */
    @ColumnInfo(name = "auto_reply", defaultValue = "0") val autoReply: Boolean = false,
)

@Entity(
    tableName = "message",
    foreignKeys = [ForeignKey(entity = ConversationEntity::class, parentColumns = ["id"], childColumns = ["conversation_id"], onDelete = ForeignKey.CASCADE)],
    indices = [
        Index(value = ["conversation_id", "sent_at"]),
        Index(value = ["conversation_id", "fingerprint"]),
        Index(value = ["conversation_id", "sender_key", "sent_at"]),
        Index("source_package"),
    ],
)
data class MessageEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "conversation_id") val conversationId: String,
    @ColumnInfo(name = "workspace_id") val workspaceId: String,
    /** INCOMING or OUTGOING. */
    val direction: String,
    @ColumnInfo(name = "sender_key") val senderKey: String,
    @ColumnInfo(name = "sender_name") val senderName: String?,
    val text: String?,
    @ColumnInfo(name = "placeholder_kind") val placeholderKind: String?,
    @ColumnInfo(name = "placeholder_detail") val placeholderDetail: String?,
    @ColumnInfo(name = "sent_at") val sentAt: Long,
    /** Whether [sentAt] is the message's own timestamp (MessagingStyle) or the notification's post time. */
    @ColumnInfo(name = "exact_time") val exactTime: Boolean,
    val fingerprint: String,
    val edited: Boolean = false,
    /** JSON array of earlier texts, oldest first. */
    @ColumnInfo(name = "edit_history") val editHistory: String? = null,
    @ColumnInfo(name = "source_package") val sourcePackage: String,
    @ColumnInfo(name = "notification_key") val notificationKey: String,
    @ColumnInfo(name = "notification_posted_at") val notificationPostedAt: Long,
    @ColumnInfo(name = "captured_at") val capturedAt: Long,
    @ColumnInfo(name = "adapter_version") val adapterVersion: Int,
    @ColumnInfo(name = "created_at") val createdAt: Long,
    @ColumnInfo(name = "updated_at") val updatedAt: Long,
    val origin: String = Origin.DEVICE.name,
    @ColumnInfo(name = "remote_id") val remoteId: String? = null,
    @ColumnInfo(name = "sync_state") val syncState: String = SyncState.LOCAL_ONLY.name,
    @ColumnInfo(name = "deleted_at") val deletedAt: Long? = null,
    /** When perception last read this message; cleared when its text changes so it is read again. */
    @ColumnInfo(name = "perceived_at") val perceivedAt: Long? = null,
)

/** A conversation row with its latest message, for the Inbox list. */
data class ConversationRow(
    val id: String,
    @ColumnInfo(name = "source_kind") val sourceKind: String,
    val title: String,
    @ColumnInfo(name = "is_group") val isGroup: Boolean,
    @ColumnInfo(name = "last_message_at") val lastMessageAt: Long,
    @ColumnInfo(name = "unread_count") val unreadCount: Int,
    @ColumnInfo(name = "message_count") val messageCount: Int,
    @ColumnInfo(name = "last_text") val lastText: String?,
    @ColumnInfo(name = "last_placeholder") val lastPlaceholder: String?,
    @ColumnInfo(name = "last_sender") val lastSender: String?,
    @ColumnInfo(name = "last_direction") val lastDirection: String?,
)
