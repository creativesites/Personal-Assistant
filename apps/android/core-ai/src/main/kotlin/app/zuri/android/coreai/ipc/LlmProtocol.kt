package app.zuri.android.coreai.ipc

/**
 * The message protocol between the app and the `:llm` process (ARCHITECTURE.md §7). The model
 * runs in its own process so a native crash or an out-of-memory kill takes down only the engine:
 * the app sees a failed call and carries on.
 */
internal object LlmProtocol {
    const val OP_GENERATE = 1
    const val OP_BENCHMARK = 2
    const val OP_RELEASE = 3

    const val K_PATH = "path"
    const val K_PROMPT = "prompt"
    const val K_SYSTEM = "system"
    const val K_MAX_TOKENS = "max"
    /** JSON Schema: when present, the answer is constrained to it. */
    const val K_SCHEMA = "schema"

    const val K_TEXT = "text"
    const val K_ERROR = "error"

    const val K_LOAD = "load"
    const val K_TTFT = "ttft"
    const val K_PREFILL = "prefill"
    const val K_DECODE = "decode"
    const val K_SAMPLE = "sample"
    /** -1 not checked, 0 failed, 1 worked. */
    const val K_STRUCTURED = "structured"
    const val K_STRUCTURED_SECONDS = "structuredSeconds"
}
