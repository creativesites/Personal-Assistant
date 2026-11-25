package app.zuri.android.data.local

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import app.zuri.android.core.common.Clock
import app.zuri.android.data.local.db.ZuriDatabase
import app.zuri.android.data.local.workspace.RoomWorkspaceRepository
import app.zuri.android.domain.workspace.WorkspaceAccent
import app.zuri.android.domain.workspace.WorkspaceKind
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertThrows
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Repository behaviour against a real (unencrypted, in-memory) Room database. */
@RunWith(RobolectricTestRunner::class)
class RoomWorkspaceRepositoryTest {
    private val db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext<Context>(), ZuriDatabase::class.java)
        .allowMainThreadQueries().build()
    private var now = 1_700_000_000_000L
    private val repo = RoomWorkspaceRepository(db, Clock { now++ })

    @After fun close() = db.close()

    @Test fun personalIsCreatedExactlyOnce() = runTest {
        val a = repo.ensurePersonal()
        val b = repo.ensurePersonal()
        assertThat(a.id).isEqualTo(b.id)
        assertThat(repo.observeAll().first().count { it.kind == WorkspaceKind.PERSONAL }).isEqualTo(1)
    }

    @Test fun personalIsListedFirst() = runTest {
        repo.createBusiness("Kalulu Irrigation", WorkspaceAccent.INDIGO)
        repo.ensurePersonal()
        assertThat(repo.observeAll().first().map { it.kind }).containsExactly(WorkspaceKind.PERSONAL, WorkspaceKind.BUSINESS).inOrder()
    }

    @Test fun businessNamesAreValidated() = runTest {
        assertThat(repo.createBusiness("  Mwale   Design ", WorkspaceAccent.PLUM).name).isEqualTo("Mwale Design")
        assertThrows(IllegalArgumentException::class.java) { kotlinx.coroutines.runBlocking { repo.createBusiness("   ", WorkspaceAccent.PLUM) } }
    }
}
