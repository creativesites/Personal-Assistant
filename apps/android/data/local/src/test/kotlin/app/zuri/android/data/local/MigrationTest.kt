package app.zuri.android.data.local

import androidx.room.testing.MigrationTestHelper
import androidx.test.platform.app.InstrumentationRegistry
import app.zuri.android.data.local.db.ZuriDatabase
import com.google.common.truth.Truth.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Every schema version must migrate forward without losing data (ARCHITECTURE.md §4.4). */
@RunWith(RobolectricTestRunner::class)
class MigrationTest {
    @get:Rule
    val helper = MigrationTestHelper(InstrumentationRegistry.getInstrumentation(), ZuriDatabase::class.java)

    @Test fun v1ToV2KeepsWorkspacesAndAddsCaptureTables() {
        helper.createDatabase("migration-test", 1).use { db ->
            db.execSQL(
                "INSERT INTO workspace (id, kind, name, accent, created_at, updated_at, origin, remote_id, sync_state, deleted_at) " +
                    "VALUES ('w1', 'PERSONAL', 'Personal', 'TEAL', 1, 1, 'DEVICE', NULL, 'LOCAL_ONLY', NULL)",
            )
        }
        helper.runMigrationsAndValidate("migration-test", 2, true).use { db ->
            db.query("SELECT name FROM workspace WHERE id = 'w1'").use { c ->
                assertThat(c.moveToFirst()).isTrue()
                assertThat(c.getString(0)).isEqualTo("Personal")
            }
            db.query("SELECT COUNT(*) FROM message").use { c -> c.moveToFirst(); assertThat(c.getInt(0)).isEqualTo(0) }
        }
    }

    @Test fun v2ToV3AddsTheEgressLedger() {
        helper.createDatabase("migration-test-3", 2).close()
        helper.runMigrationsAndValidate("migration-test-3", 3, true).use { db ->
            db.query("SELECT COUNT(*) FROM egress_ledger").use { c -> c.moveToFirst(); assertThat(c.getInt(0)).isEqualTo(0) }
        }
    }
}
