package app.zuri.android.engine.sync

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import app.zuri.android.core.common.Clock
import app.zuri.android.data.local.db.CloudJson
import app.zuri.android.data.local.db.ConversationEntity
import app.zuri.android.data.local.db.MessageEntity
import app.zuri.android.data.local.db.WorkspaceEntity
import app.zuri.android.data.local.db.ZuriDatabase
import app.zuri.android.data.remote.CloudApi
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Applying the sync feed (docs/SYNC_FEED.md) to a real Room database. All people and text are invented. */
@RunWith(RobolectricTestRunner::class)
class FeedApplierTest {
    private val db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext<Context>(), ZuriDatabase::class.java)
        .allowMainThreadQueries().build()
    private val now = 1_764_070_000_000L
    private val applier = FeedApplier(db, Clock { now })
    private var seq = 100L

    @Before fun personal() = runBlocking {
        db.workspaceDao().insert(WorkspaceEntity("ws-personal", "PERSONAL", "Personal", "TEAL", now, now))
    }

    @After fun close() = db.close()

    private fun obj(s: String): JsonObject = CloudApi.JSON.parseToJsonElement(s).jsonObject
    private fun change(entity: String, id: String, data: String?, op: String = "upsert", at: Long = seq++) =
        CloudApi.Change(at.toString(), entity, op, id, data?.let(::obj))

    private fun contact(id: String, jid: String, name: String, group: Boolean = false) =
        change("contact", id, """{"id":"$id","jid":"$jid","name":"$name","savedName":"$name","isGroup":$group}""")
    private fun conversation(id: String, contactId: String, jid: String, unread: Int = 0) =
        change("conversation", id, """{"id":"$id","contactId":"$contactId","chatJid":"$jid","lastMessageAt":${now - 1000},"unreadCount":$unread}""")
    private fun message(id: String, conv: String, text: String?, ts: Long, fromMe: Boolean = false, order: Int = 1, extra: String = "") =
        change("message", id, """{"id":"$id","conversationId":"$conv","waMessageId":"WA$id","fromMe":$fromMe,"type":"text","text":${text?.let { "\"$it\"" } ?: "null"},"timestamp":$ts,"order":"$order","seq":"1"$extra}""")

    private suspend fun messagesOf(convId: String) = db.messageDao().observeFor(convId).first()

    @Test fun messagesBeforeTheirChatWaitThenLand() = runTest {
        // The feed usually carries a chat's messages before the chat row itself.
        applier.apply(listOf(message("m1", "c1", "Morning!", now - 5000, order = 1), message("m2", "c1", "Are we still on for Friday?", now - 4000, order = 2)))
        assertThat(db.cloudSyncDao().conversationByRemote("c1")).isNull()
        applier.apply(listOf(contact("k1", "260970000001@s.whatsapp.net", "Mwila Banda"), conversation("c1", "k1", "260970000001@s.whatsapp.net", unread = 2)))
        val conv = checkNotNull(db.cloudSyncDao().conversationByRemote("c1"))
        assertThat(conv.title).isEqualTo("Mwila Banda")
        assertThat(conv.workspaceId).isEqualTo("ws-personal")
        assertThat(conv.unreadCount).isEqualTo(2)
        assertThat(messagesOf(conv.id).map { it.text }).containsExactly("Morning!", "Are we still on for Friday?").inOrder()
        assertThat(db.cloudSyncDao().pendingConversations()).isEmpty()
    }

    @Test fun sameSecondMessagesKeepWhatsAppOrder() = runTest {
        applier.apply(listOf(contact("k1", "1@s.whatsapp.net", "Chanda"), conversation("c1", "k1", "1@s.whatsapp.net")))
        // Whole-second WhatsApp times: the arrival order breaks the tie, not the id or seq.
        applier.apply(listOf(message("zz", "c1", "second", now, order = 8), message("aa", "c1", "first", now, order = 7)))
        val conv = checkNotNull(db.cloudSyncDao().conversationByRemote("c1"))
        assertThat(messagesOf(conv.id).map { it.text }).containsExactly("first", "second").inOrder()
    }

    @Test fun groupChatJoinsTheCapturedChatAndReplacesTheCaptureInPlace() = runTest {
        db.conversationDao().insert(
            ConversationEntity("dev-conv", "ws-personal", "WHATSAPP", "com.whatsapp", "s:120363000000@g.us", "Family", true, false, now - 9000, 0, now, now),
        )
        db.messageDao().insert(
            MessageEntity(
                id = "dev-msg", conversationId = "dev-conv", workspaceId = "ws-personal", direction = "INCOMING", senderKey = "n:aunt",
                senderName = "Aunt", text = "Lunch at ours on Sunday", placeholderKind = null, placeholderDetail = null, sentAt = now - 3030,
                exactTime = true, fingerprint = "f1", sourcePackage = "com.whatsapp", notificationKey = "k", notificationPostedAt = now - 3000,
                capturedAt = now - 3000, adapterVersion = 3, createdAt = now - 3000, updatedAt = now - 3000,
            ),
        )
        applier.apply(listOf(
            contact("g1", "120363000000@g.us", "Family", group = true),
            conversation("cg", "g1", "120363000000@g.us"),
            message("gm1", "cg", "Lunch at ours on Sunday", now - 3000, extra = ""","sender":{"jid":"2@s.whatsapp.net","name":"Aunt"},"reactions":[{"emoji":"❤️","fromMe":true,"at":1}]"""),
        ))
        val conv = checkNotNull(db.cloudSyncDao().conversationByRemote("cg"))
        assertThat(conv.id).isEqualTo("dev-conv")
        val msgs = messagesOf("dev-conv")
        assertThat(msgs).hasSize(1)
        // Same row id: memories pointing at the capture stay valid.
        assertThat(msgs.single().id).isEqualTo("dev-msg")
        assertThat(msgs.single().remoteId).isEqualTo("gm1")
        assertThat(msgs.single().sentAt).isEqualTo(now - 3000)
        assertThat(CloudJson.reactions(msgs.single().reactions).single().emoji).isEqualTo("❤️")
    }

    @Test fun deleteForEveryoneKeepsTheBubbleWithoutText_andTombstoneRemoves() = runTest {
        applier.apply(listOf(contact("k1", "1@s.whatsapp.net", "Chanda"), conversation("c1", "k1", "1@s.whatsapp.net"), message("m1", "c1", "oops", now)))
        applier.apply(listOf(change("message", "m1", """{"id":"m1","conversationId":"c1","waMessageId":"WAm1","fromMe":false,"type":"text","text":null,"deleted":true,"timestamp":$now,"order":"1","seq":"9"}""")))
        val conv = checkNotNull(db.cloudSyncDao().conversationByRemote("c1"))
        assertThat(messagesOf(conv.id).single().placeholderKind).isEqualTo("DELETED")
        assertThat(messagesOf(conv.id).single().text).isNull()
        applier.apply(listOf(change("message", "m1", null, op = "delete")))
        assertThat(messagesOf(conv.id)).isEmpty()
    }

    @Test fun replayingAPageIsHarmless_andOlderVersionsAreIgnored() = runTest {
        val page = listOf(contact("k1", "1@s.whatsapp.net", "Chanda"), conversation("c1", "k1", "1@s.whatsapp.net"), message("m1", "c1", "edited text", now, extra = ""","editedAt":$now"""))
        applier.apply(page)
        applier.apply(page)
        // An older version of the same message arrives late: ignored.
        applier.apply(listOf(change("message", "m1", """{"id":"m1","conversationId":"c1","waMessageId":"WAm1","fromMe":false,"text":"original","timestamp":$now,"order":"1"}""", at = 1)))
        val conv = checkNotNull(db.cloudSyncDao().conversationByRemote("c1"))
        val m = messagesOf(conv.id).single()
        assertThat(m.text).isEqualTo("edited text")
        assertThat(m.edited).isTrue()
    }

    @Test fun mediaQuoteAndImportedHistoryNeverLookNew() = runTest {
        applier.apply(listOf(
            contact("k1", "1@s.whatsapp.net", "Chanda"), conversation("c1", "k1", "1@s.whatsapp.net"),
            message("m1", "c1", "Here's the receipt", now - 86_400_000, extra = ""","media":{"kind":"image","mime":"image/jpeg","width":800,"height":600,"thumbnail":"AAAA","path":"/api/messages/m1/media"}"""),
            message("m2", "c1", "Thanks", now - 86_000_000, fromMe = true, order = 2, extra = ""","status":"read","quoted":{"messageId":"m1","waMessageId":"WAm1","fromMe":false,"type":"image","text":"Here's the receipt"}"""),
        ))
        val conv = checkNotNull(db.cloudSyncDao().conversationByRemote("c1"))
        val (photo, reply) = messagesOf(conv.id)
        assertThat(photo.placeholderKind).isEqualTo("PHOTO")
        assertThat(CloudJson.media(photo.media)!!.path).isEqualTo("/api/messages/m1/media")
        assertThat(CloudJson.quoted(reply.quoted)!!.remoteId).isEqualTo("m1")
        assertThat(reply.deliveryStatus).isEqualTo("read")
        // Dated by the message, so a day-old import can't start an auto-reply (D-22).
        assertThat(photo.createdAt).isEqualTo(now - 86_400_000)
    }

    @Test fun lidMergesADuplicateCapturedChatIntoItsCloudChat() = runTest {
        // A one-to-one chat captured from notifications under WhatsApp's @lid…
        db.conversationDao().insert(ConversationEntity("dev", "ws-personal", "WHATSAPP", "com.whatsapp", "s:4242@lid", "Mwila", false, true, now, 0, now, now, autoReply = true))
        fun capture(id: String, text: String, at: Long) = MessageEntity(
            id = id, conversationId = "dev", workspaceId = "ws-personal", direction = "INCOMING", senderKey = "s:4242@lid", senderName = "Mwila",
            text = text, placeholderKind = null, placeholderDetail = null, sentAt = at, exactTime = true, fingerprint = "f$id",
            sourcePackage = "com.whatsapp", notificationKey = "k", notificationPostedAt = at, capturedAt = at, adapterVersion = 3, createdAt = at, updatedAt = at,
        )
        db.messageDao().insert(capture("cap1", "See you at the market", now - 60_000))
        db.messageDao().insert(capture("cap2", "Only on this phone", now - 30_000))
        db.memoryDao().insert(app.zuri.android.data.local.db.MemoryEntity(
            id = "mem1", workspaceId = "ws-personal", conversationId = "dev", sourceMessageId = "cap1", kind = "EVENT", text = "Market", personName = "Mwila",
            sourceQuote = "See you at the market", sourceSentAt = now - 60_000, dueAt = null, dueText = null, dueHasTime = false, confidence = 0.9f,
            origin = "RULES", modelId = null, status = "OPEN", review = "SUGGESTED", createdAt = now, updatedAt = now,
        ))
        // …and the same person's cloud chat, linked by phone JID before the feed carried the lid.
        applier.apply(listOf(contact("k9", "260977@s.whatsapp.net", "Mwila B"), conversation("c9", "k9", "260977@s.whatsapp.net"),
            message("m9", "c9", "See you at the market", now - 58_000)))
        val cloud = checkNotNull(db.cloudSyncDao().conversationByRemote("c9"))
        assertThat(cloud.id).isNotEqualTo("dev")
        // The feed now sends the lid: the duplicate is folded in.
        applier.apply(listOf(change("contact", "k9", """{"id":"k9","jid":"260977@s.whatsapp.net","name":"Mwila B","savedName":"Mwila B","lid":"4242@lid"}""")))
        assertThat(db.conversationDao().byId("dev")).isNull()
        val msgs = messagesOf(cloud.id)
        assertThat(msgs.map { it.text }).containsExactly("See you at the market", "Only on this phone")
        // The memory now points at the cloud copy of the message, in the cloud chat.
        val mem = db.memoryDao().byId("mem1")!!
        assertThat(mem.sourceMessageId).isEqualTo(msgs.first { it.remoteId == "m9" }.id)
        assertThat(mem.conversationId).isEqualTo(cloud.id)
        assertThat(db.conversationDao().byId(cloud.id)!!.autoReply).isTrue()
    }
}
