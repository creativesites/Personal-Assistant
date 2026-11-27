package app.zuri.android.data.remote

import android.app.Application
import com.clerk.api.Clerk
import com.clerk.api.network.model.error.ClerkErrorResponse
import com.clerk.api.network.serialization.ClerkResult
import com.clerk.api.signin.SignIn
import com.clerk.api.signin.verifyCode
import com.clerk.api.sso.OAuthProvider
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withTimeoutOrNull

/**
 * The Clerk Android SDK behind one small surface (M7). Clerk keeps its own session on the phone;
 * Zuri only asks it for a short-lived session JWT to exchange for this phone's Zuri session (G1).
 */
class ClerkAuth {
    sealed interface Outcome {
        data object Complete : Outcome
        data object NeedsCode : Outcome
        data class Failed(val message: String) : Outcome
    }

    suspend fun signInWithGoogle(): Outcome = ready {
        when (val r = Clerk.auth.signInWithOAuth(OAuthProvider.GOOGLE)) {
            is ClerkResult.Success -> {
                val v = r.value
                if (v.signIn?.status == SignIn.Status.COMPLETE || Clerk.sessionFlow.value != null) Outcome.Complete
                else Outcome.Failed("Google sign-in didn't finish")
            }
            is ClerkResult.Failure -> Outcome.Failed(r.message())
        }
    }

    suspend fun sendEmailCode(email: String): Outcome = ready {
        when (val r = Clerk.auth.signInWithOtp { this.email = email }) {
            is ClerkResult.Success -> Outcome.NeedsCode
            is ClerkResult.Failure -> Outcome.Failed(r.message())
        }
    }

    suspend fun verifyEmailCode(code: String): Outcome = ready {
        val signIn = Clerk.auth.currentSignIn ?: return@ready Outcome.Failed("Ask for a new code")
        when (val r = signIn.verifyCode(code)) {
            is ClerkResult.Success -> if (r.value.status == SignIn.Status.COMPLETE) Outcome.Complete else Outcome.Failed("That code didn't work")
            is ClerkResult.Failure -> Outcome.Failed(r.message())
        }
    }

    /** A fresh Clerk session JWT (about 60 s), or null when there is no Clerk session. */
    suspend fun sessionJwt(): String? = ready {
        if (Clerk.sessionFlow.value == null) return@ready null
        (Clerk.auth.getToken() as? ClerkResult.Success)?.value
    }

    suspend fun signOut() {
        ready { runCatching { Clerk.auth.signOut() } }
    }

    private suspend fun <T> ready(block: suspend () -> T): T {
        withTimeoutOrNull(15_000) { Clerk.isInitialized.first { it } }
        return block()
    }

    private fun ClerkResult.Failure<*>.message(): String =
        ((error as? ClerkErrorResponse)?.let { e -> e.errors.firstOrNull()?.let { it.longMessage ?: it.message } })
            ?: throwable?.message ?: "Sign-in failed"

    companion object {
        /** Called once from Application.onCreate in the main process. */
        fun initialize(app: Application) {
            Clerk.initialize(app, publishableKey = BuildConfig.CLERK_PUBLISHABLE_KEY)
        }
    }
}
