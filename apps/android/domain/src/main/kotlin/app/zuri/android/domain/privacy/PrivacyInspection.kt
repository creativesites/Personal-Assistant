package app.zuri.android.domain.privacy

/** Facts about local storage, measured rather than assumed. */
data class StorageReport(
    val databaseBytes: Long,
    /** True when the database file is verified not to be plaintext SQLite. */
    val databaseEncryptionVerified: Boolean,
    val workspaceCount: Int,
    val messageCount: Int = 0,
    /** Notification snapshots kept briefly for reprocessing (raw retention window). */
    val rawSnapshotCount: Int = 0,
)

interface StorageInspector {
    suspend fun report(): StorageReport
}

/** What the installed app is able to do, read from the platform at runtime. */
data class DeviceAccessReport(
    val hasNetworkPermission: Boolean,
    val notificationAccessGranted: Boolean,
    val contactsPermissionGranted: Boolean,
    val calendarPermissionGranted: Boolean,
    val deviceLockConfigured: Boolean,
)

interface DeviceAccessInspector {
    fun report(): DeviceAccessReport
}
