package app.zuri.android.data.local.privacy

import app.zuri.android.core.common.Clock
import app.zuri.android.core.common.UuidV7
import app.zuri.android.data.local.db.EgressEntity
import app.zuri.android.data.local.db.ZuriDatabase
import app.zuri.android.domain.privacy.EgressLedger
import app.zuri.android.domain.privacy.EgressPurpose
import app.zuri.android.domain.privacy.EgressRecord
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

class RoomEgressLedger(private val db: ZuriDatabase, private val clock: Clock) : EgressLedger {
    override val records: Flow<List<EgressRecord>> = db.egressDao().observe().map { list ->
        list.mapNotNull { e ->
            val purpose = runCatching { EgressPurpose.valueOf(e.purpose) }.getOrNull() ?: return@mapNotNull null
            EgressRecord(e.id, e.at, purpose, e.host, e.detail, e.bytesSent, e.bytesReceived)
        }
    }

    override suspend fun record(purpose: EgressPurpose, host: String, detail: String, bytesSent: Long, bytesReceived: Long) {
        db.egressDao().insert(EgressEntity(UuidV7.generate(clock), clock.nowMillis(), purpose.name, host, detail.take(200), bytesSent, bytesReceived))
    }
}
