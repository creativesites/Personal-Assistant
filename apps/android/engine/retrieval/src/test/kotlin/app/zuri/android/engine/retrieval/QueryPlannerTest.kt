package app.zuri.android.engine.retrieval

import app.zuri.android.data.local.db.ConversationTitle
import com.google.common.truth.Truth.assertThat
import org.junit.Test

class QueryPlannerTest {
    private val titles = listOf(ConversationTitle("c1", "Chanda Mulenga"), ConversationTitle("c2", "Family group"), ConversationTitle("c3", "Peter"))

    @Test fun scopesToTheNamedPersonAndReadsIntent() {
        val p = QueryPlanner.plan("What did I promise Chanda?", titles)
        assertThat(p.intent).isEqualTo(Intent.MY_PROMISES)
        assertThat(p.scope).containsExactly("c1")
        assertThat(p.keywords).isEmpty()
    }

    @Test fun possessiveNamesStillScope() {
        assertThat(QueryPlanner.plan("When is Peter's wedding?", titles).scope).containsExactly("c3")
        assertThat(QueryPlanner.plan("When is Peter's wedding?", titles).intent).isEqualTo(Intent.EVENTS)
        assertThat(QueryPlanner.plan("When is Peter's wedding?", titles).keywords).containsExactly("wedding")
    }

    @Test fun owedToMeIsNotMyPromises() {
        assertThat(QueryPlanner.plan("Who promised me something?", titles).intent).isEqualTo(Intent.OWED_TO_ME)
        assertThat(QueryPlanner.plan("Does Peter owe me money?", titles).intent).isEqualTo(Intent.OWED_TO_ME)
    }

    @Test fun genericWordsInTitlesDontScope() {
        assertThat(QueryPlanner.plan("Which group was the invoice in?", titles).scope).isEmpty()
    }

    @Test fun keywordsAreSafeForFullTextSearch() {
        val p = QueryPlanner.plan("quotation \"drip\" lines OR NOT * (pipes)", titles)
        assertThat(p.keywords.all { k -> k.all { it.isLetterOrDigit() } }).isTrue()
        assertThat(p.keywords).containsAtLeast("quotation", "drip", "lines", "pipes")
    }
}
