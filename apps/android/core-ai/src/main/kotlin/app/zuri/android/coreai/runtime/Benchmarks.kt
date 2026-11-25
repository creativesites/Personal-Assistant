package app.zuri.android.coreai.runtime

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import app.zuri.android.core.common.Clock
import app.zuri.android.core.common.ZuriLog
import com.google.ai.edge.litertlm.ExperimentalApi
import com.google.ai.edge.litertlm.ExperimentalFlags
import app.zuri.android.coreai.storage.ModelStorage
import app.zuri.android.domain.ai.Benchmark
import app.zuri.android.domain.ai.GenerationRequest
import app.zuri.android.domain.ai.ModelBenchmarks
import app.zuri.android.domain.ai.ModelSpec
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/** A03 benchmark: load the model, answer one fixed prompt, keep what the runtime measured. */
class LiteRtBenchmarks(
    private val catalog: List<ModelSpec>,
    private val storage: ModelStorage,
    private val engines: LiteRtEngineManager,
    private val store: DataStore<Preferences>,
    private val clock: Clock,
) : ModelBenchmarks {
    private val key = stringPreferencesKey("benchmarks_v1")
    private val json = Json { ignoreUnknownKeys = true }

    @Serializable
    private data class Stored(val items: Map<String, Item> = emptyMap())

    @Serializable
    private data class Item(val backend: String, val load: Double, val ttft: Double, val prefill: Double, val decode: Double, val sample: String, val at: Long)

    override val results: Flow<Map<String, Benchmark>> = store.data.map { p ->
        val stored = p[key]?.let { runCatching { json.decodeFromString<Stored>(it) }.getOrNull() } ?: Stored()
        stored.items.mapValues { (id, i) -> Benchmark(id, i.backend, i.load, i.ttft, i.prefill, i.decode, i.sample, i.at) }
    }

    override suspend fun run(modelId: String): Result<Benchmark> = runCatching { measure(modelId) }
        .onFailure { e ->
            // The error's type and the runtime's own message only: no prompts, no content.
            ZuriLog.w("AI", "benchmark_failed", "model" to modelId, "error" to e.javaClass.name, "detail" to (e.message ?: "").take(300))
            generateSequence(e.cause) { it.cause }.take(3).forEach { c -> ZuriLog.w("AI", "benchmark_cause", "error" to c.javaClass.name, "detail" to (c.message ?: "").take(300)) }
        }

    private suspend fun measure(modelId: String): Benchmark = run {
        val spec = catalog.first { it.id == modelId }
        val path = checkNotNull(storage.installedPath(spec)) { "Model not installed" }
        engines.release() // measure a cold load
        // The runtime only records timings when its benchmark flag is on at engine creation; the
        // engine is released afterwards so everyday use doesn't run in benchmark mode.
        @OptIn(ExperimentalApi::class)
        ExperimentalFlags.enableBenchmark = true
        val (answer, info) = try {
            engines.withEngine(path) { it.answer(GenerationRequest(prompt = PROMPT, maxOutputTokens = 96)) }
        } finally {
            @OptIn(ExperimentalApi::class)
            ExperimentalFlags.enableBenchmark = false
            engines.release()
        }
        val b = Benchmark(
            modelId = modelId, backend = "CPU", loadSeconds = engines.lastLoadSeconds,
            timeToFirstTokenSeconds = info?.timeToFirstTokenInSecond ?: 0.0,
            prefillTokensPerSecond = info?.lastPrefillTokensPerSecond ?: 0.0,
            decodeTokensPerSecond = info?.lastDecodeTokensPerSecond ?: 0.0,
            sampleAnswer = answer.trim().take(400), atMillis = clock.nowMillis(),
        )
        store.edit { p ->
            val stored = p[key]?.let { runCatching { json.decodeFromString<Stored>(it) }.getOrNull() } ?: Stored()
            p[key] = json.encodeToString(Stored.serializer(), Stored(stored.items + (modelId to Item(b.backend, b.loadSeconds, b.timeToFirstTokenSeconds, b.prefillTokensPerSecond, b.decodeTokensPerSecond, b.sampleAnswer, b.atMillis))))
        }
        b
    }

    companion object {
        /** Fixed, so results compare across models and phones. Contains nothing personal. */
        const val PROMPT = "In two short sentences, explain what a personal assistant that runs entirely on a phone can help someone with."
    }
}
