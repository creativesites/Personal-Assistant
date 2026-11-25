package app.zuri.android.coreai.runtime

import android.os.Bundle
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import app.zuri.android.core.common.Clock
import app.zuri.android.core.common.ZuriLog
import app.zuri.android.coreai.ipc.LlmClient
import app.zuri.android.coreai.ipc.LlmProtocol
import app.zuri.android.coreai.storage.ModelStorage
import app.zuri.android.domain.ai.Benchmark
import app.zuri.android.domain.ai.GenerationRequest
import app.zuri.android.domain.ai.ModelBenchmarks
import app.zuri.android.domain.ai.ModelSpec
import com.google.ai.edge.litertlm.ExperimentalApi
import com.google.ai.edge.litertlm.ExperimentalFlags
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * A03 benchmark: load the model, answer one fixed prompt, keep what the runtime measured. The
 * measuring happens in the `:llm` process ([measureBenchmark]); results are stored here, in the app.
 */
class LiteRtBenchmarks(
    private val catalog: List<ModelSpec>,
    private val storage: ModelStorage,
    private val client: LlmClient,
    private val store: DataStore<Preferences>,
    private val clock: Clock,
) : ModelBenchmarks {
    private val key = stringPreferencesKey("benchmarks_v1")
    private val json = Json { ignoreUnknownKeys = true }

    @Serializable
    private data class Stored(val items: Map<String, Item> = emptyMap())

    @Serializable
    private data class Item(
        val backend: String, val load: Double, val ttft: Double, val prefill: Double, val decode: Double, val sample: String, val at: Long,
        val structured: Boolean? = null, val structuredSeconds: Double? = null,
    )

    override val results: Flow<Map<String, Benchmark>> = store.data.map { p ->
        val stored = p[key]?.let { runCatching { json.decodeFromString<Stored>(it) }.getOrNull() } ?: Stored()
        stored.items.mapValues { (id, i) -> Benchmark(id, i.backend, i.load, i.ttft, i.prefill, i.decode, i.sample, i.at, i.structured, i.structuredSeconds) }
    }

    override suspend fun run(modelId: String): Result<Benchmark> = runCatching { measure(modelId) }
        .onFailure { e ->
            // The error's type and the runtime's own message only: no prompts, no content.
            ZuriLog.w("AI", "benchmark_failed", "model" to modelId, "error" to e.javaClass.name, "detail" to (e.message ?: "").take(300))
        }

    private suspend fun measure(modelId: String): Benchmark {
        val spec = catalog.first { it.id == modelId }
        val path = checkNotNull(storage.installedPath(spec)) { "Model not installed" }
        val out = client.call(LlmProtocol.OP_BENCHMARK, Bundle().apply { putString(LlmProtocol.K_PATH, path) })
        out.getString(LlmProtocol.K_ERROR)?.let { error(it) }
        val structured = out.getInt(LlmProtocol.K_STRUCTURED, -1)
        val b = Benchmark(
            modelId = modelId, backend = "CPU",
            loadSeconds = out.getDouble(LlmProtocol.K_LOAD),
            timeToFirstTokenSeconds = out.getDouble(LlmProtocol.K_TTFT),
            prefillTokensPerSecond = out.getDouble(LlmProtocol.K_PREFILL),
            decodeTokensPerSecond = out.getDouble(LlmProtocol.K_DECODE),
            sampleAnswer = out.getString(LlmProtocol.K_SAMPLE).orEmpty(), atMillis = clock.nowMillis(),
            structuredOutputWorks = if (structured < 0) null else structured == 1,
            structuredSeconds = if (structured < 0) null else out.getDouble(LlmProtocol.K_STRUCTURED_SECONDS),
        )
        store.edit { p ->
            val stored = p[key]?.let { runCatching { json.decodeFromString<Stored>(it) }.getOrNull() } ?: Stored()
            p[key] = json.encodeToString(Stored.serializer(), Stored(stored.items + (modelId to Item(b.backend, b.loadSeconds, b.timeToFirstTokenSeconds, b.prefillTokensPerSecond, b.decodeTokensPerSecond, b.sampleAnswer, b.atMillis, b.structuredOutputWorks, b.structuredSeconds))))
        }
        return b
    }

    companion object {
        /** A made-up message: checks that constrained JSON comes back well-formed and on-schema. */
        const val EXTRACTION_PROMPT = "Extract every commitment from this message as JSON.\n\nMessage from Chanda: \"Can you send me the quotation for 40 drip lines by Friday 10am? I'll pay the deposit on Monday.\""
        const val EXTRACTION_SCHEMA = """{"type":"object","properties":{"commitments":{"type":"array","items":{"type":"object","properties":{"who":{"type":"string"},"what":{"type":"string"},"when":{"type":"string"}},"required":["who","what"]}}},"required":["commitments"]}"""

        /** Fixed, so results compare across models and phones. Contains nothing personal. */
        const val PROMPT = "In two short sentences, explain what a personal assistant that runs entirely on a phone can help someone with."
    }
}

/** Runs in the `:llm` process: a cold load, the fixed prose prompt, then a constrained extraction. */
internal suspend fun measureBenchmark(engines: LiteRtEngineManager, path: String): Bundle {
    engines.release() // measure a cold load
    // The runtime only records timings when its benchmark flag is on at engine creation; the
    // engine is released afterwards so everyday use doesn't run in benchmark mode.
    @OptIn(ExperimentalApi::class)
    ExperimentalFlags.enableBenchmark = true
    var structured: Pair<Boolean, Double>? = null
    val (answer, info) = try {
        engines.withEngine(path) { engine ->
            val prose = engine.answer(GenerationRequest(prompt = LiteRtBenchmarks.PROMPT, maxOutputTokens = 96))
            structured = runCatching {
                val start = System.nanoTime()
                val raw = engine.answerJson(LiteRtBenchmarks.EXTRACTION_PROMPT, LiteRtBenchmarks.EXTRACTION_SCHEMA)
                StructuredCheck.isValid(raw) to (System.nanoTime() - start) / 1e9
            }.getOrElse { false to 0.0 }
            prose
        }
    } finally {
        @OptIn(ExperimentalApi::class)
        ExperimentalFlags.enableBenchmark = false
        engines.release()
    }
    return Bundle().apply {
        putDouble(LlmProtocol.K_LOAD, engines.lastLoadSeconds)
        putDouble(LlmProtocol.K_TTFT, info?.timeToFirstTokenInSecond ?: 0.0)
        putDouble(LlmProtocol.K_PREFILL, info?.lastPrefillTokensPerSecond ?: 0.0)
        putDouble(LlmProtocol.K_DECODE, info?.lastDecodeTokensPerSecond ?: 0.0)
        putString(LlmProtocol.K_SAMPLE, answer.trim().take(400))
        putInt(LlmProtocol.K_STRUCTURED, structured?.let { if (it.first) 1 else 0 } ?: -1)
        putDouble(LlmProtocol.K_STRUCTURED_SECONDS, structured?.second ?: 0.0)
    }
}
