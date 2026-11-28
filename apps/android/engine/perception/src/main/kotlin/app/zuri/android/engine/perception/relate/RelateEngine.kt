package app.zuri.android.engine.perception.relate

import androidx.room.withTransaction
import app.zuri.android.core.common.Clock
import app.zuri.android.core.common.UuidV7
import app.zuri.android.core.common.ZuriLog
import app.zuri.android.data.local.db.MissionEntity
import app.zuri.android.data.local.db.RelationshipEntity
import app.zuri.android.data.local.db.ZuriDatabase
import app.zuri.android.domain.inbox.ConversationId
import app.zuri.android.domain.inbox.Direction
import app.zuri.android.domain.people.HealthTrend
import app.zuri.android.domain.people.Mission
import app.zuri.android.domain.people.MissionKind
import app.zuri.android.domain.people.MissionTally
import app.zuri.android.domain.people.Missions
import app.zuri.android.domain.people.Relationship
import app.zuri.android.domain.people.Relationships
import app.zuri.android.domain.workspace.WorkspaceId
import app.zuri.android.engine.perception.insight.EmotionDerivation
import java.time.ZoneId
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Personal intelligence on the phone (M6): recomputes every one-to-one relationship's health and
 * rhythm, plans missions (reconnect when someone drifts past their usual gap; promises past due),
 * and resolves them on its own once the owner has written to that person (Reality Engine L1).
 * Deterministic: no model, works in airplane mode.
 */
class RelateEngine(private val db: ZuriDatabase, private val clock: Clock, private val zone: () -> ZoneId = { ZoneId.systemDefault() }) :
    Relationships, Missions {
    private val dao = db.relateDao()
    private val lock = Mutex()

    data class Stats(val people: Int, val newMissions: Int, val resolved: Int)

    override suspend fun refresh() { run() }

    suspend fun run(): Stats = lock.withLock {
        val now = clock.nowMillis()
        val resolved = dao.resolveReplied(now) + dao.resolvePromisesKept(now)
        val people = dao.people()
        var created = 0
        val due = mutableListOf<Pair<RelationshipEntity, String>>()
        for (p in people) {
            val r = relationship(p.id, p.workspaceId, now) ?: continue
            dao.upsert(r)
            // History for the life timeline: one row whenever the score moves.
            if (r.previousScore == null || r.previousScore != r.score) db.lifeDao().log(app.zuri.android.data.local.db.HealthLogEntity(conversationId = r.conversationId, score = r.score, previousScore = r.previousScore, at = now))
            val next = r.nextCheckAt
            if (next != null && now >= next && r.messageCount >= MIN_MESSAGES && r.lastInteractionAt != null && !dao.hasOpen(p.id)) due += r to p.title
        }
        // Reconnect: the closest and most overdue first, a few a day so it never nags.
        for ((r, name) in due.sortedWith(compareBy({ it.first.tier }, { it.first.nextCheckAt })).take(MAX_RECONNECTS_PER_RUN)) {
            val days = ((now - r.lastInteractionAt!!) / Cadence.DAY).toInt()
            val usual = r.avgDays?.let { if (it < 1) "every day or so" else "every ~${it.toInt().coerceAtLeast(1)} days" }
            created += insert(
                MissionEntity(
                    id = UuidV7.generate(clock), conversationId = r.conversationId, workspaceId = r.workspaceId,
                    kind = MissionKind.RECONNECT.name, title = "Check in with $name",
                    body = "It's been $days days since you last talked" + (usual?.let { " — you usually talk $it." } ?: "."),
                    dedupeKey = "RECONNECT:${r.conversationId}:${r.nextCheckAt!! / Cadence.DAY}", status = "OPEN", createdAt = now,
                ),
            )
        }
        for (m in dao.overduePromises(now)) {
            if (db.conversationDao().byId(m.conversationId) == null) continue
            created += insert(
                MissionEntity(
                    id = UuidV7.generate(clock), conversationId = m.conversationId, workspaceId = m.workspaceId,
                    kind = MissionKind.PROMISE_OVERDUE.name, title = "You promised ${m.personName}",
                    body = m.text + (m.dueText?.let { " (said: $it)" } ?: ""), dedupeKey = "PROMISE:${m.id}", memoryId = m.id,
                    status = "OPEN", createdAt = now,
                ),
            )
        }
        ZuriLog.i("RELATE", "run", "people" to people.size, "missions" to created, "resolved" to resolved)
        Stats(people.size, created, resolved)
    }

    private suspend fun insert(m: MissionEntity): Int = if (dao.insertMission(m) > 0) 1 else 0

    /** One relationship's inputs, gathered the way health.py's queries do, then scored by the port. */
    internal suspend fun relationship(conversationId: String, workspaceId: String, now: Long): RelationshipEntity? {
        val times = dao.times(conversationId)
        if (times.isEmpty()) return null
        val existing = dao.get(conversationId)
        val tier = existing?.tier ?: 3
        val last = times.last()
        val daysSilent = if (last > now - 30 * Cadence.DAY) ((now - last) / Cadence.DAY).toInt() else 999
        val weekCount = times.count { it > now - 7 * Cadence.DAY }
        val recent = dao.recent(conversationId, now - 74 * Cadence.DAY)
        // Sentiment per message from word and emoji cues (positive 1, neutral 0.5, negative 0), as message_analyses would.
        val sentiments = recent.filter { it.sentAt > now - 30 * Cadence.DAY && !it.text.isNullOrBlank() }.map {
            val v = EmotionDerivation.affect(EmotionDerivation.emotions(it.text!!)).valence
            when { v > 0.15 -> 1.0; v < -0.15 -> 0.0; else -> 0.5 }
        }
        // Their reply latency: a contact message right after one of the owner's.
        val recentLat = mutableListOf<Double>(); val baseLat = mutableListOf<Double>()
        recent.zipWithNext { a, b ->
            if (b.direction == Direction.INCOMING.name && a.direction == Direction.OUTGOING.name) {
                val h = (b.sentAt - a.sentAt) / 3_600_000.0
                if (b.sentAt > now - 14 * Cadence.DAY) recentLat += h else baseLat += h
            }
        }
        val clockFit = Cadence.learn(times, tier, last, now)
        val personal = dao.workspaceKind(workspaceId) != "BUSINESS"
        val result = HealthScore.compute(
            HealthScore.Inputs(
                daysSilent = daysSilent, avgSentiment = if (sentiments.isEmpty()) 0.5 else sentiments.average(),
                weekCount = weekCount, avgDaysBetween = clockFit?.takeIf { it.learned }?.avgDays,
                recentReplyHours = recentLat.takeIf { it.isNotEmpty() }?.average(), baselineReplyHours = baseLat.takeIf { it.isNotEmpty() }?.average(),
                personal = personal, recentProactive = dao.recentMissionsDone(conversationId, now - 7 * Cadence.DAY) > 0,
                oldScore = existing?.score ?: HealthScore.BASE_SCORE,
            ),
        )
        val factors = buildJsonObject {
            put("signals", buildJsonObject { result.signals.forEach { (k, v) -> put(k, JsonPrimitive(v)) } })
            put("notes", buildJsonObject { result.notes.forEach { (k, v) -> put(k, JsonPrimitive(v)) } })
        }
        return RelationshipEntity(
            conversationId = conversationId, workspaceId = workspaceId, score = result.score,
            previousScore = existing?.score, trend = result.trend, tier = tier, tierSet = existing?.tierSet ?: false,
            lastInteractionAt = last, avgDays = clockFit?.avgDays, stdDays = clockFit?.stdDays, nextCheckAt = clockFit?.nextCheckAt,
            reason = result.reason, factors = Json.encodeToString(kotlinx.serialization.json.JsonObject.serializer(), factors),
            messageCount = times.size, updatedAt = now,
        )
    }

    // ── Relationships ───────────────────────────────────────────────────────
    override fun observe(workspaces: List<WorkspaceId>): Flow<List<Relationship>> = dao.observe(workspaces.map { it.value }).map { rows ->
        rows.map { r ->
            Relationship(
                ConversationId(r.conversationId), WorkspaceId(r.workspaceId), r.title, r.score,
                when (r.trend) { "improving" -> HealthTrend.IMPROVING; "declining" -> HealthTrend.DECLINING; else -> HealthTrend.STABLE },
                r.tier, r.lastInteractionAt, r.avgDays, r.nextCheckAt, r.reason, r.messageCount,
            )
        }
    }

    override suspend fun setTier(id: ConversationId, tier: Int) {
        db.withTransaction {
            dao.setTier(id.value, tier.coerceIn(1, 5))
            // A new tier changes the reconnect interval right away.
            dao.get(id.value)?.let { r -> relationship(id.value, r.workspaceId, clock.nowMillis())?.let { dao.upsert(it.copy(tierSet = true)) } }
        }
    }

    // ── Missions ────────────────────────────────────────────────────────────
    override fun observeOpen(workspaces: List<WorkspaceId>): Flow<List<Mission>> = dao.observeOpen(workspaces.map { it.value }).map { rows ->
        rows.mapNotNull { m ->
            val kind = runCatching { MissionKind.valueOf(m.kind) }.getOrNull() ?: return@mapNotNull null
            Mission(m.id, ConversationId(m.conversationId), WorkspaceId(m.workspaceId), m.person, kind, m.title, m.body, m.createdAt)
        }
    }

    override fun observeToday(workspaces: List<WorkspaceId>): Flow<MissionTally> {
        val start = java.time.LocalDate.now(zone()).atStartOfDay(zone()).toInstant().toEpochMilli()
        val ws = workspaces.map { it.value }
        return combine(dao.observeDoneSince(ws, start), dao.observeTotalSince(ws, start)) { done, total -> MissionTally(done, total) }
    }

    override suspend fun done(id: String) = dao.resolve(id, "DONE", clock.nowMillis(), null)
    override suspend fun dismiss(id: String) = dao.resolve(id, "DISMISSED", clock.nowMillis(), null)

    companion object {
        /** Too little history to nag about (a one-off exchange). */
        const val MIN_MESSAGES = 6
        const val MAX_RECONNECTS_PER_RUN = 3
    }
}
