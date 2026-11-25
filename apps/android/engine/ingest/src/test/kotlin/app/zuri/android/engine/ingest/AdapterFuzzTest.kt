package app.zuri.android.engine.ingest

import app.zuri.android.domain.capture.SourceKind
import app.zuri.android.engine.ingest.parse.Adapters
import app.zuri.android.engine.ingest.parse.ParseResult
import app.zuri.android.engine.ingest.snapshot.NotificationSnapshot
import app.zuri.android.engine.ingest.snapshot.SnapshotMessage
import com.google.common.truth.Truth.assertThat
import kotlin.random.Random
import org.junit.Test

/** Adapters must never throw, whatever an app puts in a notification (ARCHITECTURE.md §5.2). */
class AdapterFuzzTest {
    private val pieces = listOf(
        null, "", " ", "\n\n", "📷", "📷 ", "🎤 Voice message (", "Reacted  to", "@", " @ ", "(3 messages)",
        "This message was deleted", "x".repeat(5000), "‮‏", "5 messages from 2 chats", "Photo", "👤 Contact:",
    )

    private fun Random.str() = pieces[nextInt(pieces.size)]?.let { it + (if (nextBoolean()) "abc" else "") }

    @Test fun randomBundlesNeverCrashAnyAdapter() {
        val rnd = Random(42)
        repeat(5_000) {
            val kind = SourceKind.entries[rnd.nextInt(SourceKind.entries.size)]
            val snapshot = NotificationSnapshot(
                packageName = kind.packages.first(), key = "k$it", postTime = rnd.nextLong(-1, 2_000_000_000_000),
                isGroupSummary = rnd.nextInt(10) == 0, isOngoing = rnd.nextInt(10) == 0,
                category = listOf(null, "msg", "call", "email")[rnd.nextInt(4)],
                title = rnd.str(), text = rnd.str(), bigText = rnd.str(), subText = rnd.str(),
                textLines = if (rnd.nextInt(5) == 0) listOf(rnd.str().orEmpty()) else emptyList(),
                conversationTitle = rnd.str(), isGroupConversation = rnd.nextBoolean(), shortcutId = rnd.str(),
                messages = List(rnd.nextInt(4)) {
                    SnapshotMessage(rnd.str(), rnd.nextLong(-5, 2_000_000_000_000), rnd.str(), rnd.str(), rnd.str(), rnd.nextBoolean())
                },
            )
            val result = Adapters.forSource(kind).parse(snapshot)
            if (result is ParseResult.Messages) {
                assertThat(result.messages).isNotEmpty()
                result.messages.forEach { m ->
                    assertThat(m.chat.title).isNotEmpty()
                    assertThat(m.text != null || m.placeholder != null).isTrue()
                }
            }
        }
    }
}
