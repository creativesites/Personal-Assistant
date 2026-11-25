package app.zuri.android.domain.privacy

import kotlinx.coroutines.flow.Flow

/** Why something left the phone. Every purpose is something the person started. */
enum class EgressPurpose { MODEL_DOWNLOAD }

/**
 * One entry in "What leaves my phone" (A08, SECURITY_AND_PRIVACY.md §4). For downloads, what left is
 * only the request (file name, and the IP address that any connection reveals); the bytes are
 * what came back.
 */
data class EgressRecord(
    val id: String,
    val atMillis: Long,
    val purpose: EgressPurpose,
    val host: String,
    /** What was asked for, in plain words, e.g. the file name. Never personal content. */
    val detail: String,
    val bytesSent: Long,
    val bytesReceived: Long,
)

interface EgressLedger {
    val records: Flow<List<EgressRecord>>
    suspend fun record(purpose: EgressPurpose, host: String, detail: String, bytesSent: Long, bytesReceived: Long)
}
