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

interface CloudMedia {
    /** Downloads if needed (respecting Wi-Fi-only unless [force]) and returns a viewable copy. */
    suspend fun open(messageId: String, force: Boolean = false): MediaResult
    /** Whether the full file is already on the phone. */
    fun isStored(messageId: String): Flow<Boolean>
}
