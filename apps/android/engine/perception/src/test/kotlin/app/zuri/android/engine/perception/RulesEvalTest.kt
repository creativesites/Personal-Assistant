package app.zuri.android.engine.perception

import app.zuri.android.domain.memory.MemoryKind
import app.zuri.android.engine.perception.dates.DateResolver
import app.zuri.android.engine.perception.extract.Grounding
import app.zuri.android.engine.perception.extract.RulesExtractor
import com.google.common.truth.Truth.assertThat
import java.time.ZoneId
import app.zuri.android.engine.perception.eval.EvalFixtures
import org.junit.Test

/** M4 eval harness, Essential tier: precision and recall of the rules on the labelled fixtures. */
class RulesEvalTest {
    @Test fun rulesMeetTheEssentialThresholds() = check("fixtures")

    @Test fun rulesOnHeldOutChats() = check("heldout")

    private fun check(name: String) {
        val (batches, expected) = EvalFixtures.load(javaClass.getResource("/eval/$name.json")!!.readText())
        val zone = ZoneId.of("Africa/Lusaka")
        var commitments = EvalFixtures.Score(0, 0, 0)
        var events = EvalFixtures.Score(0, 0, 0)
        batches.forEachIndexed { i, b ->
            val found = Grounding.ground(b, RulesExtractor.extract(b) { s, at -> DateResolver.resolve(s, at, zone) != null }, zone)
                .map { g -> g.kind to b.lines.indexOf(g.source) }.toSet()
            commitments += EvalFixtures.score(found, expected[i], EvalFixtures.COMMITMENTS)
            events += EvalFixtures.score(found, expected[i], setOf(MemoryKind.EVENT))
        }
        println("$name rules commitments P=%.2f R=%.2f %s; events P=%.2f R=%.2f %s".format(commitments.precision, commitments.recall, commitments, events.precision, events.recall, events))
        // Essential tier: rules must be precise; recall is the model's job (Standard: P ≥ 0.85, R ≥ 0.7).
        assertThat(commitments.precision).isAtLeast(0.85)
        assertThat(commitments.recall).isAtLeast(0.6)
        assertThat(events.precision).isAtLeast(0.85)
    }
}
