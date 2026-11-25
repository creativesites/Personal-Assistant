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
        var structured: Pair<Boolean, Double>? = null
        val (answer, info) = try {
            engines.withEngine(path) { engine ->
                val prose = engine.answer(GenerationRequest(prompt = PROMPT, maxOutputTokens = 96))
                structured = runCatching {
                    val start = System.nanoTime()
                    val raw = engine.answerJson(EXTRACTION_PROMPT, EXTRACTION_SCHEMA)
                    StructuredCheck.isValid(raw) to (System.nanoTime() - start) / 1e9
                }.getOrElse { false to 0.0 }
                prose
            }
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
            structuredOutputWorks = structured?.first, structuredSeconds = structured?.second,
        )
        store.edit { p ->
            val stored = p[key]?.let { runCatching { json.decodeFromString<Stored>(it) }.getOrNull() } ?: Stored()
            p[key] = json.encodeToString(Stored.serializer(), Stored(stored.items + (modelId to Item(b.backend, b.loadSeconds, b.timeToFirstTokenSeconds, b.prefillTokensPerSecond, b.decodeTokensPerSecond, b.sampleAnswer, b.atMillis, b.structuredOutputWorks, b.structuredSeconds))))
        }
        b
    }

    companion object {
        /** Fixed, so results compare across models and phones. Contains nothing personal. */
        /** A made-up message: checks that constrained JSON comes back well-formed and on-schema. */
        const val EXTRACTION_PROMPT = "Extract every commitment from this message as JSON.\n\nMessage from Chanda: \"Can you send me the quotation for 40 drip lines by Friday 10am? I'll pay the deposit on Monday.\""
        const val EXTRACTION_SCHEMA = """{"type":"object","properties":{"commitments":{"type":"array","items":{"type":"object","properties":{"who":{"type":"string"},"what":{"type":"string"},"when":{"type":"string"}},"required":["who","what"]}}},"required":["commitments"]}"""

        const val PROMPT = "In two short sentences, explain what a personal assistant that runs entirely on a phone can help someone with."
    }
}
