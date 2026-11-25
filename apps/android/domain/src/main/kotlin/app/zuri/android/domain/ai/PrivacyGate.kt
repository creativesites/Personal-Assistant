package app.zuri.android.domain.ai

import app.zuri.android.domain.workspace.WorkspaceId

/** Why AI would run (DECISIONS.md D-13): consent is per purpose and per workspace. */
enum class AiPurpose { ASK, EXTRACTION, EMBEDDING, DOCUMENT_DRAFTING, TRANSCRIPTION }

/** How sensitive the payload is (SECURITY_AND_PRIVACY.md §4). */
enum class PayloadClass { PUBLIC, PERSONAL, SENSITIVE, SECRET }

/**
 * Proof that one remote AI call was authorised. It can only be made by [PrivacyGate], so any code
 * that sends content to a cloud provider has to go through the gate first: the remote client's
 * functions take a token as a parameter, which the compiler enforces.
 */
class GateToken internal constructor(
    val purpose: AiPurpose,
    val payloadClass: PayloadClass,
    val provider: String,
    val workspace: WorkspaceId,
    val issuedAtMillis: Long,
)

sealed interface GateDecision {
    data class Allowed(val token: GateToken) : GateDecision
    data class Denied(val reason: DenyReason) : GateDecision
}

enum class DenyReason {
    /** SECRET material never leaves the phone, whatever the person has consented to. */
    SECRET_NEVER_LEAVES,
    /** The default: no consent recorded for this purpose, workspace and provider. */
    NO_CONSENT,
    /** The provider isn't one Zuri knows how to call (none are, before cloud features exist). */
    UNKNOWN_PROVIDER,
}

/** The person's explicit choices. Nothing is assumed: absence means no. */
fun interface ConsentStore {
    fun allows(purpose: AiPurpose, workspace: WorkspaceId, provider: String): Boolean
}

/**
 * The one gate in front of all network AI traffic (D-13). Default deny; no silent fallback when a
 * local model is missing. The egress ledger records what actually leaves, at send time, in the
 * remote client, so a granted token that is never used leaves no false record.
 */
class PrivacyGate(
    private val consents: ConsentStore,
    private val knownProviders: Set<String>,
    private val now: () -> Long,
) {
    fun authorize(purpose: AiPurpose, payloadClass: PayloadClass, provider: String, workspace: WorkspaceId): GateDecision = when {
        payloadClass == PayloadClass.SECRET -> GateDecision.Denied(DenyReason.SECRET_NEVER_LEAVES)
        provider !in knownProviders -> GateDecision.Denied(DenyReason.UNKNOWN_PROVIDER)
        !consents.allows(purpose, workspace, provider) -> GateDecision.Denied(DenyReason.NO_CONSENT)
        else -> GateDecision.Allowed(GateToken(purpose, payloadClass, provider, workspace, now()))
    }

    companion object {
        /** Before cloud AI exists (M7+): nothing is consented and no provider is known. */
        val Closed = PrivacyGate(consents = { _, _, _ -> false }, knownProviders = emptySet(), now = { 0L })
    }
}
