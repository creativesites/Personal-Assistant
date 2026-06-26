package com.zuri.companion

import android.util.Log
import com.google.gson.Gson
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

class ApiClient(private val tokenManager: TokenManager) {

    private val http = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    private val gson = Gson()
    private val json = "application/json; charset=utf-8".toMediaType()

    suspend fun sendMessage(
        senderName: String,
        message: String,
        timestampMs: Long,
        source: String = "whatsapp",
    ): Boolean = withContext(Dispatchers.IO) {
        if (!tokenManager.isConfigured()) {
            Log.w(TAG, "ApiClient not configured — skipping relay")
            return@withContext false
        }

        val payload = mapOf(
            "senderName" to senderName,
            "message" to message,
            "timestamp" to timestampMs,
            "source" to source,
        )

        val body = gson.toJson(payload).toRequestBody(json)
        val request = Request.Builder()
            .url("${tokenManager.apiUrl}/api/companion/message")
            .addHeader("Authorization", "Bearer ${tokenManager.authToken}")
            .post(body)
            .build()

        return@withContext try {
            val response = http.newCall(request).execute()
            val ok = response.code in 200..299
            response.close()
            if (!ok) Log.w(TAG, "Relay HTTP ${response.code}")
            ok
        } catch (e: Exception) {
            Log.e(TAG, "Relay error: ${e.message}")
            false
        }
    }

    companion object {
        private const val TAG = "ZuriApiClient"
    }
}
