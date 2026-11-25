package app.zuri.android.data.local.db

import androidx.room.ColumnInfo
import androidx.room.Dao
import androidx.room.Entity
import androidx.room.Index
import androidx.room.Insert
import androidx.room.PrimaryKey
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

/** "What leaves my phone" (A08): append-only, shown to the person as it is. */
@Entity(tableName = "egress_ledger", indices = [Index("at")])
data class EgressEntity(
    @PrimaryKey val id: String,
    val at: Long,
    val purpose: String,
    val host: String,
    val detail: String,
    @ColumnInfo(name = "bytes_sent") val bytesSent: Long,
    @ColumnInfo(name = "bytes_received") val bytesReceived: Long,
)

@Dao
interface EgressDao {
    @Insert suspend fun insert(e: EgressEntity)

    @Query("SELECT * FROM egress_ledger ORDER BY at DESC LIMIT 500")
    fun observe(): Flow<List<EgressEntity>>
}
