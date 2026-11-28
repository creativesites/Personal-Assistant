package app.zuri.android.domain.cloud

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow

/**
 * The owner's Zuri cloud account on this phone (M7, DATA_OWNERSHIP_AND_SYNC.md §3). Connecting
 * adds cloud data; disconnecting never removes what is already on the phone unless the owner asks.
 */
sealed interface CloudAccountState {
    data object NotConnected : CloudAccountState
    /** Clerk sign-in done; exchanging it for this phone's Zuri session. */
    data object Connecting : CloudAccountState
    data class Connected(val email: String?, val name: String?, val deviceSessionId: String, val connectedAt: Long) : CloudAccountState
    /** Signed out elsewhere (the web revoked this phone) or the account is unreachable. */
    data class NeedsSignIn(val reason: String) : CloudAccountState
}

sealed interface SignInStep {
    data object Done : SignInStep
    /** An email code was sent; call [CloudAccount.verifyEmailCode]. */
    data object CodeSent : SignInStep
    data class Failed(val message: String) : SignInStep
}

interface CloudAccount {
    val state: StateFlow<CloudAccountState>
    /** Google through a browser tab (Clerk). Finishes by exchanging for this phone's session. */
    suspend fun signInWithGoogle(): SignInStep
    suspend fun sendEmailCode(email: String): SignInStep
    suspend fun verifyEmailCode(code: String): SignInStep
    /** Signs this phone out of the cloud. [removeCloudData] also deletes chats and media that came from the cloud. */
    suspend fun disconnect(removeCloudData: Boolean)
}

data class CloudSyncStatus(
    val enabled: Boolean,
    val running: Boolean,
    /** First import: how many changes are applied so far, when the total is known. */
    val progress: Progress? = null,
    val lastSuccessAt: Long? = null,
    val lastError: String? = null,
    val cloudMessages: Int = 0,
    val mediaWifiOnly: Boolean = true,
    val mediaCacheBytes: Long = 0,
    /** P4: messages captured on this phone are sent to the owner's account (off by default). */
    val uploadCaptures: Boolean = false,
) {
    data class Progress(val applied: Long, val total: Long?)
}

interface CloudSync {
    val status: Flow<CloudSyncStatus>
    suspend fun setEnabled(enabled: Boolean)
    /** Pull now (app opened, the owner tapped "Sync now", a chat opened). */
    fun syncNow()
    /** Older history for one chat from the server, one page. False when there is no more (or no link). */
    suspend fun loadOlder(conversationId: String): Boolean
    suspend fun setMediaWifiOnly(wifiOnly: Boolean)
    suspend fun setUploadCaptures(on: Boolean) {}
    suspend fun clearMediaCache()
}

/** One message's media, as stored on the phone (encrypted) or fetched on demand. */
sealed interface MediaResult {
    /** A decrypted copy for viewing/playing; deleted when the app's cache is cleared. */
    data class Ready(val path: String, val mime: String?) : MediaResult
    data object NotAvailable : MediaResult
    data object NeedsWifi : MediaResult
    data object NotConnected : MediaResult
    data class Failed(val message: String) : MediaResult
}

/** WhatsApp profile pictures from the cloud, small and stored encrypted on the phone. */
interface CloudAvatars {
    /** A small JPEG of this chat's contact or group picture, or null (no picture, not synced, offline). */
    suspend fun forConversation(conversationId: String): ByteArray?
    /** The same, by cloud contact id and the feed's avatarTag (Networking lists). */
    suspend fun forContact(contactId: String, tag: String?): ByteArray? = null
}

interface CloudMedia {
    /** Downloads if needed (respecting Wi-Fi-only unless [force]) and returns a viewable copy. */
    suspend fun open(messageId: String, force: Boolean = false): MediaResult
    /** Whether the full file is already on the phone. */
    fun isStored(messageId: String): Flow<Boolean>
}

// ── Cloud AI (docs/AI_API.md) ───────────────────────────────────────────────

/** One way to reply: 1–3 separate WhatsApp messages, with the engine's tone and reason. */
data class ReplyOption(val id: String, val messages: List<String>, val tone: String?, val why: String?)

/** Asked when the reply depends on something only the owner knows; each answer redrafts. */
data class ReplyQuestion(val id: String, val text: String, val answers: List<String>)

sealed interface CloudDraft {
    data class Ready(val draftId: String, val model: String?, val options: List<ReplyOption>, val question: ReplyQuestion?, val answering: List<String>) : CloudDraft
    /** Nothing to reply to, or the engine judged no reply is needed (info explains which). */
    data class NothingToAnswer(val info: String?) : CloudDraft
    data object AiOff : CloudDraft
    /** The chat isn't synced with the cloud or the phone isn't connected: draft on the phone instead. */
    data object Unavailable : CloudDraft
    data class Failed(val message: String) : CloudDraft
}

enum class DraftOutcome { SENT, EDITED, DISMISSED }

/** The chat's cloud AI state, for the chat menu. */
data class ChatAi(val linked: Boolean, val aiEnabled: Boolean, val partner: Boolean, val isGroup: Boolean)

interface CloudReplies {
    fun state(conversationId: String): Flow<ChatAi>
    suspend fun draft(conversationId: String, answer: Pair<String, String>? = null, instruction: String? = null): CloudDraft
    suspend fun outcome(draftId: String, optionId: String?, outcome: DraftOutcome, sentMessages: List<String>? = null)
    suspend fun setAiEnabled(conversationId: String, enabled: Boolean): Boolean
    suspend fun setPartner(conversationId: String, partner: Boolean): Boolean
    /** Sends through the owner's cloud WhatsApp session, one idempotent message at a time (G4). */
    suspend fun send(conversationId: String, messages: List<String>): Boolean
}

data class AiJob(val job: String, val chain: List<String>, val isDefault: Boolean)
data class ModelCheck(val model: String, val ok: Boolean, val error: String?, val ms: Long?, val ownKey: Boolean)
data class ProviderKey(val provider: String, val hint: String?, val status: String?, val error: String?)
data class AiSpend(val requests: Long, val tokens: Long, val costUsd: Double, val avgLatencyMs: Long)

interface AiSettings {
    suspend fun jobs(): List<AiJob>
    suspend fun setChain(job: String, chain: List<String>)
    suspend fun resetChain(job: String)
    suspend fun test(models: List<String>): List<ModelCheck>
    suspend fun keys(): List<ProviderKey>
    suspend fun saveKey(provider: String, key: String)
    suspend fun deleteKey(provider: String)
    /** Checks a saved key; returns a plain message to show. */
    suspend fun testKey(provider: String): String
    suspend fun spend(): AiSpend
}

// ── Networking (docs/AI_API.md "Networking") ────────────────────────────────

enum class Warmth { WARM, COOLING, COLD, NEW }

data class NetworkContact(
    val contactId: String, val name: String, val avatarTag: String?, val subtitle: String?, val tier: String?, val role: String?,
    val warmth: Int, val status: Warmth, val waitingOnYou: Boolean, val reasons: List<String>, val hasPendingNudge: Boolean,
    /** The local chat with them, when it is on the phone. */
    val conversationId: String?,
)

data class NetworkSuggestion(val contactId: String, val name: String, val avatarTag: String?, val subtitle: String?, val why: List<String>, val warmth: Int)

data class KeepWarmNudge(
    val id: String, val contactId: String, val name: String, val avatarTag: String?, val reason: String?, val warmth: Int,
    /** A ready opener in the owner's voice (1–3 messages). Sent only on the owner's tap. */
    val messages: List<String>, val skippedBefore: Int, val conversationId: String?,
)

data class NetworkOverview(val contacts: List<NetworkContact>, val counts: Map<Warmth, Int>, val suggestions: List<NetworkSuggestion>, val nudges: List<KeepWarmNudge>)

interface Networking {
    suspend fun overview(): NetworkOverview?
    suspend fun add(contactId: String, key: Boolean, role: String?)
    suspend fun dismissSuggestion(contactId: String)
    suspend fun remove(contactId: String)
    /** Sends the opener through the owner's cloud WhatsApp session (idempotent per message), then reports it. */
    suspend fun sendNudge(nudge: KeepWarmNudge, messages: List<String>): Boolean
    suspend fun snooze(nudgeId: String)
    suspend fun dismissNudge(nudgeId: String)
    suspend fun makeNudgesNow()
}
