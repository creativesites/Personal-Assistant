package app.zuri.android.data.local.inbox

import androidx.room.withTransaction
import app.zuri.android.core.common.Clock
import app.zuri.android.core.common.UuidV7
import app.zuri.android.data.local.db.CaptureExclusionEntity
import app.zuri.android.data.local.db.CloudJson
import app.zuri.android.domain.inbox.CloudDetail
import app.zuri.android.domain.inbox.DeliveryStatus
import app.zuri.android.domain.inbox.GeoPoint
import app.zuri.android.domain.inbox.MediaKind
import app.zuri.android.domain.inbox.MessageMedia
import app.zuri.android.domain.inbox.QuotedMessage
import app.zuri.android.domain.inbox.Reaction
import app.zuri.android.data.local.db.ConversationRow
import app.zuri.android.data.local.db.MessageEntity
import app.zuri.android.data.local.db.ZuriDatabase
import app.zuri.android.domain.capture.SourceKind
import app.zuri.android.domain.inbox.ConversationDetail
import app.zuri.android.domain.inbox.ConversationId
import app.zuri.android.domain.inbox.ConversationSummary
import app.zuri.android.domain.inbox.Direction
import app.zuri.android.domain.inbox.InboxMessage
import app.zuri.android.domain.inbox.InboxRepository
import app.zuri.android.domain.inbox.MessageId
import app.zuri.android.domain.inbox.PlaceholderKind
import app.zuri.android.domain.inbox.Provenance
import app.zuri.android.domain.workspace.WorkspaceId
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map

/**
 * Deletions are real deletions: rows are removed (with `secure_delete` on), and processed raw
 * snapshots from the same app are discarded too, because they may still hold the deleted text.
 * Snapshots still waiting to be processed are kept so no new message is lost.
 */
class RoomInboxRepository(private val db: ZuriDatabase, private val clock: Clock) : InboxRepository {
    private val conversations = db.conversationDao()
    private val messages = db.messageDao()
    private val raw = db.captureRawDao()

    override fun observeConversations(workspaces: Set<WorkspaceId>): Flow<List<ConversationSummary>> =
        conversations.observeRows(workspaces.map { it.value }).map { rows -> rows.mapNotNull { it.toDomain() } }

    @OptIn(ExperimentalCoroutinesApi::class)
    override fun observeConversation(id: ConversationId): Flow<ConversationDetail?> =
        conversations.observeById(id.value).flatMapLatest { c ->
            if (c == null) flowOf(null) else {
                val kind = SourceKind.entries.firstOrNull { it.name == c.sourceKind } ?: return@flatMapLatest flowOf(null)
                combine(messages.observeFor(c.id), db.captureExclusionDao().observeExcluded(c.packageName, c.chatKey)) { list, excluded ->
                    val last = list.lastOrNull()
                    val summary = ConversationSummary(
                        id = ConversationId(c.id), workspaceId = WorkspaceId(c.workspaceId), source = kind, title = c.title, isGroup = c.isGroup,
                        lastMessageAtMillis = c.lastMessageAt, lastText = last?.text,
                        lastPlaceholder = last?.placeholderKind?.toPlaceholder(), lastSenderName = last?.senderName,
                        lastFromMe = last?.direction == Direction.OUTGOING.name, unreadCount = c.unreadCount, messageCount = list.size,
                    )
                    ConversationDetail(summary, list.let { all ->
                        // Quotes link to the local copy of the quoted message when it is on the phone.
                        val byRemote = all.mapNotNull { m -> m.remoteId?.let { it to m.id } }.toMap()
                        val byWa = all.mapNotNull { m -> m.waId?.let { it to m.id } }.toMap()
                        all.map { it.toDomain(kind) { q -> (q.remoteId?.let(byRemote::get) ?: byWa[q.waId])?.let(::MessageId) } }
                    }, excluded)
                }
            }
        }

    override suspend fun markRead(id: ConversationId) = conversations.markRead(id.value)

    override suspend fun deleteMessage(id: MessageId) {
        db.withTransaction {
            val conversationId = messages.conversationOf(id.value) ?: return@withTransaction
            val c = conversations.byId(conversationId)
            messages.delete(id.value)
            c?.let { raw.deleteProcessedForPackage(it.packageName) }
            conversations.deleteEmpty()
            conversations.recomputeLastMessageAt()
        }
    }

    override suspend fun deleteConversation(id: ConversationId) {
        db.withTransaction {
            val c = conversations.byId(id.value) ?: return@withTransaction
            conversations.delete(c.id)
            raw.deleteProcessedForPackage(c.packageName)
        }
    }

    override suspend fun excludeConversation(id: ConversationId) {
        db.withTransaction {
            val c = conversations.byId(id.value) ?: return@withTransaction
            db.captureExclusionDao().insert(CaptureExclusionEntity(UuidV7.generate(clock), c.packageName, c.chatKey, clock.nowMillis()))
            conversations.delete(c.id)
            raw.deleteProcessedForPackage(c.packageName)
        }
    }

    override suspend fun deleteAllFrom(source: SourceKind): Int = db.withTransaction {
        val packages = source.packages.toList()
        val n = messages.deleteForPackages(packages)
        raw.deleteForPackages(packages)
        conversations.deleteEmpty()
        n
    }

    override suspend fun messageCount(source: SourceKind): Int = messages.countForPackages(source.packages.toList())
}

internal fun String.toPlaceholder(): PlaceholderKind? = runCatching { PlaceholderKind.valueOf(this) }.getOrNull()

private fun ConversationRow.toDomain(): ConversationSummary? {
    val kind = SourceKind.entries.firstOrNull { it.name == sourceKind } ?: return null
    return ConversationSummary(
        id = ConversationId(id), workspaceId = WorkspaceId(workspaceId), source = kind, title = title, isGroup = isGroup, lastMessageAtMillis = lastMessageAt,
        lastText = lastText, lastPlaceholder = lastPlaceholder?.toPlaceholder(), lastSenderName = lastSender,
        lastFromMe = lastDirection == Direction.OUTGOING.name, unreadCount = unreadCount, messageCount = messageCount,
    )
}

private fun MessageEntity.toDomain(kind: SourceKind, localOf: (CloudJson.Quoted) -> MessageId? = { null }) = InboxMessage(
    id = MessageId(id),
    direction = if (direction == Direction.OUTGOING.name) Direction.OUTGOING else Direction.INCOMING,
    senderName = senderName, text = text, placeholder = placeholderKind?.toPlaceholder(), placeholderDetail = placeholderDetail,
    sentAtMillis = sentAt, edited = edited,
    provenance = Provenance(kind, sourcePackage, capturedAt, notificationPostedAt, adapterVersion),
    cloud = if (remoteId == null) null else cloudDetail(localOf),
)

private fun MessageEntity.cloudDetail(localOf: (CloudJson.Quoted) -> MessageId?): CloudDetail = CloudDetail(
    media = CloudJson.media(media)?.let { m ->
        MessageMedia(
            kind = when (m.kind) { "image" -> MediaKind.IMAGE; "video" -> MediaKind.VIDEO; "audio" -> MediaKind.AUDIO; "sticker" -> MediaKind.STICKER; else -> MediaKind.DOCUMENT },
            mime = m.mime, sizeBytes = m.size, width = m.width, height = m.height, seconds = m.seconds, voiceNote = m.voiceNote,
            gif = m.gif, fileName = m.fileName, pageCount = m.pageCount, thumbnailBase64 = m.thumbnail, available = m.available,
        )
    },
    quoted = CloudJson.quoted(quoted)?.let { q ->
        QuotedMessage(
            localId = localOf(q), fromMe = q.fromMe, senderName = q.senderName, text = q.text, deleted = q.deleted,
            placeholder = when (q.type) { "image" -> PlaceholderKind.PHOTO; "video" -> PlaceholderKind.VIDEO; "audio" -> PlaceholderKind.VOICE_NOTE; "document" -> PlaceholderKind.DOCUMENT; "sticker" -> PlaceholderKind.STICKER; "location" -> PlaceholderKind.LOCATION; else -> null },
        )
    },
    reactions = CloudJson.reactions(reactions).map { Reaction(it.emoji, it.fromMe) },
    status = deliveryStatus?.let { s -> runCatching { DeliveryStatus.valueOf(s.uppercase()) }.getOrNull() },
    location = CloudJson.location(location)?.let { GeoPoint(it.lat, it.lng, it.name, it.address) },
    forwarded = forwarded, starred = starred,
)
