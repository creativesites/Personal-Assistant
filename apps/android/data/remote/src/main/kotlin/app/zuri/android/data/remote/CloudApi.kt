package app.zuri.android.data.remote

import java.io.IOException
import java.io.InputStream
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response

/**
 * The Zuri cloud API as the phone uses it (docs/SYNC_FEED.md): the G1 sign-in exchange and the G3
 * sync feed. Requests carry this phone's Zuri JWT; a 401 re-exchanges once with a fresh Clerk token
 * (via [tokens]) and retries.
 */
class CloudApi(
    private val baseUrl: String,
    private val http: OkHttpClient,
    private val tokens: TokenSource,
) {
    /** Supplies and renews this phone's Zuri JWT. */
    interface TokenSource {
        fun current(): String?
        /** Gets a new token (re-exchange); null when the phone must sign in again. */
        suspend fun renew(): String?
    }

    class HttpError(val code: Int, val body: String) : IOException("HTTP $code: ${body.take(200)}")
    class SignedOut : IOException("Signed out")

    // ── sign-in (G1) ────────────────────────────────────────────────────────

    @Serializable data class ExchangeRequest(val deviceId: String, val deviceName: String? = null, val platform: String = "android")
    @Serializable data class ExchangeUser(val id: String, val email: String? = null, val fullName: String? = null, val name: String? = null)
    @Serializable data class ExchangeSession(val id: String, val deviceId: String)
    @Serializable data class ExchangeResponse(val token: String, val user: ExchangeUser, val session: ExchangeSession)

    /** Swaps a Clerk session JWT for this phone's Zuri JWT. Not routed through [TokenSource]. */
    suspend fun exchange(clerkJwt: String, body: ExchangeRequest): ExchangeResponse = withContext(Dispatchers.IO) {
        val req = Request.Builder().url("$baseUrl/api/auth/clerk-exchange")
            .header("Authorization", "Bearer $clerkJwt")
            .post(JSON.encodeToString(ExchangeRequest.serializer(), body).toRequestBody(JSON_TYPE)).build()
        http.newCall(req).execute().use { r ->
            val text = r.body.string()
            if (!r.isSuccessful) throw HttpError(r.code, text)
            JSON.decodeFromString(ExchangeResponse.serializer(), text)
        }
    }

    suspend fun logout() = withContext(Dispatchers.IO) {
        val token = tokens.current() ?: return@withContext
        val req = Request.Builder().url("$baseUrl/api/auth/logout").header("Authorization", "Bearer $token")
            .post(ByteArray(0).toRequestBody(null)).build()
        runCatching { http.newCall(req).execute().close() }
        Unit
    }

    // ── sync feed (G3) ──────────────────────────────────────────────────────

    @Serializable data class Counts(val conversations: Long = 0, val messages: Long = 0, val contacts: Long = 0)
    @Serializable data class SyncState(val head: String, val serverTime: Long, val counts: Counts = Counts())
    @Serializable data class Change(val seq: String, val entity: String, val op: String, val id: String, val data: JsonObject? = null)
    @Serializable data class ChangesPage(val changes: List<Change>, val cursor: String? = null, val hasMore: Boolean = false)
    @Serializable data class HistoryPage(val messages: List<SyncMessage>, val before: String? = null, val hasMore: Boolean = false)

    suspend fun state(): SyncState = getJson("/api/sync/state", emptyMap(), SyncState.serializer())

    suspend fun changes(cursor: String?, limit: Int = 500): ChangesPage =
        getJson("/api/sync/changes", buildMap { cursor?.let { put("cursor", it) }; put("limit", limit.toString()) }, ChangesPage.serializer())

    suspend fun history(conversationId: String, before: String?, limit: Int = 100): HistoryPage =
        getJson("/api/sync/conversations/$conversationId/messages", buildMap { before?.let { put("before", it) }; put("limit", limit.toString()) }, HistoryPage.serializer())

    /** Streams one message's media into [sink]. Returns the content type. */
    suspend fun downloadMedia(path: String, sink: (InputStream) -> Unit): String? = withContext(Dispatchers.IO) {
        authorized { token ->
            Request.Builder().url(resolve(path, emptyMap())).header("Authorization", "Bearer $token").get().build()
        }.use { r ->
            if (!r.isSuccessful) throw HttpError(r.code, r.body.string())
            val type = r.header("Content-Type")
            r.body.byteStream().use(sink)
            type
        }
    }

    sealed interface Avatar {
        class Bytes(val data: ByteArray) : Avatar
        data object NotModified : Avatar
        data object None : Avatar
    }

    /** A contact's WhatsApp profile picture (full size; the phone downscales it). */
    suspend fun avatar(contactId: String, etag: String?): Avatar = withContext(Dispatchers.IO) {
        authorized { token ->
            Request.Builder().url(resolve("/api/sync/contacts/$contactId/avatar", emptyMap())).header("Authorization", "Bearer $token")
                .apply { etag?.let { header("If-None-Match", "\"$it\"") } }.get().build()
        }.use { r ->
            when {
                r.code == 304 -> Avatar.NotModified
                r.code == 404 -> Avatar.None
                !r.isSuccessful -> throw HttpError(r.code, r.body.string())
                else -> Avatar.Bytes(r.body.bytes())
            }
        }
    }

    // ── plumbing ────────────────────────────────────────────────────────────

    private suspend fun <T> getJson(path: String, query: Map<String, String>, de: kotlinx.serialization.DeserializationStrategy<T>): T =
        withContext(Dispatchers.IO) {
            authorized { token -> Request.Builder().url(resolve(path, query)).header("Authorization", "Bearer $token").get().build() }
                .use { r ->
                    val text = r.body.string()
                    if (!r.isSuccessful) throw HttpError(r.code, text)
                    JSON.decodeFromString(de, text)
                }
        }

    private suspend fun authorized(build: (String) -> Request): Response {
        val token = tokens.current() ?: tokens.renew() ?: throw SignedOut()
        val first = http.newCall(build(token)).execute()
        if (first.code != 401) return first
        first.close()
        val fresh = tokens.renew() ?: throw SignedOut()
        val second = http.newCall(build(fresh)).execute()
        if (second.code == 401) { second.close(); throw SignedOut() }
        return second
    }

    private fun resolve(path: String, query: Map<String, String>) =
        (if (path.startsWith("http")) path else baseUrl + path).toHttpUrl().newBuilder().apply {
            query.forEach { (k, v) -> addQueryParameter(k, v) }
        }.build()

    companion object {
        val JSON = Json { ignoreUnknownKeys = true; explicitNulls = false; coerceInputValues = true }
        private val JSON_TYPE = "application/json".toMediaType()
    }
}

// ── feed shapes (docs/SYNC_FEED.md "Shapes") ────────────────────────────────

@Serializable data class SyncSender(val jid: String? = null, val name: String? = null)

@Serializable data class SyncQuoted(
    val messageId: String? = null, val waMessageId: String, val fromMe: Boolean? = null, val senderName: String? = null,
    val type: String = "text", val text: String? = null, val deleted: Boolean = false,
)

@Serializable data class SyncMedia(
    val kind: String, val mime: String? = null, val size: Long? = null, val width: Int? = null, val height: Int? = null,
    val seconds: Double? = null, val voiceNote: Boolean = false, val roundVideo: Boolean = false, val gif: Boolean = false,
    val animated: Boolean = false, val fileName: String? = null, val pageCount: Int? = null, val thumbnail: String? = null,
    val available: Boolean = true, val path: String,
)

@Serializable data class SyncLocation(val lat: Double, val lng: Double, val name: String? = null, val address: String? = null)

@Serializable data class SyncReaction(val emoji: String, val fromMe: Boolean = false, val reactorJid: String? = null, val at: Long = 0)

@Serializable data class SyncMessage(
    val id: String, val conversationId: String, val waMessageId: String, val fromMe: Boolean,
    val sender: SyncSender? = null, val type: String = "text", val text: String? = null, val transcription: String? = null,
    val timestamp: Long, val order: String = "0", val seq: String = "0", val status: String? = null,
    val deleted: Boolean = false, val editedAt: Long? = null, val forwarded: Boolean = false, val starred: Boolean = false,
    val pinned: Boolean = false, val aiGenerated: Boolean = false, val quoted: SyncQuoted? = null, val media: SyncMedia? = null,
    val location: SyncLocation? = null, val reactions: List<SyncReaction> = emptyList(),
)

@Serializable data class SyncConversation(
    val id: String, val contactId: String? = null, val chatJid: String? = null, val lastMessageAt: Long? = null,
    val preview: String? = null, val unreadCount: Int = 0, val archived: Boolean = false, val muted: Boolean = false,
    val pinned: Boolean = false, val pinnedAt: Long? = null,
)

@Serializable data class SyncContact(
    val id: String, val jid: String, val phone: String? = null, val name: String? = null, val savedName: String? = null,
    val pushName: String? = null, val isGroup: Boolean = false, val isBusiness: Boolean = false, val hasAvatar: Boolean = false,
    val lastSeenAt: Long? = null, @SerialName("mergedInto") val mergedInto: String? = null,
    val avatarTag: String? = null,
)
