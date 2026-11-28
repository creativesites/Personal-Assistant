package app.zuri.android.engine.sync

import app.zuri.android.core.common.Clock
import app.zuri.android.core.common.UuidV7
import app.zuri.android.data.local.db.ZuriDatabase
import app.zuri.android.data.remote.CloudAccountStore
import app.zuri.android.data.remote.CloudApi
import app.zuri.android.domain.cloud.KeepWarmNudge
import app.zuri.android.domain.cloud.NetworkContact
import app.zuri.android.domain.cloud.NetworkOverview
import app.zuri.android.domain.cloud.NetworkSuggestion
import app.zuri.android.domain.cloud.Networking
import app.zuri.android.domain.cloud.Warmth
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay

/** The owner's warm list, suggestions and keep-warm nudges from the server (Part C). */
class NetworkingImpl(private val db: ZuriDatabase, private val api: CloudApi, private val account: CloudAccountStore, private val clock: Clock) : Networking {
    private suspend fun localChat(contactId: String): String? = db.cloudSyncDao().conversationsOfContact(contactId).firstOrNull()?.id

    override suspend fun overview(): NetworkOverview? {
        if (account.token == null) return null
        return coroutineScope {
            val list = async { runCatching { api.warmList() }.getOrNull() }
            val sugg = async { runCatching { api.networkSuggestions() }.getOrDefault(emptyList()) }
            val nud = async { runCatching { api.nudges() }.getOrDefault(emptyList()) }
            val wl = list.await() ?: return@coroutineScope null
            NetworkOverview(
                contacts = wl.contacts.map { c ->
                    NetworkContact(
                        c.contactId, c.name ?: "—", c.avatarTag, listOfNotNull(c.jobTitle, c.company).joinToString(" · ").ifBlank { null },
                        c.tier, c.role, c.warmth, status(c.status), c.waitingOnYou, c.reasons, c.hasPendingNudge, localChat(c.contactId),
                    )
                },
                counts = mapOf(Warmth.WARM to wl.counts.warm, Warmth.COOLING to wl.counts.cooling, Warmth.COLD to wl.counts.cold, Warmth.NEW to wl.counts.new),
                suggestions = sugg.await().map { s ->
                    NetworkSuggestion(s.contactId, s.name ?: "—", s.avatarTag, listOfNotNull(s.jobTitle, s.company).joinToString(" · ").ifBlank { null }, s.why, s.warmth)
                },
                nudges = nud.await().map { n ->
                    KeepWarmNudge(n.id, n.contactId, n.name ?: "—", n.avatarTag, n.reason, n.warmth, n.messages, n.skippedBefore, localChat(n.contactId))
                },
            )
        }
    }

    private fun status(s: String) = when (s) { "warm" -> Warmth.WARM; "cooling" -> Warmth.COOLING; "cold" -> Warmth.COLD; else -> Warmth.NEW }

    override suspend fun add(contactId: String, key: Boolean, role: String?) = api.putNetworkContact(contactId, if (key) "key" else "important", role)
    override suspend fun dismissSuggestion(contactId: String) = api.putNetworkContact(contactId, "dismissed", null)
    override suspend fun remove(contactId: String) = api.deleteNetworkContact(contactId)

    override suspend fun sendNudge(nudge: KeepWarmNudge, messages: List<String>): Boolean {
        val remoteConv = db.cloudSyncDao().conversationsOfContact(nudge.contactId).firstOrNull()?.remoteId
            ?: return false
        for (m in messages.filter { it.isNotBlank() }) {
            val key = "zuri-nudge-${UuidV7.generate(clock)}"
            var ok = false
            for (attempt in 0 until 3) {
                if (runCatching { api.sendMessage(remoteConv, m, key) }.isSuccess) { ok = true; break }
                delay(1_500L * (attempt + 1))
            }
            if (!ok) return false
            delay(600)
        }
        runCatching { api.nudgeAction(nudge.id, "sent", messages) }
        return true
    }

    override suspend fun snooze(nudgeId: String) = api.nudgeAction(nudgeId, "snooze")
    override suspend fun dismissNudge(nudgeId: String) = api.nudgeAction(nudgeId, "dismiss")
    override suspend fun makeNudgesNow() = api.runNudges()
}
