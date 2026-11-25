package app.zuri.android.engine.ingest

import app.zuri.android.domain.inbox.PlaceholderKind
import app.zuri.android.engine.ingest.parse.Classified
import app.zuri.android.engine.ingest.parse.Normaliser
import com.google.common.truth.Truth.assertThat
import org.junit.Test

class NormaliserTest {
    private fun c(s: String?) = Normaliser.classify(s)

    @Test fun plainTextStaysText() {
        assertThat(c("  Hello‎ there  ")).isEqualTo(Classified("Hello there", null))
        assertThat(c("Photo of the house is ready")).isEqualTo(Classified("Photo of the house is ready", null))
        assertThat(c("")).isNull()
        assertThat(c(null)).isNull()
    }

    @Test fun mediaLabelsBecomePlaceholders() {
        assertThat(c("📷 Photo")).isEqualTo(Classified(null, PlaceholderKind.PHOTO))
        assertThat(c("📷 Site visit")).isEqualTo(Classified("Site visit", PlaceholderKind.PHOTO))
        assertThat(c("📹 Video")).isEqualTo(Classified(null, PlaceholderKind.VIDEO))
        assertThat(c("🎤 Voice message (1:05)")).isEqualTo(Classified(null, PlaceholderKind.VOICE_NOTE, "1:05"))
        assertThat(c("📄 Contract.pdf")).isEqualTo(Classified(null, PlaceholderKind.DOCUMENT, "Contract.pdf"))
        assertThat(c("👤 Contact: Bwalya")).isEqualTo(Classified(null, PlaceholderKind.CONTACT_CARD, "Bwalya"))
        assertThat(c("Sticker")).isEqualTo(Classified(null, PlaceholderKind.STICKER))
        assertThat(c("GIF")).isEqualTo(Classified(null, PlaceholderKind.GIF))
        assertThat(c("📍 Location")).isEqualTo(Classified(null, PlaceholderKind.LOCATION))
    }

    @Test fun platformAndAppStatesAreRecognised() {
        assertThat(c("Sensitive notification content hidden")?.placeholder).isEqualTo(PlaceholderKind.OTP_HIDDEN)
        assertThat(c("This message was deleted")?.placeholder).isEqualTo(PlaceholderKind.DELETED)
        assertThat(c("You deleted this message.")?.placeholder).isEqualTo(PlaceholderKind.DELETED)
        assertThat(c("New message")?.placeholder).isEqualTo(PlaceholderKind.CONTENT_HIDDEN)
        assertThat(c("Missed video call")?.placeholder).isEqualTo(PlaceholderKind.MISSED_CALL)
        assertThat(c("Reacted ❤️ to: See you")).isEqualTo(Classified(null, PlaceholderKind.REACTION, "❤️"))
    }
}
