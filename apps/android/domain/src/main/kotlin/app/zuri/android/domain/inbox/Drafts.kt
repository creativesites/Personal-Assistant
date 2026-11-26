package app.zuri.android.domain.inbox

sealed interface DraftResult {
    /** [byModel]: written by the on-device model in the owner's voice; false means quick-reply templates (Essential tier). */
    data class Drafts(val drafts: List<String>, val byModel: Boolean) : DraftResult
    /** The chat has no message from the other side to answer. */
    data object NothingToAnswer : DraftResult
    data class Failed(val message: String, val engineStopped: Boolean = false) : DraftResult
    /** No AI model on this phone (auto-replies need one; tapped drafts fall back to quick replies). */
    data object NoModel : DraftResult
}

/**
 * Reply drafts (M4). Written on the phone from the chat's latest messages, its open promises and
 * requests, and the owner's own writing style. A draft is only ever a suggestion: it goes into the
 * reply box for the owner to edit and send, never out on its own.
 */
interface ReplyDrafter {
    suspend fun draft(id: ConversationId): DraftResult

    /**
     * One reply to send on the owner's behalf (auto-reply), written with stricter rules: it agrees to
     * nothing new. Empty drafts mean no safe draft could be written.
     */
    suspend fun draftForAuto(id: ConversationId): DraftResult
}
