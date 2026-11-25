package app.zuri.android.engine.ingest.snapshot

import kotlinx.serialization.Serializable

/**
 * The parts of a notification Zuri reads, copied out of the platform objects so they can be stored
 * (as `capture_raw`), replayed in tests (golden fixtures) and reprocessed when an adapter improves.
 * Nothing else from the notification (icons, images, intents) is kept.
 */
@Serializable
data class NotificationSnapshot(
    val packageName: String,
    val key: String,
    val postTime: Long,
    val isGroupSummary: Boolean = false,
    val isOngoing: Boolean = false,
    val category: String? = null,
    val title: String? = null,
    val text: String? = null,
    val bigText: String? = null,
    val subText: String? = null,
    val textLines: List<String> = emptyList(),
    val conversationTitle: String? = null,
    val isGroupConversation: Boolean = false,
    val shortcutId: String? = null,
    val selfName: String? = null,
    val messages: List<SnapshotMessage> = emptyList(),
    val hasReplyAction: Boolean = false,
    val formatVersion: Int = 1,
)

@Serializable
data class SnapshotMessage(
    val text: String?,
    /** The message's own time in epoch millis, or 0 when the app didn't supply one. */
    val timestamp: Long,
    val senderName: String? = null,
    val senderKey: String? = null,
    val senderUri: String? = null,
    val fromSelf: Boolean = false,
    val dataMimeType: String? = null,
)
