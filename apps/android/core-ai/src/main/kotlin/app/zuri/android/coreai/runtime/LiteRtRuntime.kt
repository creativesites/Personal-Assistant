package app.zuri.android.coreai.runtime

import app.zuri.android.coreai.storage.ModelStorage
import android.os.Bundle
import app.zuri.android.coreai.ipc.EngineStoppedException
import app.zuri.android.coreai.ipc.EngineUnstableException
import app.zuri.android.coreai.ipc.LlmClient
import app.zuri.android.coreai.ipc.LlmProtocol
import app.zuri.android.domain.ai.AiTier
import app.zuri.android.domain.ai.GenerationRequest
import app.zuri.android.domain.ai.GenerationResult
import app.zuri.android.domain.ai.LocalLanguageModel
import app.zuri.android.domain.ai.ModelRole
import app.zuri.android.domain.ai.ModelSpec
import com.google.ai.edge.litertlm.Backend
import com.google.ai.edge.litertlm.BenchmarkInfo
import com.google.ai.edge.litertlm.Content
import com.google.ai.edge.litertlm.Contents
import com.google.ai.edge.litertlm.ConversationConfig
import com.google.ai.edge.litertlm.Engine
import com.google.ai.edge.litertlm.EngineConfig
import com.google.ai.edge.litertlm.ExperimentalApi
import com.google.ai.edge.litertlm.Message
import com.google.ai.edge.litertlm.ResponseFormat
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

/**
 * Owns at most one loaded LiteRT-LM [Engine] for the process (from MeetingMind's LlmEngineManager:
 * one native allocation, never reloaded per call, never closed under a running generation).
 * CPU backend: predictable on every arm64 phone; GPU and NPU builds are a later, measured choice.
 */
class LiteRtEngineManager(private val cacheDir: File) {
    private val mutex = Mutex()
    private var engine: Engine? = null
    private var loadedPath: String? = null

    /** Seconds the last load took (0 when the engine was already loaded). */
    var lastLoadSeconds: Double = 0.0
        private set

    suspend fun <T> withEngine(modelPath: String, block: (Engine) -> T): T = withContext(Dispatchers.IO) {
        mutex.withLock {
            val e = engine?.takeIf { loadedPath == modelPath } ?: run {
                runCatching { engine?.close() }
                engine = null
                loadedPath = null
                val start = System.nanoTime()
                cacheDir.mkdirs() // LiteRT-LM refuses a cache directory that doesn't exist yet
                Engine(EngineConfig(modelPath = modelPath, backend = Backend.CPU(), cacheDir = cacheDir.path)).also {
                    it.initialize()
                    lastLoadSeconds = (System.nanoTime() - start) / 1e9
                    engine = it
                    loadedPath = modelPath
                }
            }
            block(e)
        }
    }

    suspend fun release() = withContext(Dispatchers.IO) {
        mutex.withLock {
            runCatching { engine?.close() }
            engine = null
            loadedPath = null
        }
    }
}

internal fun Message.text(): String = contents.contents.filterIsInstance<Content.Text>().joinToString("") { it.text }

/** Runs one turn in a fresh conversation and returns the reply plus the runtime's own timings. */
@OptIn(ExperimentalApi::class) // getBenchmarkInfo is marked experimental in LiteRT-LM 0.20
internal fun Engine.answer(request: GenerationRequest): Pair<String, BenchmarkInfo?> {
    val config = ConversationConfig(
        systemInstruction = request.system?.let { Contents.of(it) },
        maxOutputToken = request.maxOutputTokens,
    )
    createConversation(config).use { conversation ->
        val reply = conversation.sendMessage(request.prompt)
        return reply.text() to runCatching<BenchmarkInfo?> { conversation.getBenchmarkInfo() }.getOrNull()
    }
}

/**
 * One answer constrained to [schema] (JSON Schema): the runtime only lets the model produce tokens
 * that keep the output valid. This is how extraction gets dependable structure from a 2B model.
 */
@OptIn(ExperimentalApi::class)
internal fun Engine.answerJson(prompt: String, schema: String, system: String? = null, maxOutputTokens: Int = 256): String {
    val config = ConversationConfig(
        systemInstruction = system?.let { Contents.of(it) },
        maxOutputToken = maxOutputTokens,
        enableResponseFormat = true,
    )
    createConversation(config).use { conversation ->
        return conversation.sendMessage(prompt, emptyMap(), null, null, null, null, null, ResponseFormat.json(schema)).text()
    }
}

/**
 * The local model: the best installed chat model, in catalog order (recommended first), run in the
 * `:llm` process through [LlmClient]. There is no cloud fallback here (D-13): without a model the
 * caller gets [GenerationResult.NoModelInstalled] and degrades to the Essential tier.
 */
class LiteRtLanguageModel(
    private val catalog: List<ModelSpec>,
    private val storage: ModelStorage,
    private val client: LlmClient,
) : LocalLanguageModel {
    fun activeModel(): ModelSpec? = catalog.filter { it.role == ModelRole.CHAT }.firstOrNull { storage.isInstalled(it) }

    override fun tier(): AiTier = if (activeModel() != null) AiTier.STANDARD else AiTier.ESSENTIAL

    override suspend fun generate(request: GenerationRequest): GenerationResult = run(request, null)

    override suspend fun generateJson(request: GenerationRequest, schema: String): GenerationResult = run(request, schema)

    private suspend fun run(request: GenerationRequest, schema: String?): GenerationResult {
        val spec = activeModel() ?: return GenerationResult.NoModelInstalled
        val path = storage.installedPath(spec) ?: return GenerationResult.NoModelInstalled
        val start = System.currentTimeMillis()
        val args = Bundle().apply {
            putString(LlmProtocol.K_PATH, path)
            putString(LlmProtocol.K_PROMPT, request.prompt)
            request.system?.let { putString(LlmProtocol.K_SYSTEM, it) }
            putInt(LlmProtocol.K_MAX_TOKENS, request.maxOutputTokens)
            schema?.let { putString(LlmProtocol.K_SCHEMA, it) }
        }
        return try {
            val out = client.call(LlmProtocol.OP_GENERATE, args)
            out.getString(LlmProtocol.K_ERROR)?.let { GenerationResult.Failed(it) }
                ?: GenerationResult.Success(out.getString(LlmProtocol.K_TEXT).orEmpty().trim(), spec.id, System.currentTimeMillis() - start)
        } catch (e: EngineStoppedException) {
            GenerationResult.Failed(e.message.orEmpty(), engineStopped = true)
        } catch (e: EngineUnstableException) {
            GenerationResult.Failed(e.message.orEmpty(), engineStopped = true)
        }
    }

    override suspend fun release() {
        runCatching { client.call(LlmProtocol.OP_RELEASE, Bundle()) }
        client.unbind()
    }
}
