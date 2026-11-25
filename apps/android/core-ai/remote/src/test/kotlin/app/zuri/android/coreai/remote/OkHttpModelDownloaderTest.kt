package app.zuri.android.coreai.remote

import com.google.common.truth.Truth.assertThat
import java.io.File
import java.io.IOException
import kotlinx.coroutines.test.runTest
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import okio.Buffer
import org.junit.After
import org.junit.Assert.assertThrows
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class OkHttpModelDownloaderTest {
    @get:Rule val tmp = TemporaryFolder()
    private val server = MockWebServer()
    private val body = ByteArray(200_000) { (it % 251).toByte() }

    @Before fun start() = server.start()
    @After fun stop() = server.close()

    private fun url() = server.url("/model.litertlm").toString()

    @Test fun downloadsTheWholeFile() = runTest {
        server.enqueue(MockResponse.Builder().code(200).body(Buffer().write(body)).build())
        val dest = File(tmp.root, "m.part")
        val outcome = OkHttpModelDownloader().download(url(), dest, body.size.toLong()) { _, _ -> }
        assertThat(dest.readBytes()).isEqualTo(body)
        assertThat(outcome.bytesReceived).isEqualTo(body.size.toLong())
    }

    @Test fun resumesFromAPartialFileWithRange() = runTest {
        val dest = File(tmp.root, "m.part").apply { writeBytes(body.copyOfRange(0, 50_000)) }
        server.enqueue(MockResponse.Builder().code(206).body(Buffer().write(body.copyOfRange(50_000, body.size))).build())
        val outcome = OkHttpModelDownloader().download(url(), dest, body.size.toLong()) { _, _ -> }
        assertThat(server.takeRequest().headers["Range"]).isEqualTo("bytes=50000-")
        assertThat(dest.readBytes()).isEqualTo(body)
        assertThat(outcome.bytesReceived).isEqualTo(150_000L)
    }

    @Test fun aServerThatIgnoresRangeRestartsCleanly() = runTest {
        val dest = File(tmp.root, "m.part").apply { writeBytes(ByteArray(50_000) { 7 }) }
        server.enqueue(MockResponse.Builder().code(200).body(Buffer().write(body)).build())
        OkHttpModelDownloader().download(url(), dest, body.size.toLong()) { _, _ -> }
        assertThat(dest.readBytes()).isEqualTo(body)
    }

    @Test fun httpErrorsThrowAndKeepPartialBytes() = runTest {
        val dest = File(tmp.root, "m.part").apply { writeBytes(ByteArray(10)) }
        server.enqueue(MockResponse.Builder().code(503).build())
        assertThrows(IOException::class.java) { kotlinx.coroutines.runBlocking { OkHttpModelDownloader().download(url(), dest, body.size.toLong()) { _, _ -> } } }
        assertThat(dest.length()).isEqualTo(10)
    }
}
