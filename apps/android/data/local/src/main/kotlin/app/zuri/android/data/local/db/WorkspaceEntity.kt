package app.zuri.android.data.local.db

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * Every Zuri table carries the same common columns: UUIDv7 id, timestamps, origin, optional
 * server id, sync state and a tombstone (`deleted_at`) instead of hard deletes.
 */
@Entity(tableName = "workspace", indices = [Index("kind")])
data class WorkspaceEntity(
    @PrimaryKey val id: String,
    val kind: String,
    val name: String,
    val accent: String,
    @ColumnInfo(name = "created_at") val createdAt: Long,
    @ColumnInfo(name = "updated_at") val updatedAt: Long,
    val origin: String = Origin.DEVICE.name,
    @ColumnInfo(name = "remote_id") val remoteId: String? = null,
    @ColumnInfo(name = "sync_state") val syncState: String = SyncState.LOCAL_ONLY.name,
    @ColumnInfo(name = "deleted_at") val deletedAt: Long? = null,
)
