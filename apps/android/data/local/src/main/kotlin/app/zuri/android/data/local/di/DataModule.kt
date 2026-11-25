package app.zuri.android.data.local.di

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.preferencesDataStoreFile
import app.zuri.android.core.common.Clock
import app.zuri.android.core.security.keys.DatabaseKeyProvider
import app.zuri.android.data.local.capture.RoomSourceSettingsRepository
import app.zuri.android.data.local.db.ZuriDatabase
import app.zuri.android.data.local.inbox.RoomInboxRepository
import app.zuri.android.domain.capture.SourceSettingsRepository
import app.zuri.android.domain.inbox.InboxRepository
import app.zuri.android.data.local.prefs.DataStoreAppPreferencesRepository
import app.zuri.android.data.local.privacy.FileStorageInspector
import app.zuri.android.data.local.workspace.RoomWorkspaceRepository
import app.zuri.android.domain.privacy.StorageInspector
import app.zuri.android.domain.settings.AppPreferencesRepository
import app.zuri.android.domain.workspace.WorkspaceRepository
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Named
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object DataModule {
    @Provides @Singleton
    fun database(@ApplicationContext context: Context, keys: DatabaseKeyProvider): ZuriDatabase {
        val key = keys.getOrCreate()
        return try {
            ZuriDatabase.openEncrypted(context, key)
        } finally {
            key.fill(0)
        }
    }

    @Provides @Singleton
    fun workspaces(db: ZuriDatabase, clock: Clock): WorkspaceRepository = RoomWorkspaceRepository(db, clock)

    @Provides @Singleton @Named("app")
    fun appPrefsStore(@ApplicationContext context: Context): DataStore<Preferences> =
        PreferenceDataStoreFactory.create { context.preferencesDataStoreFile("zuri_app") }

    @Provides @Singleton
    fun appPreferences(@Named("app") store: DataStore<Preferences>): AppPreferencesRepository =
        DataStoreAppPreferencesRepository(store)

    @Provides @Singleton
    fun storageInspector(@ApplicationContext context: Context, db: ZuriDatabase): StorageInspector =
        FileStorageInspector(
            context.getDatabasePath(ZuriDatabase.FILE_NAME),
            workspaceCount = { db.workspaceDao().countActive() },
            messageCount = { db.messageDao().count() },
            rawSnapshotCount = { db.captureRawDao().count() },
        )

    @Provides @Singleton
    fun sourceSettings(db: ZuriDatabase, @Named("app") store: DataStore<Preferences>, clock: Clock): SourceSettingsRepository =
        RoomSourceSettingsRepository(db, store, clock)

    @Provides @Singleton
    fun inbox(db: ZuriDatabase, clock: Clock): InboxRepository = RoomInboxRepository(db, clock)
}
