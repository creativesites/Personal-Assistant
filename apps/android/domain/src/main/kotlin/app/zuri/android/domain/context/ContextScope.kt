package app.zuri.android.domain.context

import app.zuri.android.domain.workspace.WorkspaceId

/** How sensitive a record is. SECRET items never leave the device and rarely enter prompts. */
enum class Sensitivity { NORMAL, PERSONAL, SECRET }

/** Why data is being read. Consent and remote-processing rules are keyed on purpose. */
enum class Purpose { BROWSE, ASK, DRAFT_REPLY, DRAFT_DOCUMENT, BRIEF, BI_QUERY, EXTRACT, SEARCH }

/**
 * What a single read or AI request may see (ARCHITECTURE.md §8.1). Repositories require a scope for
 * every content query; prompt assembly rejects any record outside it.
 */
data class ContextScope(
    val workspaces: Set<WorkspaceId>,
    val purpose: Purpose,
    val maxSensitivity: Sensitivity = Sensitivity.NORMAL,
    /** True only after an explicit user action such as "Also look in Personal". */
    val widenedByUser: Boolean = false,
) {
    init {
        require(workspaces.isNotEmpty()) { "A ContextScope must include at least one workspace" }
    }

    fun allows(workspace: WorkspaceId, sensitivity: Sensitivity = Sensitivity.NORMAL): Boolean =
        workspace in workspaces && sensitivity.ordinal <= maxSensitivity.ordinal

    /** Adds workspaces at the user's explicit request. Never called implicitly. */
    fun widenedTo(extra: Set<WorkspaceId>): ContextScope =
        copy(workspaces = workspaces + extra, widenedByUser = true)

    companion object {
        fun single(workspace: WorkspaceId, purpose: Purpose) = ContextScope(setOf(workspace), purpose)
    }
}
