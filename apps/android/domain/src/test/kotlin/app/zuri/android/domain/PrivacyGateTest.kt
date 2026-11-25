package app.zuri.android.domain

import app.zuri.android.domain.ai.AiPurpose
import app.zuri.android.domain.ai.DenyReason
import app.zuri.android.domain.ai.GateDecision
import app.zuri.android.domain.ai.PayloadClass
import app.zuri.android.domain.ai.PrivacyGate
import app.zuri.android.domain.workspace.WorkspaceId
import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PrivacyGateTest {
    private val personal = WorkspaceId("personal")
    private val business = WorkspaceId("business")

    @Test fun theShippedGateDeniesEverything() {
        for (purpose in AiPurpose.entries) for (cls in PayloadClass.entries) {
            assertThat(PrivacyGate.Closed.authorize(purpose, cls, "anthropic", personal)).isInstanceOf(GateDecision.Denied::class.java)
        }
    }

    @Test fun defaultIsDenyEvenForAKnownProvider() {
        val gate = PrivacyGate({ _, _, _ -> false }, setOf("anthropic"), { 1L })
        assertThat(gate.authorize(AiPurpose.ASK, PayloadClass.PERSONAL, "anthropic", personal)).isEqualTo(GateDecision.Denied(DenyReason.NO_CONSENT))
    }

    @Test fun consentIsPerPurposeAndPerWorkspace() {
        val gate = PrivacyGate({ p, w, _ -> p == AiPurpose.DOCUMENT_DRAFTING && w == business }, setOf("anthropic"), { 1L })
        assertThat(gate.authorize(AiPurpose.DOCUMENT_DRAFTING, PayloadClass.PERSONAL, "anthropic", business)).isInstanceOf(GateDecision.Allowed::class.java)
        assertThat(gate.authorize(AiPurpose.DOCUMENT_DRAFTING, PayloadClass.PERSONAL, "anthropic", personal)).isEqualTo(GateDecision.Denied(DenyReason.NO_CONSENT))
        assertThat(gate.authorize(AiPurpose.ASK, PayloadClass.PERSONAL, "anthropic", business)).isEqualTo(GateDecision.Denied(DenyReason.NO_CONSENT))
    }

    @Test fun secretNeverLeavesWhateverTheConsent() {
        val gate = PrivacyGate({ _, _, _ -> true }, setOf("anthropic"), { 1L })
        assertThat(gate.authorize(AiPurpose.ASK, PayloadClass.SECRET, "anthropic", personal)).isEqualTo(GateDecision.Denied(DenyReason.SECRET_NEVER_LEAVES))
    }

    @Test fun unknownProvidersAreRefused() {
        val gate = PrivacyGate({ _, _, _ -> true }, setOf("anthropic"), { 1L })
        assertThat(gate.authorize(AiPurpose.ASK, PayloadClass.PUBLIC, "someone-else", personal)).isEqualTo(GateDecision.Denied(DenyReason.UNKNOWN_PROVIDER))
    }
}
