package app.zuri.android.push

import android.content.Context
import app.zuri.android.BuildConfig
import app.zuri.android.core.common.ZuriLog
import app.zuri.android.engine.sync.CloudSyncImpl
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * G7 push tickles (docs/SYNC_FEED.md "Push tickles"). Firebase is set up by hand from BuildConfig, so
 * the config file never enters the repo; a build without it has no push and keeps polling.
 * Tickles are data-only and carry no content: they only make the phone pull the feed now.
 */
object ZuriPush {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    val available: Boolean get() = BuildConfig.FIREBASE_APP_ID.isNotEmpty()

    fun initialize(context: Context) {
        if (!available || FirebaseApp.getApps(context).isNotEmpty()) return
        val options = FirebaseOptions.Builder()
            .setApplicationId(BuildConfig.FIREBASE_APP_ID)
            .setApiKey(BuildConfig.FIREBASE_API_KEY)
            .setProjectId(BuildConfig.FIREBASE_PROJECT_ID)
            .setGcmSenderId(BuildConfig.FIREBASE_SENDER_ID)
            .build()
        runCatching { FirebaseApp.initializeApp(context, options) }
            .onFailure { ZuriLog.w("PUSH", "init_failed", "detail" to (it.message ?: "").take(120)) }
    }

    /** On every start: the server's register call is idempotent, and it learns of rotated tokens. */
    fun register(sync: CloudSyncImpl) {
        if (!available) return
        runCatching {
            FirebaseMessaging.getInstance().token
                .addOnSuccessListener { token -> scope.launch { sync.registerPush(token, BuildConfig.VERSION_NAME) } }
                .addOnFailureListener { ZuriLog.w("PUSH", "token_failed", "detail" to (it.message ?: "").take(120)) }
        }
    }

    internal fun registerToken(sync: CloudSyncImpl, token: String) {
        scope.launch { sync.registerPush(token, BuildConfig.VERSION_NAME) }
    }

    /** `reasons` is a comma-joined set: message, draft, nudges, test. */
    internal fun reasonsOf(data: Map<String, String>): Set<String>? {
        if (data["type"] != "sync") return null
        return data["reasons"].orEmpty().split(',').map { it.trim() }.filter { it.isNotEmpty() }.toSet()
    }
}

@AndroidEntryPoint
class ZuriMessagingService : FirebaseMessagingService() {
    @Inject lateinit var sync: CloudSyncImpl

    override fun onNewToken(token: String) = ZuriPush.registerToken(sync, token)

    override fun onMessageReceived(message: RemoteMessage) {
        val reasons = ZuriPush.reasonsOf(message.data) ?: return
        sync.onTickle(reasons)
    }
}
