package app.zuri.android.domain.context

import app.zuri.android.domain.workspace.WorkspaceId
import com.google.common.truth.Truth.assertThat
import org.junit.Assert.assertThrows
import org.junit.Test

class ContextScopeTest {
    private val personal = WorkspaceId("personal")
    private val bizA = WorkspaceId("biz-a")
    private val bizB = WorkspaceId("biz-b")

    @Test fun emptyScopeIsRejected() {
        assertThrows(IllegalArgumentException::class.java) { ContextScope(emptySet(), Purpose.ASK) }
    }

    @Test fun businessScopeNeverAllowsAnotherBusiness() {
        val scope = ContextScope.single(bizA, Purpose.DRAFT_DOCUMENT)
        assertThat(scope.allows(bizA)).isTrue()
        assertThat(scope.allows(bizB)).isFalse()
        assertThat(scope.allows(personal)).isFalse()
    }

    @Test fun sensitivityCeilingIsEnforced() {
        val scope = ContextScope.single(personal, Purpose.ASK)
        assertThat(scope.allows(personal, Sensitivity.NORMAL)).isTrue()
        assertThat(scope.allows(personal, Sensitivity.PERSONAL)).isFalse()
        assertThat(scope.copy(maxSensitivity = Sensitivity.PERSONAL).allows(personal, Sensitivity.SECRET)).isFalse()
    }

    @Test fun wideningIsExplicitAndRecorded() {
        val scope = ContextScope.single(bizA, Purpose.ASK)
        assertThat(scope.widenedByUser).isFalse()
        val widened = scope.widenedTo(setOf(personal))
        assertThat(widened.widenedByUser).isTrue()
        assertThat(widened.allows(personal)).isTrue()
        assertThat(widened.allows(bizB)).isFalse()
    }
}
