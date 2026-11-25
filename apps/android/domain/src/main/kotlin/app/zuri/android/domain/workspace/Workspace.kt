package app.zuri.android.domain.workspace

/**
 * A workspace is a hard isolation boundary (DECISIONS.md D-04): every domain record belongs to
 * exactly one, and reads are filtered by workspace before anything else happens.
 * There is always exactly one [WorkspaceKind.PERSONAL] workspace; business workspaces are optional.
 */
@JvmInline
value class WorkspaceId(val value: String) {
    init {
        require(value.isNotBlank()) { "WorkspaceId must not be blank" }
    }
}

enum class WorkspaceKind { PERSONAL, BUSINESS }

/** The tint a workspace uses across the app chrome, so the active context is always visible. */
enum class WorkspaceAccent { TEAL, INDIGO, PLUM, AMBER, SKY, SLATE }

data class Workspace(
    val id: WorkspaceId,
    val kind: WorkspaceKind,
    val name: String,
    val accent: WorkspaceAccent,
    val createdAtMillis: Long,
)

object WorkspaceNames {
    const val MAX_LENGTH = 60

    /** Returns the cleaned name, or null when the name can't be used. */
    fun normalize(raw: String): String? {
        val cleaned = raw.trim().replace(Regex("\\s+"), " ")
        return cleaned.takeIf { it.isNotEmpty() && it.length <= MAX_LENGTH }
    }
}
