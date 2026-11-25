package app.zuri.android.engine.perception

import app.zuri.android.domain.ai.AiTier
import app.zuri.android.domain.ai.GenerationRequest
import app.zuri.android.domain.ai.GenerationResult
import app.zuri.android.domain.ai.LocalLanguageModel

/** A model that returns canned JSON (or nothing installed), recording the prompts it was given. */
class FakeModel(var tier: AiTier = AiTier.STANDARD, var reply: (GenerationRequest) -> GenerationResult = { GenerationResult.Success("""{"items":[]}""", "fake", 1) }) : LocalLanguageModel {
    val prompts = mutableListOf<String>()
    override suspend fun generate(request: GenerationRequest) = reply(request)
    override suspend fun generateJson(request: GenerationRequest, schema: String): GenerationResult {
        prompts += request.prompt
        return if (tier == AiTier.ESSENTIAL) GenerationResult.NoModelInstalled else reply(request)
    }
    override fun tier() = tier
    override suspend fun release() = Unit
}
