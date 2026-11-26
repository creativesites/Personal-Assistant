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
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import app.zuri.android.data.local.db.ContextLedgerEntity
import app.zuri.android.data.local.db.WorkspaceRuleEntity
import app.zuri.android.domain.capture.SourceKind
import app.zuri.android.domain.context.ActiveContext
import app.zuri.android.domain.context.ActiveContextProvider
import app.zuri.android.domain.context.ContextLedger
import app.zuri.android.domain.context.ContextWidening
import app.zuri.android.domain.context.Purpose
import app.zuri.android.domain.inbox.ConversationId
import app.zuri.android.domain.workspace.BrandProfile
import app.zuri.android.domain.workspace.MoveSummary

class RoomWorkspaceRepository(
    private val db: ZuriDatabase,
    private val clock: Clock,
) : WorkspaceRepository {
    private val dao = db.workspaceDao()
    private val moves = db.workspaceMoveDao()

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

    override suspend fun rename(id: WorkspaceId, name: String) {
        val clean = requireNotNull(WorkspaceNames.normalize(name)) { "Workspace name must be 1–${WorkspaceNames.MAX_LENGTH} characters" }
        dao.rename(id.value, clean, clock.nowMillis())
    }

    override suspend fun updateBrand(id: WorkspaceId, brand: BrandProfile) {
        fun String?.clean() = this?.trim()?.takeIf { it.isNotEmpty() }?.take(500)
        dao.updateBrand(
            id.value, brand.displayName.clean(), brand.phone.clean(), brand.email.clean(), brand.address.clean(),
            brand.website.clean(), brand.taxNumber.clean(), brand.bankDetails.clean(), brand.paymentTerms.clean(), clock.nowMillis(),
        )
    }

    override suspend fun deleteBusiness(id: WorkspaceId) {
        db.withTransaction {
            val ws = dao.byId(id.value) ?: return@withTransaction
            require(ws.kind == WorkspaceKind.BUSINESS.name) { "Personal can't be deleted" }
            dao.deleteRulesTo(ws.id)
            // Cascades to messages, understood items, summaries, feedback and vectors.
            moves.deleteConversationsIn(ws.id)
            dao.tombstone(ws.id, clock.nowMillis())
        }
    }

    override suspend fun movePreview(conversation: ConversationId): MoveSummary =
        MoveSummary(moves.messageCount(conversation.value), moves.memoryCount(conversation.value))

    override suspend fun moveConversation(conversation: ConversationId, to: WorkspaceId) {
        db.withTransaction {
            val target = dao.byId(to.value)?.takeIf { it.deletedAt == null } ?: throw IllegalArgumentException("No such workspace")
            val c = db.conversationDao().byId(conversation.value) ?: return@withTransaction
            if (c.workspaceId == target.id) return@withTransaction
            val now = clock.nowMillis()
            moves.moveConversation(c.id, target.id, now)
            moves.moveMessages(c.id, target.id)
            moves.moveMemories(c.id, target.id, now)
            moves.moveInsight(c.id, target.id)
            moves.moveFeedback(c.id, target.id)
            moves.moveEmbeddings(c.id, target.id)
        }
    }

    override fun observeRules(): Flow<Map<SourceKind, WorkspaceId>> = dao.observeRules().map { rows ->
        rows.mapNotNull { r -> SourceKind.entries.firstOrNull { it.name == r.sourceKind }?.let { it to WorkspaceId(r.workspaceId) } }.toMap()
    }

    override suspend fun setRule(source: SourceKind, workspace: WorkspaceId?) {
        val target = workspace?.let { dao.byId(it.value) }?.takeIf { it.deletedAt == null && it.kind == WorkspaceKind.BUSINESS.name }
        if (target == null) dao.deleteRule(source.name) else dao.putRule(WorkspaceRuleEntity(source.name, target.id, clock.nowMillis()))
    }
}

/** The active context from preferences: one workspace, or Hybrid (Personal plus chosen businesses). */
class PreferencesActiveContext(
    prefs: app.zuri.android.domain.settings.AppPreferencesRepository,
    workspaces: WorkspaceRepository,
) : ActiveContextProvider {
    override val active: Flow<ActiveContext?> = combine(prefs.preferences, workspaces.observeAll()) { p, all ->
        val personal = all.firstOrNull { it.kind == WorkspaceKind.PERSONAL } ?: return@combine null
        if (p.hybridActive) {
            val businesses = all.filter { it.kind == WorkspaceKind.BUSINESS && it.id in p.hybridWorkspaceIds }
            if (businesses.isNotEmpty()) return@combine ActiveContext(personal, listOf(personal) + businesses, hybrid = true)
        }
        val ws = all.firstOrNull { it.id == p.activeWorkspaceId } ?: personal
        ActiveContext(ws, listOf(ws), hybrid = false)
    }
}

class RoomContextLedger(private val db: ZuriDatabase, private val clock: app.zuri.android.core.common.Clock) : ContextLedger {
    override suspend fun record(purpose: Purpose, from: List<String>, added: List<String>) {
        db.workspaceDao().insertLedger(ContextLedgerEntity(UuidV7.generate(clock), clock.nowMillis(), purpose.name, from.joinToString("\n"), added.joinToString("\n")))
    }

    override fun observe(): Flow<List<ContextWidening>> = db.workspaceDao().observeLedger().map { rows ->
        rows.map { r ->
            ContextWidening(r.at, runCatching { Purpose.valueOf(r.purpose) }.getOrDefault(Purpose.ASK), r.fromNames.split('\n').filter(String::isNotBlank), r.addedNames.split('\n').filter(String::isNotBlank))
        }
    }
}

internal fun WorkspaceEntity.toDomain() = Workspace(
    id = WorkspaceId(id),
    kind = WorkspaceKind.valueOf(kind),
    name = name,
    accent = runCatching { WorkspaceAccent.valueOf(accent) }.getOrDefault(WorkspaceAccent.SLATE),
    createdAtMillis = createdAt,
    brand = BrandProfile(brandName, brandPhone, brandEmail, brandAddress, brandWebsite, brandTaxNumber, brandBankDetails, brandPaymentTerms),
)
