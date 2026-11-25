package app.zuri.android.data.local.db

import android.content.Context
import androidx.room.AutoMigration
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
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
    ],
    version = 2,
    exportSchema = true,
    autoMigrations = [AutoMigration(from = 1, to = 2)],
)
abstract class ZuriDatabase : RoomDatabase() {
    abstract fun workspaceDao(): WorkspaceDao
    abstract fun sourceAppDao(): SourceAppDao
    abstract fun captureRawDao(): CaptureRawDao
    abstract fun captureExclusionDao(): CaptureExclusionDao
    abstract fun conversationDao(): ConversationDao
    abstract fun messageDao(): MessageDao

    companion object {
        const val FILE_NAME = "zuri.db"

        fun openEncrypted(context: Context, key: ByteArray): ZuriDatabase {
            System.loadLibrary("sqlcipher")
            return Room.databaseBuilder(context, ZuriDatabase::class.java, FILE_NAME)
                .openHelperFactory(SupportOpenHelperFactory(key))
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
