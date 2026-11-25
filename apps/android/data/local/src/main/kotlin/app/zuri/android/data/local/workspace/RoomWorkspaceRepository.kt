package app.zuri.android.data.local.workspace

import androidx.room.withTransaction
import app.zuri.android.core.common.Clock
import app.zuri.android.core.common.UuidV7
import app.zuri.android.data.local.db.WorkspaceEntity
import app.zuri.android.data.local.db.ZuriDatabase
import app.zuri.android.domain.workspace.Workspace
import app.zuri.android.domain.workspace.WorkspaceAccent
import app.zuri.android.domain.workspace.WorkspaceId
import app.zuri.android.domain.workspace.WorkspaceKind
import app.zuri.android.domain.workspace.WorkspaceNames
import app.zuri.android.domain.workspace.WorkspaceRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

class RoomWorkspaceRepository(
    private val db: ZuriDatabase,
    private val clock: Clock,
) : WorkspaceRepository {
    private val dao = db.workspaceDao()

    override fun observeAll(): Flow<List<Workspace>> = dao.observeActive().map { list -> list.map { it.toDomain() } }

    override suspend fun ensurePersonal(): Workspace = db.withTransaction {
        dao.personal()?.toDomain() ?: run {
            val now = clock.nowMillis()
            val entity = WorkspaceEntity(
                id = UuidV7.generate(clock), kind = WorkspaceKind.PERSONAL.name, name = "Personal",
                accent = WorkspaceAccent.TEAL.name, createdAt = now, updatedAt = now,
            )
            dao.insert(entity)
            entity.toDomain()
        }
    }

    override suspend fun createBusiness(name: String, accent: WorkspaceAccent): Workspace {
        val clean = requireNotNull(WorkspaceNames.normalize(name)) { "Workspace name must be 1–${WorkspaceNames.MAX_LENGTH} characters" }
        val now = clock.nowMillis()
        val entity = WorkspaceEntity(
            id = UuidV7.generate(clock), kind = WorkspaceKind.BUSINESS.name, name = clean,
            accent = accent.name, createdAt = now, updatedAt = now,
        )
        dao.insert(entity)
        return entity.toDomain()
    }

    override suspend fun get(id: WorkspaceId): Workspace? = dao.byId(id.value)?.takeIf { it.deletedAt == null }?.toDomain()
}

internal fun WorkspaceEntity.toDomain() = Workspace(
    id = WorkspaceId(id),
    kind = WorkspaceKind.valueOf(kind),
    name = name,
    accent = runCatching { WorkspaceAccent.valueOf(accent) }.getOrDefault(WorkspaceAccent.SLATE),
    createdAtMillis = createdAt,
)
