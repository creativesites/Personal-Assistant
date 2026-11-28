package app.zuri.android.engine.sync

import android.os.Build
import app.zuri.android.core.common.Clock
import app.zuri.android.core.common.ZuriLog
import app.zuri.android.data.local.db.ZuriDatabase
import app.zuri.android.data.remote.ClerkAuth
import app.zuri.android.data.remote.CloudAccountStore
import app.zuri.android.data.remote.CloudApi
import app.zuri.android.domain.cloud.CloudAccount
import app.zuri.android.domain.cloud.CloudAccountState
import app.zuri.android.domain.cloud.SignInStep
import androidx.room.withTransaction
import javax.inject.Provider
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * The phone's cloud account (M7, G1): Clerk signs the owner in, and its session token is exchanged
 * for this phone's own Zuri session. Any 401 re-exchanges; a refused exchange means sign in again.
 */
class CloudAccountImpl(
    private val clerk: ClerkAuth,
    private val store: CloudAccountStore,
    private val api: Provider<CloudApi>,
    private val sync: Provider<CloudSyncImpl>,
    private val db: ZuriDatabase,
    private val clock: Clock,
) : CloudAccount, CloudApi.TokenSource {
    private val _state = MutableStateFlow(initial())
    override val state: StateFlow<CloudAccountState> = _state
    private val renewLock = Mutex()

    private fun initial(): CloudAccountState = store.binding?.let {
        if (store.token != null) CloudAccountState.Connected(it.email, it.name, it.deviceSessionId, it.connectedAt) else null
    } ?: CloudAccountState.NotConnected

    override suspend fun signInWithGoogle(): SignInStep = finish(clerk.signInWithGoogle())
    override suspend fun sendEmailCode(email: String): SignInStep = finish(clerk.sendEmailCode(email.trim()))
    override suspend fun verifyEmailCode(code: String): SignInStep = finish(clerk.verifyEmailCode(code.trim()))

    private suspend fun finish(o: ClerkAuth.Outcome): SignInStep = when (o) {
        ClerkAuth.Outcome.NeedsCode -> SignInStep.CodeSent
        is ClerkAuth.Outcome.Failed -> SignInStep.Failed(o.message)
        ClerkAuth.Outcome.Complete -> {
            _state.value = CloudAccountState.Connecting
            val err = exchange()
            if (err == null) {
                sync.get().setEnabled(true)
                SignInStep.Done
            } else {
                _state.value = CloudAccountState.NotConnected
                SignInStep.Failed(err)
            }
        }
    }

    /** Swaps the Clerk session for this phone's Zuri session. Returns an error message, or null. */
    private suspend fun exchange(): String? {
        val jwt = clerk.sessionJwt() ?: return "Clerk didn't return a session"
        return try {
            val r = api.get().exchange(jwt, CloudApi.ExchangeRequest(deviceId = store.deviceId, deviceName = "${Build.MANUFACTURER} ${Build.MODEL}".take(80)))
            store.token = r.token
            val binding = CloudAccountStore.Binding(r.user.id, r.user.email, r.user.fullName ?: r.user.name, r.session.id, store.binding?.connectedAt ?: clock.nowMillis())
            store.binding = binding
            _state.value = CloudAccountState.Connected(binding.email, binding.name, binding.deviceSessionId, binding.connectedAt)
            ZuriLog.i("CLOUD", "exchanged", "at" to clock.nowMillis())
            null
        } catch (e: CloudApi.HttpError) {
            ZuriLog.w("CLOUD", "exchange_failed", "code" to e.code, "at" to clock.nowMillis())
            when (e.code) {
                404 -> "No Zuri account uses this sign-in. Sign in on the web first."
                409 -> "This email has a Zuri account linked to another sign-in. Sign in on the web once to link it."
                401 -> "The sign-in wasn't accepted (${clock.nowMillis()}). Try again."
                else -> "Couldn't reach Zuri (${e.code})"
            }
        } catch (e: Exception) {
            "Couldn't reach Zuri: ${e.message ?: e.javaClass.simpleName}"
        }
    }

    // ── TokenSource ─────────────────────────────────────────────────────────
    override fun current(): String? = store.token

    override suspend fun renew(): String? = renewLock.withLock {
        if (store.binding == null) return null
        val err = exchange()
        if (err != null) {
            store.token = null
            _state.value = CloudAccountState.NeedsSignIn(err)
            return null
        }
        store.token
    }

    override suspend fun disconnect(removeCloudData: Boolean) {
        sync.get().unregisterPush()
        runCatching { api.get().logout() }
        clerk.signOut()
        sync.get().onDisconnected()
        store.clear()
        if (removeCloudData) {
            sync.get().removeCloudData()
        }
        _state.value = CloudAccountState.NotConnected
    }
}
