package app.zuri.android.domain.workspace

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class WorkspaceNamesTest {
    @Test fun trimsAndCollapsesWhitespace() {
        assertThat(WorkspaceNames.normalize("  Kalulu   Irrigation ")).isEqualTo("Kalulu Irrigation")
    }

    @Test fun rejectsBlank() {
        assertThat(WorkspaceNames.normalize("   ")).isNull()
    }

    @Test fun rejectsTooLong() {
        assertThat(WorkspaceNames.normalize("x".repeat(WorkspaceNames.MAX_LENGTH + 1))).isNull()
        assertThat(WorkspaceNames.normalize("x".repeat(WorkspaceNames.MAX_LENGTH))).isNotNull()
    }
}
