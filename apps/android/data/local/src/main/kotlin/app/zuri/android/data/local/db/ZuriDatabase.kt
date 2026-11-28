package app.zuri.android.data.local.db

import android.content.Context
import androidx.room.AutoMigration
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.AutoMigrationSpec
import androidx.sqlite.db.SupportSQLiteDatabase
import net.zetetic.database.sqlcipher.SupportOpenHelperFactory

/**
 * The single encrypted database (SQLCipher, AES-256). Schemas are exported to `data/local/schemas`;
 * every version bump needs a migration and a migration test.
 */
@Database(
    entities = [
        WorkspaceEntity::class,
        SourceAppEntity::class, CaptureRawEntity::class, CaptureExclusionEntity::class,
        ConversationEntity::class, MessageEntity::class,
        EgressEntity::class,
        MemoryEntity::class, MemoryFeedbackEntity::class, MessageFtsEntity::class,
        AutoReplyEventEntity::class,
        ConversationInsightEntity::class, DraftFeedbackEntity::class,
        MessageEmbeddingEntity::class,
        WorkspaceRuleEntity::class, ContextLedgerEntity::class,
        CloudContactEntity::class, MediaFileEntity::class, CloudPendingMessageEntity::class,
        RelationshipEntity::class, MissionEntity::class,
    ],
    version = 11,
    exportSchema = true,
    autoMigrations = [
        AutoMigration(from = 1, to = 2), AutoMigration(from = 2, to = 3),
        AutoMigration(from = 3, to = 4, spec = Migration3To4::class),
        AutoMigration(from = 4, to = 5), AutoMigration(from = 5, to = 6), AutoMigration(from = 6, to = 7),
        AutoMigration(from = 7, to = 8), AutoMigration(from = 8, to = 9), AutoMigration(from = 9, to = 10), AutoMigration(from = 10, to = 11),
    ],
)
abstract class ZuriDatabase : RoomDatabase() {
    abstract fun workspaceDao(): WorkspaceDao
    abstract fun sourceAppDao(): SourceAppDao
    abstract fun captureRawDao(): CaptureRawDao
    abstract fun captureExclusionDao(): CaptureExclusionDao
    abstract fun conversationDao(): ConversationDao
    abstract fun messageDao(): MessageDao
    abstract fun egressDao(): EgressDao
    abstract fun memoryDao(): MemoryDao
    abstract fun perceptionDao(): PerceptionDao
    abstract fun autoReplyDao(): AutoReplyDao
    abstract fun insightDao(): InsightDao
    abstract fun embeddingDao(): EmbeddingDao
    abstract fun workspaceMoveDao(): WorkspaceMoveDao
    abstract fun cloudSyncDao(): CloudSyncDao
    abstract fun relateDao(): RelateDao

    companion object {
        const val FILE_NAME = "zuri.db"

        /** What happened to the key at the last open; shown nowhere, but logged and tested. */
        @Volatile var lastKeyingResult: DatabaseKeying.Result? = null
            private set

        /**
         * Opens (creating if needed) the database with [key], a 256-bit key. The caller may zero [key]
         * afterwards: SQLCipher gets its own copy, which it keeps for the life of the process
         * (see [DatabaseKeying]).
         */
        fun openEncrypted(context: Context, key: ByteArray): ZuriDatabase = openEncryptedAt(context, key, FILE_NAME)

        internal fun openEncryptedAt(context: Context, key: ByteArray, name: String): ZuriDatabase {
            System.loadLibrary("sqlcipher")
            val raw = DatabaseKeying.rawKey(key)
            val result = DatabaseKeying.migrateIfNeeded(context.getDatabasePath(name), raw, legacyCandidates = listOf(key.copyOf()))
            lastKeyingResult = result
            check(result != DatabaseKeying.Result.UNREADABLE) { "The encrypted database could not be opened with its key" }
            return Room.databaseBuilder(context, ZuriDatabase::class.java, name)
                .openHelperFactory(SupportOpenHelperFactory(raw))
                .addCallback(SecureDeleteCallback)
                .build()
        }
    }
}

/** Deleted rows are overwritten with zeros on disk, so a user's deletion is a real deletion. */
internal object SecureDeleteCallback : RoomDatabase.Callback() {
    override fun onOpen(db: SupportSQLiteDatabase) {
        db.query("PRAGMA secure_delete = ON").close()
    }
}

/** v4 adds the message search index: fill it from the messages already stored. */
internal class Migration3To4 : AutoMigrationSpec {
    override fun onPostMigrate(db: SupportSQLiteDatabase) {
        db.execSQL("INSERT INTO message_fts(message_fts) VALUES('rebuild')")
    }
}
