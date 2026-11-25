package app.zuri.android.domain.ai

import kotlinx.coroutines.flow.Flow

data class GenerationRequest(
    val prompt: String,
    val system: String? = null,
    val maxOutputTokens: Int = 512,
)

/** Speed as measured by the runtime itself on this phone (never estimated). */
data class Benchmark(
    val modelId: String,
    val backend: String,
    val loadSeconds: Double,
    val timeToFirstTokenSeconds: Double,
    val prefillTokensPerSecond: Double,
    val decodeTokensPerSecond: Double,
    val sampleAnswer: String,
    val atMillis: Long,
    /** Whether a schema-constrained answer parsed as the requested JSON; null when not checked. */
    val structuredOutputWorks: Boolean? = null,
    val structuredSeconds: Double? = null,
)

sealed interface GenerationResult {
    data class Success(val text: String, val modelId: String, val millis: Long) : GenerationResult
    /** No suitable model is installed. Callers degrade honestly (Essential tier), never call the cloud. */
    data object NoModelInstalled : GenerationResult
    /** [engineStopped]: the model's process ended mid-call (crash or memory reclaim); the app is unaffected. */
    data class Failed(val message: String, val engineStopped: Boolean = false) : GenerationResult
}

/**
 * What understanding this phone can do right now (ARCHITECTURE.md §7). ESSENTIAL works on every
 * phone with rules only; STANDARD uses an installed on-device model.
 */
enum class AiTier { ESSENTIAL, STANDARD }

/** The on-device language model. Everything runs locally; there is no network path here. */
interface LocalLanguageModel {
    suspend fun generate(request: GenerationRequest): GenerationResult
    /**
     * An answer constrained to [schema] (JSON Schema). The runtime only lets the model produce
     * tokens that keep the output valid JSON for the schema; callers still validate the content.
     */
    suspend fun generateJson(request: GenerationRequest, schema: String): GenerationResult
    /** ESSENTIAL when no chat model is installed. */
    fun tier(): AiTier
    /** Frees the model's memory; the next call loads it again. */
    suspend fun release()
}

interface ModelBenchmarks {
    val results: Flow<Map<String, Benchmark>>
    /** Loads [modelId], answers one fixed prompt, and records the runtime's own timings. */
    suspend fun run(modelId: String): Result<Benchmark>
}
