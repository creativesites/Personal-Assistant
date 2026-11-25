package app.zuri.android.engine.ingest

import app.zuri.android.domain.capture.SourceKind
import app.zuri.android.engine.ingest.parse.Adapters
import app.zuri.android.engine.ingest.parse.ParseResult
import app.zuri.android.engine.ingest.snapshot.NotificationSnapshot
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Test

/** Golden notification fixtures (see src/test/resources/fixtures/README.md). */
class AdapterFixturesTest {
    private val json = Json { ignoreUnknownKeys = true }

    private fun fixtures(): List<File> {
        val dir = File(checkNotNull(javaClass.classLoader?.getResource("fixtures")).toURI())
        return dir.listFiles { f -> f.extension == "json" }.orEmpty().sortedBy { it.name }
    }

    @Test fun everyFixtureParsesExactlyAsRecorded() {
        val files = fixtures()
        assertWithMessage("fixtures present").that(files.size).isAtLeast(10)
        for (file in files) {
            val root = json.parseToJsonElement(file.readText()).jsonObject
            val snapshot = json.decodeFromJsonElement(NotificationSnapshot.serializer(), root.getValue("snapshot") as JsonObject)
            val expected = root.getValue("expected").jsonArray.map { it.jsonPrimitive.content }
            val kind = checkNotNull(SourceKind.forPackage(snapshot.packageName)) { "${file.name}: unknown package" }
            assertWithMessage(file.name).that(render(Adapters.forSource(kind).parse(snapshot))).containsExactlyElementsIn(expected).inOrder()
        }
    }

    private fun render(r: ParseResult): List<String> = when (r) {
        is ParseResult.Skipped -> listOf("SKIPPED: ${r.reason}")
        is ParseResult.Failed -> listOf("FAILED: ${r.reason}")
        is ParseResult.Messages -> r.messages.map { m ->
            listOf(
                m.chat.key, m.chat.title, m.chat.isGroup, m.senderKey, m.senderName ?: "-", m.fromMe,
                m.text ?: "-", m.placeholder?.name ?: "-", m.placeholderDetail ?: "-", m.sentAt, m.exactTime,
            ).joinToString(" | ")
        }
    }
}
