package app.zuri.android.engine.perception

import app.zuri.android.domain.memory.MemoryKind
import app.zuri.android.domain.memory.MemoryOrigin
import app.zuri.android.engine.perception.extract.Candidate
import app.zuri.android.engine.perception.extract.ChatBatch
import app.zuri.android.engine.perception.extract.ChatLine
import app.zuri.android.engine.perception.extract.Grounding
import app.zuri.android.engine.perception.extract.ModelExtractor
import com.google.common.truth.Truth.assertThat
import java.time.ZoneId
import org.junit.Test

/** M4: grounding rejects invented message ids and quotes, and kinds that don't fit the speaker. */
class GroundingTest {
    private val zone = ZoneId.of("Africa/Lusaka")
    private val batch = ChatBatch(
        "Chanda", false, emptyList(),
        listOf(
            ChatLine("m1", false, "Chanda", "Can you send me the quotation for 40 drip lines by Friday 10am?", 1_764_000_000_000),
            ChatLine("m2", true, "Me", "Sure, I’ll send it tomorrow morning.", 1_764_000_060_000),
        ),
    )
    private fun c(kind: MemoryKind, line: Int, quote: String) = Candidate(kind, line, quote, "summary", null, MemoryOrigin.MODEL)

    @Test fun keepsAGroundedItemAndResolvesItsDate() {
        val out = Grounding.ground(batch, listOf(c(MemoryKind.REQUEST_TO_ME, 0, "send me the quotation for 40 drip lines by Friday 10am")), zone)
        assertThat(out).hasSize(1)
        assertThat(out[0].source.id).isEqualTo("m1")
        assertThat(out[0].dueAtMillis).isNotNull()
        assertThat(out[0].dueHasTime).isTrue()
        assertThat(out[0].personName).isEqualTo("Chanda")
    }

    @Test fun quotesMatchDespiteCaseCurlyApostrophesAndPunctuation() {
        val out = Grounding.ground(batch, listOf(c(MemoryKind.MY_PROMISE, 1, "I'll send it tomorrow morning")), zone)
        assertThat(out).hasSize(1)
        assertThat(out[0].personName).isEqualTo("Chanda")
    }

    @Test fun rejectsInventedQuotes() {
        assertThat(Grounding.ground(batch, listOf(c(MemoryKind.REQUEST_TO_ME, 0, "send me 50 drip lines")), zone)).isEmpty()
        assertThat(Grounding.ground(batch, listOf(c(MemoryKind.REQUEST_TO_ME, 0, "  ")), zone)).isEmpty()
    }

    @Test fun rejectsInventedMessageNumbers() {
        val parsed = ModelExtractor(FakeModel(), { zone }).parse(
            """{"items":[{"kind":"my_promise","message":7,"quote":"I’ll send it","summary":"Send it"},{"kind":"my_promise","message":0,"quote":"x","summary":"y"}]}""",
            batch,
        )
        assertThat(parsed).isEmpty()
    }

    @Test fun rejectsKindsThatDontFitTheSpeaker() {
        assertThat(Grounding.ground(batch, listOf(c(MemoryKind.MY_PROMISE, 0, "Can you send me the quotation")), zone)).isEmpty()
        assertThat(Grounding.ground(batch, listOf(c(MemoryKind.REQUEST_TO_ME, 1, "I’ll send it tomorrow")), zone)).isEmpty()
    }

    @Test fun keepsOneItemPerMessageAndKind() {
        val out = Grounding.ground(batch, listOf(c(MemoryKind.MY_PROMISE, 1, "send it"), c(MemoryKind.MY_PROMISE, 1, "tomorrow morning")), zone)
        assertThat(out).hasSize(1)
    }

    @Test fun malformedModelOutputYieldsNothing() {
        assertThat(ModelExtractor(FakeModel(), { zone }).parse("not json", batch)).isEmpty()
        assertThat(ModelExtractor(FakeModel(), { zone }).parse("""{"items":[{"kind":"gossip","message":1,"quote":"Can you","summary":"x"}]}""", batch)).isEmpty()
    }
}
