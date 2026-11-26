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

    @Query("UPDATE workspace SET name = :name, updated_at = :now WHERE id = :id")
    suspend fun rename(id: String, name: String, now: Long)

    @Query(
        """UPDATE workspace SET brand_name = :name, brand_phone = :phone, brand_email = :email, brand_address = :address,
           brand_website = :website, brand_tax_number = :tax, brand_bank_details = :bank, brand_payment_terms = :terms, updated_at = :now
           WHERE id = :id""",
    )
    suspend fun updateBrand(id: String, name: String?, phone: String?, email: String?, address: String?, website: String?, tax: String?, bank: String?, terms: String?, now: Long)

    @Query("UPDATE workspace SET deleted_at = :now, updated_at = :now, name = '', brand_name = NULL, brand_phone = NULL, brand_email = NULL, brand_address = NULL, brand_website = NULL, brand_tax_number = NULL, brand_bank_details = NULL, brand_payment_terms = NULL WHERE id = :id AND kind = 'BUSINESS'")
    suspend fun tombstone(id: String, now: Long)

    @Query("SELECT * FROM workspace_rule")
    fun observeRules(): Flow<List<WorkspaceRuleEntity>>

    @Query("SELECT workspace_id FROM workspace_rule r JOIN workspace w ON w.id = r.workspace_id WHERE r.source_kind = :kind AND w.deleted_at IS NULL")
    suspend fun ruleFor(kind: String): String?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun putRule(rule: WorkspaceRuleEntity)

    @Query("DELETE FROM workspace_rule WHERE source_kind = :kind")
    suspend fun deleteRule(kind: String)

    @Query("DELETE FROM workspace_rule WHERE workspace_id = :workspaceId")
    suspend fun deleteRulesTo(workspaceId: String)

    @Insert
    suspend fun insertLedger(entry: ContextLedgerEntity)

    @Query("SELECT * FROM context_ledger ORDER BY at DESC LIMIT 200")
    fun observeLedger(): Flow<List<ContextLedgerEntity>>
}

/** Moving a chat between workspaces (D-04 §3): every row derived from it moves in one transaction. */
@Dao
interface WorkspaceMoveDao {
    @Query("UPDATE conversation SET workspace_id = :to, updated_at = :now WHERE id = :conversationId")
    suspend fun moveConversation(conversationId: String, to: String, now: Long)

    @Query("UPDATE message SET workspace_id = :to WHERE conversation_id = :conversationId")
    suspend fun moveMessages(conversationId: String, to: String): Int

    @Query("UPDATE memory_item SET workspace_id = :to, updated_at = :now WHERE conversation_id = :conversationId")
    suspend fun moveMemories(conversationId: String, to: String, now: Long): Int

    @Query("UPDATE conversation_insight SET workspace_id = :to WHERE conversation_id = :conversationId")
    suspend fun moveInsight(conversationId: String, to: String)

    @Query("UPDATE draft_feedback SET workspace_id = :to WHERE conversation_id = :conversationId")
    suspend fun moveFeedback(conversationId: String, to: String)

    @Query("UPDATE message_embedding SET workspace_id = :to WHERE conversation_id = :conversationId")
    suspend fun moveEmbeddings(conversationId: String, to: String)

    @Query("SELECT COUNT(*) FROM message WHERE conversation_id = :conversationId")
    suspend fun messageCount(conversationId: String): Int

    @Query("SELECT COUNT(*) FROM memory_item WHERE conversation_id = :conversationId AND review != 'REJECTED'")
    suspend fun memoryCount(conversationId: String): Int

    @Query("SELECT id FROM conversation WHERE workspace_id = :workspaceId")
    suspend fun conversationsIn(workspaceId: String): List<String>

    @Query("DELETE FROM conversation WHERE workspace_id = :workspaceId")
    suspend fun deleteConversationsIn(workspaceId: String): Int
}
