package app.zuri.android.core.common

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class RedactorTest {
    @Test fun removesPhoneNumbersEmailsAndTokens() {
        val out = Redactor.redact(
            "from +260 97 123 4567 mail chanda@example.com jwt eyJhbGciOi.eyJzdWIiOi.sig token_abcdefghijklmnopqrstu"
        )
        assertThat(out).doesNotContain("4567")
        assertThat(out).doesNotContain("chanda@")
        assertThat(out).doesNotContain("eyJ")
        assertThat(out).doesNotContain("abcdefghijklmnop")
        assertThat(out).contains("[number]")
        assertThat(out).contains("[email]")
    }

    @Test fun truncatesLongValuesSoMessageBodiesCannotLeak() {
        val body = "Hey! Are you still bringing the wedding photos on Friday? Also mum's 60th is on the 14th, it's a big one"
        assertThat(Redactor.redact(body).length).isAtMost(81)
    }

    @Test fun formatsStructuredEvent() {
        val captured = mutableListOf<String>()
        ZuriLog.sink = ZuriLog.Sink { _, _, line -> captured += line }
        ZuriLog.i("Test", "db_opened", "sizeBytes" to 4096, "user" to "kasonde@example.com")
        assertThat(captured.single()).isEqualTo("db_opened sizeBytes=4096 user=[email]")
    }
}
