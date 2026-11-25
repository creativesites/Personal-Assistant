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
)

sealed interface GenerationResult {
    data class Success(val text: String, val modelId: String, val millis: Long) : GenerationResult
    /** No suitable model is installed. Callers degrade honestly (Essential tier), never call the cloud. */
    data object NoModelInstalled : GenerationResult
    data class Failed(val message: String) : GenerationResult
}

/** The on-device language model. Everything runs locally; there is no network path here. */
interface LocalLanguageModel {
    suspend fun generate(request: GenerationRequest): GenerationResult
    /** Frees the model's memory; the next call loads it again. */
    suspend fun release()
}

interface ModelBenchmarks {
    val results: Flow<Map<String, Benchmark>>
    /** Loads [modelId], answers one fixed prompt, and records the runtime's own timings. */
    suspend fun run(modelId: String): Result<Benchmark>
}
