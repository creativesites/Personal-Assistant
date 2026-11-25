package app.zuri.android.coreai.remote

import app.zuri.android.coreai.install.DownloadOutcome
import app.zuri.android.coreai.install.ModelDownloader
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request

/**
 * Streams a model file to disk and resumes with HTTP Range (from MeetingMind's
 * OkHttpModelDownloader, refactored: injected client, no app-wide network singleton, retries left
 * to WorkManager). The request carries no cookies, no account and nothing about the person.
 */
class OkHttpModelDownloader(
    private val client: OkHttpClient = defaultClient(),
) : ModelDownloader {

    override suspend fun download(url: String, destination: File, expectedSize: Long, onProgress: (Long, Long) -> Unit, onConnected: (String) -> Unit): DownloadOutcome =
        withContext(Dispatchers.IO) {
            val existing = if (destination.isFile) destination.length() else 0L
            if (existing >= expectedSize) return@withContext DownloadOutcome(hostOf(url), 0)
            val request = Request.Builder().url(url).apply { if (existing > 0) header("Range", "bytes=$existing-") }.build()
            val call = client.newCall(request)
            try {
                call.execute().use { resp ->
                    onConnected(resp.request.url.host) // the server that actually answered, after redirects
                    if (!resp.isSuccessful) throw IOException("HTTP ${resp.code}")
                    val resumed = resp.code == 206
                    var written = if (resumed) existing else 0L
                    var received = 0L
                    destination.parentFile?.mkdirs()
                    FileOutputStream(destination, resumed).use { out ->
                        resp.body.byteStream().use { input ->
                            val buf = ByteArray(1 shl 16)
                            while (true) {
                                currentCoroutineContext().ensureActive()
                                val n = input.read(buf)
                                if (n < 0) break
                                out.write(buf, 0, n)
                                written += n
                                received += n
                                if (written > expectedSize) throw IOException("More bytes than the catalog size")
                                onProgress(written, expectedSize)
                            }
                        }
                    }
                    DownloadOutcome(resp.request.url.host, received)
                }
            } finally {
                call.cancel()
            }
        }

    companion object {
        fun defaultClient(): OkHttpClient = OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .followRedirects(true)
            .followSslRedirects(false) // never downgrade from HTTPS
            .build()

        private fun hostOf(url: String) = runCatching { java.net.URI(url).host }.getOrNull() ?: "unknown"
    }
}
