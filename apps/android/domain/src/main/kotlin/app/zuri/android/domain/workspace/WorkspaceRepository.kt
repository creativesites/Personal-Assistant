package app.zuri.android.domain.workspace

import kotlinx.coroutines.flow.Flow

interface WorkspaceRepository {
    /** All workspaces that have not been deleted, Personal first. */
    fun observeAll(): Flow<List<Workspace>>

    /** Returns the Personal workspace, creating it on first use. Safe to call repeatedly. */
    suspend fun ensurePersonal(): Workspace

    /** Creates a business workspace; throws [IllegalArgumentException] for an unusable name. */
    suspend fun createBusiness(name: String, accent: WorkspaceAccent): Workspace

    suspend fun get(id: WorkspaceId): Workspace?
}
