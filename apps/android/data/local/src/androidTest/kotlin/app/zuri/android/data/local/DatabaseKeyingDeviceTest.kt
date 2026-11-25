package app.zuri.android.data.local

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.zuri.android.data.local.db.DatabaseKeying
import app.zuri.android.data.local.db.WorkspaceEntity
import app.zuri.android.data.local.db.ZuriDatabase
import com.google.common.truth.Truth.assertThat
import java.io.File
import java.security.SecureRandom
import kotlinx.coroutines.runBlocking
import net.zetetic.database.sqlcipher.SQLiteDatabase
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/** Runs on a real device: SQLCipher's native code is what's under test. */
@RunWith(AndroidJUnit4::class)
class DatabaseKeyingDeviceTest {
    private val context = ApplicationProvider.getApplicationContext<Context>()
    private lateinit var file: File

    @Before fun setUp() {
        System.loadLibrary("sqlcipher")
        file = File(context.cacheDir, "keying-test.db")
        listOf("", "-wal", "-shm", "-journal").forEach { File(file.path + it).delete() }
    }

    @After fun tearDown(): Unit = listOf("", "-wal", "-shm", "-journal").forEach { File(file.path + it).delete() }

    private fun key() = ByteArray(32).also { SecureRandom().nextBytes(it) }

    @Test fun legacyZeroKeyedDatabaseIsRekeyedAndKeepsItsData() {
        SQLiteDatabase.openDatabase(file.path, ByteArray(32), null, SQLiteDatabase.OPEN_READWRITE or SQLiteDatabase.CREATE_IF_NECESSARY, null, null).use {
            it.execSQL("CREATE TABLE t(v TEXT)")
            it.execSQL("INSERT INTO t VALUES ('kept')")
        }
        val raw = DatabaseKeying.rawKey(key())
        assertThat(DatabaseKeying.migrateIfNeeded(file, raw, emptyList())).isEqualTo(DatabaseKeying.Result.MIGRATED_FROM_LEGACY)
        assertThat(DatabaseKeying.canOpen(file, ByteArray(32))).isFalse()
        assertThat(DatabaseKeying.rejectsWeakKeys(file)).isTrue()
        SQLiteDatabase.openDatabase(file.path, raw, null, SQLiteDatabase.OPEN_READONLY, null, null).use { db ->
            db.rawQuery("SELECT v FROM t").use { c -> c.moveToFirst(); assertThat(c.getString(0)).isEqualTo("kept") }
        }
        assertThat(DatabaseKeying.migrateIfNeeded(file, raw, emptyList())).isEqualTo(DatabaseKeying.Result.ALREADY_RAW)
    }

    @Test fun zeroingTheCallersKeyDoesNotWeakenTheDatabase(): Unit = runBlocking {
        context.deleteDatabase(ZuriDatabase.FILE_NAME + "-devicetest")
        val key = key()
        val keepForCheck = key.copyOf()
        val db = ZuriDatabase.openEncryptedAt(context, key, ZuriDatabase.FILE_NAME + "-devicetest")
        key.fill(0) // what DataModule does
        db.workspaceDao().insert(WorkspaceEntity("w", "PERSONAL", "Personal", "TEAL", 1, 1))
        // Several reads force extra pooled connections, each keyed from SQLCipher's copy.
        repeat(8) { assertThat(db.workspaceDao().countActive()).isEqualTo(1) }
        db.close()
        val f = context.getDatabasePath(ZuriDatabase.FILE_NAME + "-devicetest")
        assertThat(DatabaseKeying.rejectsWeakKeys(f)).isTrue()
        assertThat(DatabaseKeying.canOpen(f, DatabaseKeying.rawKey(keepForCheck))).isTrue()
        context.deleteDatabase(ZuriDatabase.FILE_NAME + "-devicetest")
    }

    @Test fun rawKeyedConnectionsOpenFast() {
        val raw = DatabaseKeying.rawKey(key())
        SQLiteDatabase.openDatabase(file.path, raw, null, SQLiteDatabase.OPEN_READWRITE or SQLiteDatabase.CREATE_IF_NECESSARY, null, null).use { it.execSQL("CREATE TABLE t(v)") }
        val start = System.nanoTime()
        repeat(5) { assertThat(DatabaseKeying.canOpen(file, raw)).isTrue() }
        val perOpenMs = (System.nanoTime() - start) / 5 / 1_000_000
        android.util.Log.i("ZuriKeyingTest", "raw-key open: $perOpenMs ms")
        assertThat(perOpenMs).isLessThan(150)
    }
}
