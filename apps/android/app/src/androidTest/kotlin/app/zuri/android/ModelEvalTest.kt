package app.zuri.android

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import app.zuri.android.coreai.catalog.ModelCatalog
import app.zuri.android.coreai.ipc.LlmClient
import app.zuri.android.coreai.runtime.LiteRtLanguageModel
import app.zuri.android.coreai.storage.ModelStorage
import app.zuri.android.domain.ai.AiTier
import app.zuri.android.domain.memory.MemoryKind
import app.zuri.android.engine.perception.dates.DateResolver
import app.zuri.android.engine.perception.eval.EvalFixtures
import app.zuri.android.engine.perception.extract.Grounding
import app.zuri.android.engine.perception.extract.ModelExtractor
import app.zuri.android.engine.perception.extract.RulesExtractor
import com.google.common.truth.Truth.assertThat
import java.io.File
import java.time.ZoneId
import kotlinx.coroutines.runBlocking
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * M4 eval harness, Standard tier: the installed model, in the `:llm` process, on the labelled
 * fixtures. Runs only on a phone with a model installed (skipped otherwise). Thresholds from
 * IMPLEMENTATION_PLAN M4: commitments P ≥ 0.85, R ≥ 0.7.
 */
@RunWith(AndroidJUnit4::class)
class ModelEvalTest {
    @Test fun modelMeetsTheStandardThresholds() = runBlocking {
        val ctx = InstrumentationRegistry.getInstrumentation().targetContext
        val model = LiteRtLanguageModel(ModelCatalog.all, ModelStorage(File(ctx.noBackupFilesDir, "models")), LlmClient(ctx))
        assumeTrue("No model installed", model.tier() == AiTier.STANDARD)
        val zone = ZoneId.of("Africa/Lusaka")
        val json = InstrumentationRegistry.getInstrumentation().context.assets.open("eval/fixtures.json").bufferedReader().readText()
        val (batches, expected) = EvalFixtures.load(json)
        val extractor = ModelExtractor(model) { zone }
        var commitments = EvalFixtures.Score(0, 0, 0)
        var events = EvalFixtures.Score(0, 0, 0)
        val started = System.nanoTime()
        batches.forEachIndexed { i, b ->
            val outcome = extractor.extract(b)
            check(outcome is ModelExtractor.Outcome.Items) { "Model failed: $outcome" }
            val rules = RulesExtractor.extract(b) { s, at -> DateResolver.resolve(s, at, zone) != null }
            val found = Grounding.ground(b, outcome.candidates, zone) { line, kind -> rules.any { it.line == line && it.kind == kind } }
                .map { g -> g.kind to b.lines.indexOf(g.source) }.toSet()
            val s = EvalFixtures.score(found, expected[i], EvalFixtures.COMMITMENTS)
            println("ZURI_EVAL chat=$i ${b.conversationTitle} found=$found expected=${expected[i]} $s")
            commitments += s
            events += EvalFixtures.score(found, expected[i], setOf(MemoryKind.EVENT))
        }
        val seconds = (System.nanoTime() - started) / 1e9
        println("ZURI_EVAL model commitments P=%.2f R=%.2f %s; events P=%.2f R=%.2f %s; %.0f s for %d chats".format(
            commitments.precision, commitments.recall, commitments, events.precision, events.recall, events, seconds, batches.size))
        model.release()
        assertThat(commitments.precision).isAtLeast(0.85)
        assertThat(commitments.recall).isAtLeast(0.7)
    }
}
