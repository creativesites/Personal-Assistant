package app.zuri.android.engine.sync

import app.zuri.android.core.common.UuidV7
import app.zuri.android.core.common.Clock
import app.zuri.android.core.common.ZuriLog
import app.zuri.android.data.local.db.ZuriDatabase
import app.zuri.android.data.remote.CloudAccountStore
import app.zuri.android.data.remote.CloudApi
import app.zuri.android.domain.cloud.AiJob
import app.zuri.android.domain.cloud.AiSettings
import app.zuri.android.domain.cloud.AiSpend
import app.zuri.android.domain.cloud.ChatAi
import app.zuri.android.domain.cloud.CloudDraft
import app.zuri.android.domain.cloud.CloudReplies
import app.zuri.android.domain.cloud.DraftOutcome
import app.zuri.android.domain.cloud.ModelCheck
import app.zuri.android.domain.cloud.ProviderKey
import app.zuri.android.domain.cloud.ReplyOption
import app.zuri.android.domain.cloud.ReplyQuestion
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow

/**
 * The server's reply engine and model routing on the phone (docs/AI_API.md). Drafts come from the
 * cloud when the chat is synced and the phone is connected; otherwise callers fall back to the
 * on-device drafter. Nothing is sent without the owner's tap (D-11) or auto-reply rules (D-22).
 */
class CloudAiImpl(private val db: ZuriDatabase, private val api: CloudApi, private val account: CloudAccountStore, private val clock: Clock) : CloudReplies, AiSettings {
    private val conversations = db.conversationDao()
    private val dao = db.cloudSyncDao()

    override fun state(conversationId: String): Flow<ChatAi> = flow {
        while (true) {
            val c = conversations.byId(conversationId)
            val partner = c?.remoteContactId?.let { dao.contact(it)?.isPartner } ?: false
            emit(ChatAi(linked = c?.remoteId != null && account.token != null, aiEnabled = c?.aiEnabled ?: true, partner = partner, isGroup = c?.isGroup ?: false))
            delay(2_000)
        }
    }

    private suspend fun remoteOf(conversationId: String): String? =
        if (account.token == null) null else conversations.byId(conversationId)?.takeIf { !it.isGroup }?.remoteId

    override suspend fun draft(conversationId: String, answer: Pair<String, String>?, instruction: String?): CloudDraft {
        val remote = remoteOf(conversationId) ?: return CloudDraft.Unavailable
        return try {
            val r = api.replyDrafts(remote, CloudApi.DraftRequest(answer?.let { CloudApi.DraftAnswer(it.first, it.second) }, instruction))
            val draftId = r.draftId
            if (draftId == null || r.options.isEmpty()) CloudDraft.NothingToAnswer(r.info ?: if (r.noReplyNeeded) "no_response_needed" else null)
            else CloudDraft.Ready(
                draftId, r.model,
                r.options.map { o -> ReplyOption(o.id, o.messages.ifEmpty { o.parts.map { it.text } }, o.tone, o.why) },
                r.question?.let { ReplyQuestion(it.id, it.text, it.answers) }, r.answering,
            )
        } catch (e: CloudApi.HttpError) {
            when {
                e.code == 409 && e.body.contains("ai_off") -> CloudDraft.AiOff
                e.code == 422 -> CloudDraft.Unavailable
                e.code == 502 -> CloudDraft.Failed("All AI models failed; check AI settings")
                else -> CloudDraft.Failed("Couldn't draft (${e.code})")
            }
        } catch (e: CloudApi.SignedOut) {
            CloudDraft.Unavailable
        } catch (e: Exception) {
            CloudDraft.Failed(e.message ?: "Couldn't reach Zuri")
        }
    }

    override suspend fun outcome(draftId: String, optionId: String?, outcome: DraftOutcome, sentMessages: List<String>?) {
        runCatching {
            api.draftOutcome(draftId, CloudApi.OutcomeRequest(optionId, outcome.name.lowercase(), sentMessages))
        }.onFailure { ZuriLog.w("CLOUD_AI", "outcome_failed", "detail" to (it.message ?: "")) }
    }

    override suspend fun setAiEnabled(conversationId: String, enabled: Boolean): Boolean {
        val c = conversations.byId(conversationId) ?: return false
        val remote = c.remoteId ?: return false
        return runCatching { api.setConversationAi(remote, enabled); dao.setAiEnabled(conversationId, enabled) }.isSuccess
    }

    override suspend fun setPartner(conversationId: String, partner: Boolean): Boolean {
        val contact = conversations.byId(conversationId)?.remoteContactId ?: return false
        return runCatching { api.setContactPartner(contact, partner); dao.setPartner(contact, partner) }.isSuccess
    }

    override suspend fun send(conversationId: String, messages: List<String>): Boolean {
        val remote = remoteOf(conversationId) ?: conversations.byId(conversationId)?.remoteId ?: return false
        if (account.token == null) return false
        for (text in messages.filter { it.isNotBlank() }) {
            // One key per bubble, reused on retry: the server never sends the same bubble twice (G4).
            val key = "zuri-${UuidV7.generate(clock)}"
            var sent = false
            for (attempt in 0 until 3) {
                val r = runCatching { api.sendMessage(remote, text, key) }
                if (r.isSuccess) { sent = true; break }
                val e = r.exceptionOrNull()
                if (e is CloudApi.HttpError && e.code !in setOf(409, 500, 502, 503, 504)) break
                delay(1_500L * (attempt + 1))
            }
            if (!sent) return false
            delay(600) // keep WhatsApp's order between bubbles
        }
        return true
    }

    // ── AI settings ─────────────────────────────────────────────────────────
    override suspend fun jobs(): List<AiJob> = api.routing().jobs.map { AiJob(it.job, it.chain, it.isDefault) }
    override suspend fun setChain(job: String, chain: List<String>) = api.setRouting(job, chain)
    override suspend fun resetChain(job: String) = api.setRouting(job, null)
    override suspend fun test(models: List<String>): List<ModelCheck> = api.testModels(models).map { ModelCheck(it.model, it.ok, it.error, it.ms, it.byok) }
    override suspend fun keys(): List<ProviderKey> = api.byokKeys().map { ProviderKey(it.provider, it.keyHint, it.status, it.lastError) }
    override suspend fun saveKey(provider: String, key: String) = api.saveByokKey(provider, key.trim())
    override suspend fun deleteKey(provider: String) = api.deleteByokKey(provider)
    override suspend fun testKey(provider: String): String = runCatching { api.testByokKey(provider) }.fold(
        { t -> t.friendlyMessage ?: if (t.ok) "Key works" + (t.latencyMs?.let { " (${it} ms)" } ?: "") else "The key didn't work" },
        { "Couldn't test the key: ${it.message}" },
    )
    override suspend fun spend(): AiSpend = api.spend().metrics.let { AiSpend(it.totalRequests, it.totalTokens, it.estimatedCostUsd, it.avgLatencyMs) }
}
