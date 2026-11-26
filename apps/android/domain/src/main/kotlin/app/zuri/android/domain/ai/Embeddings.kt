package app.zuri.android.domain.ai

/** EmbeddingGemma is trained with different prompts for questions and for the texts searched. */
enum class EmbedPurpose { QUERY, DOCUMENT }

sealed interface EmbedResult {
    /** One unit-length vector per input text, in order. */
    data class Vectors(val vectors: List<FloatArray>, val modelId: String) : EmbedResult
    data object NoModel : EmbedResult
    data class Failed(val message: String, val engineStopped: Boolean = false) : EmbedResult
}

/**
 * The on-device text embedder (D-08: EmbeddingGemma), run in the `:llm` process like the chat
 * model. Used for meaning-based search in Ask Zuri; nothing leaves the phone.
 */
interface LocalEmbedder {
    /** The installed embedding model, or null. */
    fun modelId(): String?
    suspend fun embed(texts: List<String>, purpose: EmbedPurpose): EmbedResult
}
