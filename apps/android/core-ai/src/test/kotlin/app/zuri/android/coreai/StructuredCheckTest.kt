package app.zuri.android.coreai

import app.zuri.android.coreai.runtime.StructuredCheck
import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StructuredCheckTest {
    @Test fun acceptsOnlyWellFormedOnSchemaAnswers() {
        assertThat(StructuredCheck.isValid("""{"commitments":[{"who":"Chanda","what":"pay the deposit","when":"Monday"}]}""")).isTrue()
        assertThat(StructuredCheck.isValid("""{"commitments":[]}""")).isFalse()
        assertThat(StructuredCheck.isValid("""{"commitments":[{"what":"x"}]}""")).isFalse()
        assertThat(StructuredCheck.isValid("Sure! Here is the JSON: {")).isFalse()
    }
}
