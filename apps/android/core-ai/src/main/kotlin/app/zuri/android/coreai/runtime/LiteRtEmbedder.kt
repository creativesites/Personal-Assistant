package app.zuri.android.coreai.runtime

import android.os.Bundle
import app.zuri.android.coreai.ipc.EngineStoppedException
import app.zuri.android.coreai.ipc.EngineUnstableException
import app.zuri.android.coreai.ipc.LlmClient
import app.zuri.android.coreai.ipc.LlmProtocol
import app.zuri.android.coreai.storage.ModelStorage
import app.zuri.android.domain.ai.EmbedPurpose
import app.zuri.android.domain.ai.EmbedResult
import app.zuri.android.domain.ai.LocalEmbedder
import app.zuri.android.domain.ai.ModelRole
import app.zuri.android.domain.ai.ModelSpec
import com.google.ai.edge.litertlm.Backend
import com.google.ai.edge.litertlm.EmbeddingEngine
import com.google.ai.edge.litertlm.EmbeddingEngineConfig
import com.google.ai.edge.litertlm.EmbeddingOptions
import com.google.ai.edge.litertlm.InputData
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

/** Owns at most one loaded embedding engine in the `:llm` process, separate from the chat engine. */
class LiteRtEmbeddingManager(private val cacheDir: File) {
    private val mutex = Mutex()
    private var engine: EmbeddingEngine? = null
    private var loadedPath: String? = null

    suspend fun embed(modelPath: String, texts: List<String>, dimension: Int): List<FloatArray> = withContext(Dispatchers.IO) {
        mutex.withLock {
            val e = engine?.takeIf { loadedPath == modelPath } ?: run {
                runCatching { engine?.close() }
                engine = null
                cacheDir.mkdirs()
                EmbeddingEngine(EmbeddingEngineConfig(modelPath, Backend.CPU(), null, null, cacheDir.path)).also {
                    it.initialize()
                    engine = it
                    loadedPath = modelPath
                }
            }
            val options = EmbeddingOptions(true, null, dimension)
            texts.map { t -> e.computeEmbedding(listOf(InputData.Text(t)), options).embedding }
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

/**
 * The installed EmbeddingGemma, run in the `:llm` process through [LlmClient]. Texts carry the
 * model's own task prompts: "task: search result | query: …" for questions and
 * "title: none | text: …" for the messages searched.
 */
class LiteRtEmbedder(
    private val catalog: List<ModelSpec>,
    private val storage: ModelStorage,
    private val client: LlmClient,
) : LocalEmbedder {
    private fun active(): ModelSpec? = catalog.filter { it.role == ModelRole.EMBEDDING }.firstOrNull { storage.isInstalled(it) }

    override fun modelId(): String? = active()?.id

    override suspend fun embed(texts: List<String>, purpose: EmbedPurpose): EmbedResult {
        if (texts.isEmpty()) return EmbedResult.Vectors(emptyList(), modelId().orEmpty())
        val spec = active() ?: return EmbedResult.NoModel
        val path = storage.installedPath(spec) ?: return EmbedResult.NoModel
        val prompted = texts.map { if (purpose == EmbedPurpose.QUERY) "task: search result | query: $it" else "title: none | text: $it" }
        val args = Bundle().apply {
            putString(LlmProtocol.K_PATH, path)
            putStringArrayList(LlmProtocol.K_TEXTS, ArrayList(prompted))
            putInt(LlmProtocol.K_DIM, DIMENSION)
        }
        return try {
            val out = client.call(LlmProtocol.OP_EMBED, args)
            out.getString(LlmProtocol.K_ERROR)?.let { return EmbedResult.Failed(it) }
            val flat = out.getFloatArray(LlmProtocol.K_VECTORS) ?: return EmbedResult.Failed("no vectors")
            val dim = out.getInt(LlmProtocol.K_DIM)
            if (dim <= 0 || flat.size != dim * texts.size) return EmbedResult.Failed("unexpected vector size")
            EmbedResult.Vectors(List(texts.size) { i -> flat.copyOfRange(i * dim, (i + 1) * dim) }, spec.id)
        } catch (e: EngineStoppedException) {
            EmbedResult.Failed(e.message.orEmpty(), engineStopped = true)
        } catch (e: EngineUnstableException) {
            EmbedResult.Failed(e.message.orEmpty(), engineStopped = true)
        }
    }

    companion object {
        /** EmbeddingGemma 2 supports 128–768 (Matryoshka); 256 keeps each message at 1 KB. */
        const val DIMENSION = 256
    }
}
