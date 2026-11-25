package app.zuri.android.data.local.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface WorkspaceDao {
    @Query("SELECT * FROM workspace WHERE deleted_at IS NULL ORDER BY CASE kind WHEN 'PERSONAL' THEN 0 ELSE 1 END, created_at")
    fun observeActive(): Flow<List<WorkspaceEntity>>

    @Query("SELECT * FROM workspace WHERE kind = 'PERSONAL' AND deleted_at IS NULL LIMIT 1")
    suspend fun personal(): WorkspaceEntity?

    @Query("SELECT * FROM workspace WHERE id = :id")
    suspend fun byId(id: String): WorkspaceEntity?

    @Query("SELECT COUNT(*) FROM workspace WHERE deleted_at IS NULL")
    suspend fun countActive(): Int

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insert(entity: WorkspaceEntity)
}
