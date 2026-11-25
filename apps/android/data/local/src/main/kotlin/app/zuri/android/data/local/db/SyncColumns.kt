package app.zuri.android.data.local.db

/** Where a row came from (ARCHITECTURE.md §4.2). */
enum class Origin { DEVICE, CLOUD, IMPORT }

/** Sync status of a row; LOCAL_ONLY until the user enables upload for its category. */
enum class SyncState { LOCAL_ONLY, PENDING_PUSH, SYNCED, CONFLICT }
