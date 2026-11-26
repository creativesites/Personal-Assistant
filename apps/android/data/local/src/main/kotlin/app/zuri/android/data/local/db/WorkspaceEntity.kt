package app.zuri.android.data.local.db

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.ForeignKey
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
    // Brand profile (M5), business workspaces only. Bank details are SECRET (§8.3).
    @ColumnInfo(name = "brand_name") val brandName: String? = null,
    @ColumnInfo(name = "brand_phone") val brandPhone: String? = null,
    @ColumnInfo(name = "brand_email") val brandEmail: String? = null,
    @ColumnInfo(name = "brand_address") val brandAddress: String? = null,
    @ColumnInfo(name = "brand_website") val brandWebsite: String? = null,
    @ColumnInfo(name = "brand_tax_number") val brandTaxNumber: String? = null,
    @ColumnInfo(name = "brand_bank_details") val brandBankDetails: String? = null,
    @ColumnInfo(name = "brand_payment_terms") val brandPaymentTerms: String? = null,
)

/** Workspace rule (D-04 §3): new chats from this app go to this workspace instead of Personal. */
@Entity(
    tableName = "workspace_rule",
    foreignKeys = [ForeignKey(entity = WorkspaceEntity::class, parentColumns = ["id"], childColumns = ["workspace_id"], onDelete = ForeignKey.CASCADE)],
    indices = [Index("workspace_id")],
)
data class WorkspaceRuleEntity(
    /** [app.zuri.android.domain.capture.SourceKind] name. */
    @PrimaryKey @ColumnInfo(name = "source_kind") val sourceKind: String,
    @ColumnInfo(name = "workspace_id") val workspaceId: String,
    @ColumnInfo(name = "updated_at") val updatedAt: Long,
)

/** Each explicit widening of scope (D-04 §4): when, for what, and which workspaces were added. No content. */
@Entity(tableName = "context_ledger", indices = [Index("at")])
data class ContextLedgerEntity(
    @PrimaryKey val id: String,
    val at: Long,
    val purpose: String,
    /** Workspace names, newline-separated, as they were at the time. */
    @ColumnInfo(name = "from_names") val fromNames: String,
    @ColumnInfo(name = "added_names") val addedNames: String,
)
