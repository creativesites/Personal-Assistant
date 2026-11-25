package app.zuri.android.coreai.catalog

import app.zuri.android.domain.ai.ModelRole
import app.zuri.android.domain.ai.ModelSpec
import app.zuri.android.domain.ai.ModelTier

/**
 * The models Zuri offers (ARCHITECTURE.md §7). Every entry is an official litert-community build,
 * Apache-2.0, downloadable without an account. Sizes and SHA-256 are Hugging Face's own LFS
 * metadata, read 2026-11-25; changing a file means changing its checksum here.
 * Injected (not referenced statically), so tests and future remote-updated catalogs can replace it.
 */
object ModelCatalog {
    private const val GB = 1_000_000_000L
    private fun hf(repo: String, file: String) = "https://huggingface.co/$repo/resolve/main/$file"

    val gemma4E2B = ModelSpec(
        id = "gemma-4-e2b-it", name = "Gemma 4 E2B", role = ModelRole.CHAT, tier = ModelTier.STANDARD,
        fileName = "gemma-4-E2B-it.litertlm", url = hf("litert-community/gemma-4-E2B-it-litert-lm", "gemma-4-E2B-it.litertlm"),
        sha256 = "181938105e0eefd105961417e8da75903eacda102c4fce9ce90f50b97139a63c", sizeBytes = 2_588_147_712L,
        minRamBytes = 6 * GB, licence = "Apache-2.0", publisher = "Google (litert-community)", contextTokens = null, parameters = "2B effective",
    )

    val gemma4E4B = ModelSpec(
        id = "gemma-4-e4b-it", name = "Gemma 4 E4B", role = ModelRole.CHAT, tier = ModelTier.HIGH,
        fileName = "gemma-4-E4B-it.litertlm", url = hf("litert-community/gemma-4-E4B-it-litert-lm", "gemma-4-E4B-it.litertlm"),
        sha256 = "0b2a8980ce155fd97673d8e820b4d29d9c7d99b8fa6806f425d969b145bd52e0", sizeBytes = 3_659_530_240L,
        minRamBytes = 11 * GB, licence = "Apache-2.0", publisher = "Google (litert-community)", contextTokens = null, parameters = "4B effective",
    )

    val granite350M = ModelSpec(
        id = "granite-4.0-350m", name = "Granite 4.0 350M", role = ModelRole.CHAT, tier = ModelTier.LITE,
        fileName = "granite-4.0-350m_q8_ekv1280.litertlm", url = hf("litert-community/granite-4.0-350m-litert-lm", "granite-4.0-350m_q8_ekv1280.litertlm"),
        sha256 = "c8e9a29493f62b7c44461fb36980987c4c1454c75e95f57ba0539a8edc9dce76", sizeBytes = 468_209_584L,
        minRamBytes = 3 * GB, licence = "Apache-2.0", publisher = "IBM (litert-community)", contextTokens = 1280, parameters = "350M",
    )

    val embeddingGemma270M = ModelSpec(
        id = "embeddinggemma-2-text-270m", name = "EmbeddingGemma 2 (text, 270M)", role = ModelRole.EMBEDDING, tier = ModelTier.LITE,
        fileName = "embeddinggemma-2-text-270m.litertlm", url = hf("litert-community/embeddinggemma-2-text-270m-litert-lm", "embeddinggemma-2-text-270m.litertlm"),
        sha256 = "2d079ee2f6f066b1f368e8d7c819f55214eaef1d0513b312321901f30ab286fb", sizeBytes = 164_626_432L,
        minRamBytes = 2 * GB, licence = "Apache-2.0", publisher = "Google (litert-community)", contextTokens = null, parameters = "270M",
    )

    val all: List<ModelSpec> = listOf(gemma4E2B, granite350M, gemma4E4B, embeddingGemma270M)
}
