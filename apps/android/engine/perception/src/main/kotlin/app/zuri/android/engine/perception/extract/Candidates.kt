package app.zuri.android.engine.perception.extract

import app.zuri.android.domain.memory.MemoryKind
import app.zuri.android.domain.memory.MemoryOrigin

/** One message as perception reads it. [fromMe] is the owner's own message. */
data class ChatLine(
    val id: String,
    val fromMe: Boolean,
    val speaker: String,
    val text: String,
    val sentAtMillis: Long,
)

/** The messages to read in one pass, with a few earlier ones for context (never extracted from). */
data class ChatBatch(
    val conversationTitle: String,
    val isGroup: Boolean,
    val context: List<ChatLine>,
    val lines: List<ChatLine>,
)

/** An item found in a batch, before it is grounded. [line] is the 0-based index into [ChatBatch.lines]. */
data class Candidate(
    val kind: MemoryKind,
    val line: Int,
    val quote: String,
    val summary: String,
    val whenText: String?,
    val origin: MemoryOrigin,
)

/** A grounded item, ready to store. */
data class Grounded(
    val kind: MemoryKind,
    val source: ChatLine,
    val quote: String,
    val text: String,
    val personName: String,
    val dueAtMillis: Long?,
    val dueText: String?,
    val dueHasTime: Boolean,
    val confidence: Float,
    val origin: MemoryOrigin,
)
