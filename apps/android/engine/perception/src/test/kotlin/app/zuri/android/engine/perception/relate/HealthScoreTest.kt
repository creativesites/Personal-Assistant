package app.zuri.android.engine.perception.relate

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import app.zuri.android.core.common.Clock
import app.zuri.android.data.local.db.ConversationEntity
import app.zuri.android.data.local.db.MessageEntity
import app.zuri.android.data.local.db.WorkspaceEntity
import app.zuri.android.data.local.db.ZuriDatabase
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * Parity with the server: every case below was scored by the verbatim formula from
 * services/intelligence/app/services/health.py (pure part, run in Python) and must match exactly.
 */
@RunWith(RobolectricTestRunner::class)
class HealthScoreTest {
    private data class Case(val days: Int, val sent: Double, val week: Int, val avg: Double?, val rec: Double?, val base: Double?, val personal: Boolean, val proactive: Boolean, val old: Int, val score: Int, val trend: String)

    private val golden = listOf(
        Case(1, 0.9, 12, 0.3, 1.0, 2.0, true, false, 70, 85, "improving"),
        Case(5, 0.5, 2, 1.5, null, null, true, false, 70, 71, "stable"),
        Case(20, 0.4, 0, 3.0, 10.0, 5.0, true, false, 80, 56, "declining"),
        Case(45, 0.2, 0, 2.0, null, null, true, false, 75, 53, "declining"),
        Case(999, 0.5, 0, null, null, null, true, false, 60, 60, "stable"),
        Case(2, 1.0, 30, 0.2, 0.5, 4.0, true, true, 70, 93, "improving"),
        Case(10, 0.5, 1, 7.0, 24.0, 12.0, false, false, 70, 66, "declining"),
        Case(0, 0.75, 7, 1.0, 2.0, 2.0, false, true, 68, 82, "improving"),
        Case(999, 0.0, 0, 1.0, null, null, false, false, 70, 54, "declining"),
        Case(4, 0.6, 3, 2.333333, 3.0, 3.5, true, false, 72, 77, "improving"),
    )

    @Test fun matchesTheServerFormulaOnGoldenCases() {
        golden.forEach { c ->
            val r = HealthScore.compute(HealthScore.Inputs(c.days, 30, c.sent, c.week, c.avg, c.rec, c.base, c.personal, c.proactive, c.old))
            assertThat(r.score to r.trend).isEqualTo(c.score to c.trend)
        }
    }

    @Test fun reasonNamesTheFactorsThatMovedTheScore() {
        val r = HealthScore.compute(HealthScore.Inputs(45, 30, 0.2, 0, 2.0, null, null, personal = true, recentProactive = false))
        assertThat(r.reason).contains("45 days of silence")
        assertThat(r.reason).contains("Fewer messages this week")
    }

    @Test fun pythonRoundingIsBankers() {
        assertThat(HealthScore.pyRound(70.5)).isEqualTo(70)
        assertThat(HealthScore.pyRound(71.5)).isEqualTo(72)
        assertThat(HealthScore.pyRound(63.49)).isEqualTo(63)
    }

    @Test fun cadenceLearnsTheUsualGapAndNextCheck() {
        val day = Cadence.DAY
        val t = listOf(0L, 2 * day, 4 * day, 6 * day)
        val c = Cadence.learn(t, tier = 3, lastInteractionAt = 6 * day, now = 7 * day)!!
        assertThat(c.avgDays).isWithin(1e-9).of(2.0)
        // max(avg − std, tier 3 interval × 0.5 = 7 days) after the last message.
        assertThat(c.nextCheckAt).isEqualTo(13 * day)
        // Too little history: the tier's interval stands in.
        assertThat(Cadence.learn(listOf(0L, day), 1, day, 2 * day)!!.learned).isFalse()
    }

    // ── missions against a real database ─────────────────────────────────
    private val db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext<Context>(), ZuriDatabase::class.java).allowMainThreadQueries().build()
    private var now = 100 * Cadence.DAY
    private val engine = RelateEngine(db, Clock { now })

    @After fun close() = db.close()

    private suspend fun chat(id: String, title: String, times: List<Long>, outgoingLast: Boolean = false) {
        db.conversationDao().insert(ConversationEntity(id, "ws", "WHATSAPP", "com.whatsapp", "s:$id", title, false, true, times.last(), 0, 0, 0))
        times.forEachIndexed { i, t ->
            val out = outgoingLast && i == times.lastIndex
            db.messageDao().insert(
                MessageEntity("$id-$i", id, "ws", if (out || i % 2 == 1) "OUTGOING" else "INCOMING", if (out) "me" else "k:$id", title, "hello $i",
                    null, null, t, true, "f$id$i", sourcePackage = "com.whatsapp", notificationKey = "", notificationPostedAt = t, capturedAt = t,
                    adapterVersion = 1, createdAt = t, updatedAt = t),
            )
        }
    }

    @Test fun driftingPersonGetsACheckInThatResolvesWhenTheOwnerWrites() = runTest {
        db.workspaceDao().insert(WorkspaceEntity("ws", "PERSONAL", "Personal", "TEAL", 0, 0))
        // Talked every 2 days, then silence for 20 days.
        chat("c1", "Chanda", (0 until 8).map { (60 + it * 2) * Cadence.DAY })
        val first = engine.run()
        assertThat(first.newMissions).isEqualTo(1)
        val open = engine.observeOpen(listOf(app.zuri.android.domain.workspace.WorkspaceId("ws"))).first()
        assertThat(open.single().title).isEqualTo("Check in with Chanda")
        // Running again doesn't nag twice.
        assertThat(engine.run().newMissions).isEqualTo(0)
        // The owner writes to Chanda: the mission resolves itself.
        now += 3_600_000
        db.messageDao().insert(
            MessageEntity("c1-reply", "c1", "ws", "OUTGOING", "me", null, "Hey, long time!", null, null, now, true, "fr",
                sourcePackage = "com.whatsapp", notificationKey = "", notificationPostedAt = now, capturedAt = now, adapterVersion = 1, createdAt = now, updatedAt = now),
        )
        assertThat(engine.run().resolved).isEqualTo(1)
        assertThat(engine.observeOpen(listOf(app.zuri.android.domain.workspace.WorkspaceId("ws"))).first()).isEmpty()
        val rel = engine.observe(listOf(app.zuri.android.domain.workspace.WorkspaceId("ws"))).first().single()
        assertThat(rel.name).isEqualTo("Chanda")
        // The reply after 20 silent days widens the usual gap: 2-day rhythm plus one long gap.
        assertThat(rel.usualGapDays!!).isGreaterThan(2.0)
    }

    @Test fun aOneOffExchangeIsNotNagged() = runBlocking {
        db.workspaceDao().insert(WorkspaceEntity("ws", "PERSONAL", "Personal", "TEAL", 0, 0))
        chat("c2", "Courier", listOf(10 * Cadence.DAY, 10 * Cadence.DAY + 60_000))
        assertThat(engine.run().newMissions).isEqualTo(0)
    }
}
