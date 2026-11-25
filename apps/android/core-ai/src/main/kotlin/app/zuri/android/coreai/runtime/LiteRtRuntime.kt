package app.zuri.android.coreai.runtime

import app.zuri.android.coreai.storage.ModelStorage
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
 * The local model: the best installed chat model, in catalog order (recommended first). There is
 * no cloud fallback here (D-13): without a model the caller gets [GenerationResult.NoModelInstalled].
 */
class LiteRtLanguageModel(
    private val catalog: List<ModelSpec>,
    private val storage: ModelStorage,
    private val engines: LiteRtEngineManager,
) : LocalLanguageModel {
    fun activeModel(): ModelSpec? = catalog.filter { it.role == ModelRole.CHAT }.firstOrNull { storage.isInstalled(it) }

    override suspend fun generate(request: GenerationRequest): GenerationResult {
        val spec = activeModel() ?: return GenerationResult.NoModelInstalled
        val path = storage.installedPath(spec) ?: return GenerationResult.NoModelInstalled
        val start = System.currentTimeMillis()
        return runCatching { engines.withEngine(path) { it.answer(request) } }
            .fold(
                { (text, _) -> GenerationResult.Success(text.trim(), spec.id, System.currentTimeMillis() - start) },
                { GenerationResult.Failed(it.message ?: it.javaClass.simpleName) },
            )
    }

    override suspend fun release() = engines.release()
}
