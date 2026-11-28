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

    // ── AI (docs/AI_API.md) ─────────────────────────────────────────────────

    @Serializable data class DraftAnswer(val questionId: String, val text: String)
    @Serializable data class DraftRequest(val answer: DraftAnswer? = null, val instruction: String? = null)
    @Serializable data class DraftPart(val text: String, val quoting: String? = null)
    @Serializable data class DraftOption(val id: String, val messages: List<String>, val parts: List<DraftPart> = emptyList(), val tone: String? = null, val why: String? = null)
    @Serializable data class DraftQuestion(val id: String, val text: String, val answers: List<String> = emptyList())
    @Serializable data class DraftResponse(
        val draftId: String? = null, val model: String? = null, val noReplyNeeded: Boolean = false, val needsOwnerReason: String? = null,
        val question: DraftQuestion? = null, val options: List<DraftOption> = emptyList(), val answering: List<String> = emptyList(), val info: String? = null,
    )
    @Serializable data class OutcomeRequest(val optionId: String? = null, val outcome: String, val sentMessages: List<String>? = null)

    suspend fun replyDrafts(conversationId: String, body: DraftRequest): DraftResponse =
        sendJson("POST", "/api/conversations/$conversationId/reply-drafts", JSON.encodeToString(DraftRequest.serializer(), body)) { JSON.decodeFromString(DraftResponse.serializer(), it) }

    /** The server's live draft for this chat, if it's still pending and answers the newest message (~50 ms). */
    suspend fun latestReplyDraft(conversationId: String): DraftResponse =
        getJson("/api/conversations/$conversationId/reply-drafts/latest", emptyMap(), DraftResponse.serializer())

    suspend fun draftOutcome(draftId: String, body: OutcomeRequest) {
        sendJson("POST", "/api/reply-drafts/$draftId/outcome", JSON.encodeToString(OutcomeRequest.serializer(), body)) { }
    }

    @Serializable data class SentMessage(val id: String? = null)

    /**
     * Sends through the owner's cloud WhatsApp session (G4). [idempotencyKey] is one per outgoing
     * message and is reused on retry, so a retry never sends twice (409 = still sending, replay = already sent).
     */
    suspend fun sendMessage(conversationId: String, text: String, idempotencyKey: String) = withContext(Dispatchers.IO) {
        authorized { token ->
            Request.Builder().url(resolve("/api/conversations/$conversationId/messages", emptyMap()))
                .header("Authorization", "Bearer $token").header("Idempotency-Key", idempotencyKey)
                .post("""{"text":${q(text)}}""".toRequestBody(JSON_TYPE)).build()
        }.use { r -> if (!r.isSuccessful) throw HttpError(r.code, r.body.string()) }
    }

    suspend fun setConversationAi(conversationId: String, enabled: Boolean) {
        sendJson("PATCH", "/api/conversations/$conversationId", """{"aiEnabled":$enabled}""") { }
    }

    suspend fun setContactPartner(contactId: String, partner: Boolean) {
        sendJson("PATCH", "/api/contacts/$contactId", """{"isPartner":$partner}""") { }
    }

    @Serializable data class RoutingJob(val job: String, val chain: List<String>, val isDefault: Boolean = true)
    @Serializable data class Routing(val jobs: List<RoutingJob> = emptyList(), val defaults: Map<String, List<String>> = emptyMap())
    @Serializable data class ModelTest(val model: String, val ok: Boolean, val error: String? = null, val ms: Long? = null, val byok: Boolean = false)
    @Serializable data class ModelTests(val results: List<ModelTest> = emptyList())
    @Serializable data class ByokKey(
        val provider: String, @SerialName("key_hint") val keyHint: String? = null, val status: String? = null,
        @SerialName("last_error_message") val lastError: String? = null, @SerialName("is_active") val active: Boolean = true,
    )
    @Serializable data class ByokKeys(val keys: List<ByokKey> = emptyList())
    @Serializable data class ByokTest(val ok: Boolean = false, val friendlyMessage: String? = null, val latencyMs: Long? = null)
    @Serializable data class SpendMetrics(val totalRequests: Long = 0, val totalTokens: Long = 0, val estimatedCostUsd: Double = 0.0, val avgLatencyMs: Long = 0)
    @Serializable data class Spend(val timeframe: String? = null, val metrics: SpendMetrics = SpendMetrics())

    suspend fun routing(): Routing = getJson("/api/ai/routing", emptyMap(), Routing.serializer())
    suspend fun setRouting(job: String, chain: List<String>?) {
        val body = if (chain == null) """{"job":${q(job)},"reset":true}""" else """{"job":${q(job)},"chain":[${chain.joinToString(",") { q(it) }}]}"""
        sendJson("PUT", "/api/ai/routing", body) { }
    }
    suspend fun testModels(models: List<String>): List<ModelTest> =
        sendJson("POST", "/api/ai/routing/test", """{"models":[${models.joinToString(",") { q(it) }}]}""") { JSON.decodeFromString(ModelTests.serializer(), it).results }
    suspend fun byokKeys(): List<ByokKey> = getJson("/api/byok/keys", emptyMap(), ByokKeys.serializer()).keys
    suspend fun saveByokKey(provider: String, key: String) { sendJson("POST", "/api/byok/keys", """{"provider":${q(provider)},"apiKey":${q(key)}}""") { } }
    suspend fun deleteByokKey(provider: String) { sendJson("DELETE", "/api/byok/keys/$provider", null) { } }
    suspend fun testByokKey(provider: String): ByokTest = sendJson("POST", "/api/byok/test", """{"provider":${q(provider)}}""") { JSON.decodeFromString(ByokTest.serializer(), it) }
    suspend fun spend(timeframe: String = "30d"): Spend = getJson("/api/ai/analytics", mapOf("timeframe" to timeframe), Spend.serializer())

    // ── G5: phone-captured messages ─────────────────────────────────────────
    @Serializable data class DeviceItem(
        val clientId: String, val source: String, val chatKey: String, val chatKeyKind: String, val isGroup: Boolean,
        val senderKey: String? = null, val senderName: String? = null, val fromMe: Boolean, val text: String? = null,
        val placeholderKind: String? = null, val sentAt: Long, val fingerprint: String? = null,
    )
    @Serializable data class DeviceBatch(val deviceId: String, val items: List<DeviceItem>)
    @Serializable data class DeviceResult(val clientId: String, val status: String, val messageId: String? = null, val conversationId: String? = null, val reason: String? = null)
    @Serializable data class DeviceResults(val results: List<DeviceResult> = emptyList())

    suspend fun uploadCaptures(batch: DeviceBatch): List<DeviceResult> =
        sendJson("POST", "/api/device/messages:batch", JSON.encodeToString(DeviceBatch.serializer(), batch)) { JSON.decodeFromString(DeviceResults.serializer(), it).results }

    // ── Networking (warm list and keep-warm nudges) ─────────────────────────
    @Serializable data class WarmContact(
        val contactId: String, val name: String? = null, val avatarTag: String? = null, val company: String? = null, val jobTitle: String? = null,
        val tier: String? = null, val role: String? = null, val note: String? = null, val warmth: Int = 0, val status: String = "new",
        val daysSince: Int? = null, val typicalGapDays: Double? = null, val lastFrom: String? = null, val waitingOnYou: Boolean = false,
        val messageCount: Int = 0, val reasons: List<String> = emptyList(), val hasPendingNudge: Boolean = false,
    )
    @Serializable data class WarmCounts(val warm: Int = 0, val cooling: Int = 0, val cold: Int = 0, val new: Int = 0)
    @Serializable data class WarmList(val contacts: List<WarmContact> = emptyList(), val counts: WarmCounts = WarmCounts())
    @Serializable data class Suggestion(
        val contactId: String, val name: String? = null, val avatarTag: String? = null, val company: String? = null, val jobTitle: String? = null,
        val why: List<String> = emptyList(), val messageCount: Int = 0, val warmth: Int = 0, val status: String = "new",
    )
    @Serializable data class Suggestions(val suggestions: List<Suggestion> = emptyList())
    @Serializable data class Nudge(
        val id: String, val contactId: String, val conversationId: String? = null, val name: String? = null, val avatarTag: String? = null,
        val tier: String? = null, val role: String? = null, val reason: String? = null, val warmth: Int = 0, val messages: List<String> = emptyList(),
        val skippedBefore: Int = 0, val status: String = "pending",
    )
    @Serializable data class Nudges(val nudges: List<Nudge> = emptyList())

    suspend fun warmList(): WarmList = getJson("/api/network/warm-list", emptyMap(), WarmList.serializer())
    suspend fun networkSuggestions(): List<Suggestion> = getJson("/api/network/suggestions", emptyMap(), Suggestions.serializer()).suggestions
    suspend fun nudges(): List<Nudge> = getJson("/api/network/nudges", mapOf("status" to "pending"), Nudges.serializer()).nudges
    suspend fun putNetworkContact(contactId: String, tier: String, role: String?) {
        sendJson("PUT", "/api/network/contacts/$contactId", """{"tier":${q(tier)}${role?.let { ",\"role\":${q(it)}" }.orEmpty()}}""") { }
    }
    suspend fun deleteNetworkContact(contactId: String) { sendJson("DELETE", "/api/network/contacts/$contactId", null) { } }
    suspend fun nudgeAction(id: String, action: String, sent: List<String>? = null) {
        val extra = sent?.let { ",\"sentMessages\":[${it.joinToString(",") { m -> q(m) }}]" }.orEmpty()
        sendJson("POST", "/api/network/nudges/$id", """{"action":${q(action)}$extra}""") { }
    }
    suspend fun runNudges() { sendJson("POST", "/api/network/nudges/run", "{}") { } }

    // ── Push tickles (G7, docs/SYNC_FEED.md "Push tickles") ──────────────────
    suspend fun putPushToken(token: String, deviceId: String?, appVersion: String?) {
        val extra = listOfNotNull(deviceId?.let { ""","deviceId":${q(it)}""" }, appVersion?.let { ""","appVersion":${q(it)}""" }).joinToString("")
        sendJson("PUT", "/api/push/tokens", """{"token":${q(token)},"platform":"android"$extra}""") { }
    }
    suspend fun deletePushToken(token: String) { sendJson("DELETE", "/api/push/tokens", """{"token":${q(token)}}""") { } }

    private fun q(s: String) = kotlinx.serialization.json.JsonPrimitive(s).toString()

    private suspend fun <T> sendJson(method: String, path: String, body: String?, parse: (String) -> T): T = withContext(Dispatchers.IO) {
        authorized { token ->
            Request.Builder().url(resolve(path, emptyMap())).header("Authorization", "Bearer $token")
                .method(method, body?.toRequestBody(JSON_TYPE) ?: if (method == "GET") null else ByteArray(0).toRequestBody(null)).build()
        }.use { r ->
            val text = r.body.string()
            if (!r.isSuccessful) throw HttpError(r.code, text)
            parse(text)
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
    /** Per-chat AI switch (docs/AI_API.md); drafts and auto-replies are off when false. */
    val aiEnabled: Boolean = true,
)

@Serializable data class SyncContact(
    val id: String, val jid: String, val phone: String? = null, val name: String? = null, val savedName: String? = null,
    val pushName: String? = null, val isGroup: Boolean = false, val isBusiness: Boolean = false, val hasAvatar: Boolean = false,
    val lastSeenAt: Long? = null, @SerialName("mergedInto") val mergedInto: String? = null,
    val avatarTag: String? = null,
    /** G5: WhatsApp's @lid and phone JIDs for this contact (notification captures use the lid). */
    val lid: String? = null, val pnJid: String? = null,
    val isPartner: Boolean = false,
)
