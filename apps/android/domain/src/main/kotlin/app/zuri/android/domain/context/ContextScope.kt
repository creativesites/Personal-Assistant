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

    /**
     * The prompt assembler's check (ARCHITECTURE.md §8.1): every record about to enter a prompt, a
     * search result or an answer must belong to a workspace in this scope. Throws otherwise.
     */
    fun requireAll(workspaceIds: Collection<String>, what: String) {
        val outside = workspaceIds.filter { WorkspaceId(it) !in workspaces }
        if (outside.isNotEmpty()) throw ScopeViolation("$what: ${outside.size} record(s) outside the $purpose scope")
    }

    val ids: List<String> get() = workspaces.map { it.value }

    companion object {
        fun single(workspace: WorkspaceId, purpose: Purpose) = ContextScope(setOf(workspace), purpose)
    }
}

/** A record outside the request's scope reached a prompt or a result. Never caught to carry on. */
class ScopeViolation(message: String) : IllegalStateException(message)

/** The context the owner is looking at: one workspace, or Hybrid (Personal plus chosen businesses). */
data class ActiveContext(
    val primary: app.zuri.android.domain.workspace.Workspace,
    val members: List<app.zuri.android.domain.workspace.Workspace>,
    val hybrid: Boolean,
) {
    val ids: Set<WorkspaceId> get() = members.map { it.id }.toSet()
    val label: String get() = members.joinToString(" + ") { it.name }

    /**
     * The scope a screen reads with (§8.2). Hybrid is a view chosen by the owner, so reasoning over
     * it counts as widened by the user and is logged.
     */
    fun scope(purpose: Purpose) = ContextScope(ids, purpose, widenedByUser = hybrid)
}

interface ActiveContextProvider {
    val active: kotlinx.coroutines.flow.Flow<ActiveContext?>
}

/** One explicit widening of scope, kept on the phone so the owner can see when contexts were mixed. */
data class ContextWidening(val atMillis: Long, val purpose: Purpose, val from: List<String>, val added: List<String>)

interface ContextLedger {
    suspend fun record(purpose: Purpose, from: List<String>, added: List<String>)
    fun observe(): kotlinx.coroutines.flow.Flow<List<ContextWidening>>
}
