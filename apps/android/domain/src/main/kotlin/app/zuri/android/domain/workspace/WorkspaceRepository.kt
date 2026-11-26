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

    /** Throws [IllegalArgumentException] for an unusable name. */
    suspend fun rename(id: WorkspaceId, name: String)

    suspend fun updateBrand(id: WorkspaceId, brand: BrandProfile)

    /**
     * Deletes a business workspace and everything in it (chats, messages, what was understood).
     * Personal can't be deleted. Rules pointing at it are removed.
     */
    suspend fun deleteBusiness(id: WorkspaceId)

    /** What [moveConversation] would move, for the confirmation. */
    suspend fun movePreview(conversation: app.zuri.android.domain.inbox.ConversationId): MoveSummary

    /**
     * Moves a chat to [to] with everything derived from it (D-04 §3): messages, understood items,
     * summary, draft feedback and search vectors. New messages from that chat follow it.
     */
    suspend fun moveConversation(conversation: app.zuri.android.domain.inbox.ConversationId, to: WorkspaceId)

    /** Which workspace new chats from each app go to; apps not listed go to Personal. */
    fun observeRules(): Flow<Map<app.zuri.android.domain.capture.SourceKind, WorkspaceId>>

    suspend fun setRule(source: app.zuri.android.domain.capture.SourceKind, workspace: WorkspaceId?)
}
