package app.zuri.android.feature.inbox

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import app.zuri.android.core.ui.theme.ZuriTheme
import app.zuri.android.domain.capture.CaptureStatus
import app.zuri.android.domain.capture.SourceKind
import app.zuri.android.domain.inbox.ConversationDetail
import app.zuri.android.domain.inbox.ConversationId
import app.zuri.android.domain.inbox.ConversationSummary
import app.zuri.android.domain.inbox.Direction
import app.zuri.android.domain.inbox.InboxMessage
import app.zuri.android.domain.inbox.MessageId
import app.zuri.android.domain.inbox.PlaceholderKind
import app.zuri.android.domain.inbox.Provenance
import com.github.takahirom.roborazzi.captureRoboImage
import java.time.ZoneId
import java.util.Locale
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w411dp-h891dp-xxhdpi")
class InboxScreenshotTest {
    @get:Rule val compose = createComposeRule()

    private fun shot(name: String, dark: Boolean, content: @Composable () -> Unit) {
        compose.setContent { ZuriTheme(darkTheme = dark) { Surface(color = MaterialTheme.colorScheme.background) { content() } } }
        compose.onRoot().captureRoboImage("src/test/screenshots/$name.png")
    }

    // 2026-11-24 15:30 UTC. Fixed clock and zone keep these images identical on every machine.
    private val now = 1_764_000_000_000L + 9_000_000L
    private val time = TimeContext(now, ZoneId.of("UTC"), Locale.UK)
    private val listening = CaptureStatus(true, true, false, setOf(SourceKind.WHATSAPP, SourceKind.GMAIL), now, 14)

    private fun conv(id: String, src: SourceKind, title: String, ago: Long, text: String?, ph: PlaceholderKind? = null, sender: String? = null, me: Boolean = false, group: Boolean = false, unread: Int = 0) =
        ConversationSummary(ConversationId(id), src, title, group, now - ago, text, ph, sender, me, unread, 5)

    private val conversations = listOf(
        conv("1", SourceKind.WHATSAPP, "Chanda Mwila", 4 * 60_000, "Sending the quote tonight", unread = 2),
        conv("2", SourceKind.WHATSAPP, "Family", 50 * 60_000, null, PlaceholderKind.PHOTO, sender = "Natasha", group = true),
        conv("3", SourceKind.GMAIL, "Kalulu Irrigation", 3 * 3_600_000, "Quotation QUO-0042 — please find the revised quotation"),
        conv("4", SourceKind.WHATSAPP, "Bwalya", 26 * 3_600_000, "Yes, 10am works", me = true),
        conv("5", SourceKind.WHATSAPP, "ZANACO", 3 * 86_400_000, null, PlaceholderKind.OTP_HIDDEN),
    )

    private val list = InboxState(loading = false, conversations = conversations, status = listening)

    @Test fun listLight() = shot("inbox_light", false) { InboxContent(list, time, {}, {}, {}) }
    @Test fun listDark() = shot("inbox_dark", true) { InboxContent(list, time, {}, {}, {}) }
    @Test fun emptyOffLight() = shot("inbox_empty_light", false) { InboxContent(InboxState(loading = false), time, {}, {}, {}) }
    @Test fun needsAccessDark() = shot("inbox_access_dark", true) {
        InboxContent(InboxState(loading = false, status = listening.copy(accessGranted = false)), time, {}, {}, {})
    }

    private fun m(id: String, dir: Direction, text: String?, ago: Long, sender: String? = null, ph: PlaceholderKind? = null, detail: String? = null, edited: Boolean = false) =
        InboxMessage(MessageId(id), dir, sender, text, ph, detail, now - ago, edited, Provenance(SourceKind.WHATSAPP, "com.whatsapp", now - ago + 400, now - ago + 200, 1))

    private val thread = ConversationDetail(
        summary = conv("2", SourceKind.WHATSAPP, "Family", 60_000, "Lunch at 1", group = true).copy(messageCount = 7),
        messages = listOf(
            m("a", Direction.INCOMING, "Who is bringing the cake?", 26 * 3_600_000, "Natasha"),
            m("b", Direction.OUTGOING, "Me! Chocolate this time", 26 * 3_600_000 - 120_000),
            m("c", Direction.INCOMING, null, 3 * 3_600_000, "Natasha", PlaceholderKind.PHOTO),
            m("d", Direction.INCOMING, null, 2 * 3_600_000, "Mum", PlaceholderKind.VOICE_NOTE, "0:12"),
            m("e", Direction.INCOMING, "Lunch at 1. Bring chairs if you can", 3_600_000, "Mum", edited = true),
            m("f", Direction.INCOMING, null, 30 * 60_000, "Natasha", PlaceholderKind.DELETED),
            m("g", Direction.INCOMING, null, 60_000, "Natasha", PlaceholderKind.REACTION, "👍"),
        ),
        excluded = false,
    )

    @Test fun conversationLight() = shot("conversation_light", false) { ConversationContent(thread, time, {}, {}, {}, {}) }
    @Test fun conversationDark() = shot("conversation_dark", true) { ConversationContent(thread, time, {}, {}, {}, {}) }
    @Test fun provenanceLight() = shot("message_info_light", false) { MessageInfoContent(thread.messages[2], "WhatsApp", time, {}, {}) }
}
