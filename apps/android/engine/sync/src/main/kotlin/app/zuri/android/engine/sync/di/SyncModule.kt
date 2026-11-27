package app.zuri.android.engine.sync.di

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.preferencesDataStoreFile
import app.zuri.android.core.common.Clock
import app.zuri.android.data.local.db.ZuriDatabase
import app.zuri.android.data.remote.ClerkAuth
import app.zuri.android.data.remote.CloudAccountStore
import app.zuri.android.data.remote.CloudApi
import app.zuri.android.domain.cloud.CloudAccount
import app.zuri.android.domain.cloud.CloudMedia
import app.zuri.android.domain.cloud.CloudSync
import app.zuri.android.engine.sync.CloudAccountImpl
import app.zuri.android.engine.sync.CloudMediaStore
import app.zuri.android.engine.sync.CloudSyncImpl
import app.zuri.android.engine.sync.FeedApplier
import app.zuri.android.engine.sync.SyncPrefs
import app.zuri.android.engine.sync.SyncRunner
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Named
import javax.inject.Provider
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object SyncModule {
    @Provides @Singleton @Named("cloudSync")
    fun syncStore(@ApplicationContext context: Context): DataStore<Preferences> =
        PreferenceDataStoreFactory.create { context.preferencesDataStoreFile("zuri_cloud_sync") }

    @Provides @Singleton
    fun syncPrefs(@Named("cloudSync") store: DataStore<Preferences>) = SyncPrefs(store)

    @Provides @Singleton
    fun accountImpl(clerk: ClerkAuth, store: CloudAccountStore, api: Provider<CloudApi>, sync: Provider<CloudSyncImpl>, db: ZuriDatabase, clock: Clock) =
        CloudAccountImpl(clerk, store, api, sync, db, clock)

    @Provides fun tokenSource(impl: CloudAccountImpl): CloudApi.TokenSource = impl

    @Provides @Singleton
    fun feedApplier(db: ZuriDatabase, clock: Clock) = FeedApplier(db, clock)

    @Provides @Singleton
    fun runner(api: CloudApi, applier: FeedApplier, prefs: SyncPrefs, db: ZuriDatabase, clock: Clock) = SyncRunner(api, applier, prefs, db, clock)

    @Provides @Singleton
    fun media(@ApplicationContext context: Context, db: ZuriDatabase, api: CloudApi, prefs: SyncPrefs, store: CloudAccountStore, clock: Clock) =
        CloudMediaStore(context, db, api, prefs, store, clock)

    @Provides @Singleton
    fun syncImpl(@ApplicationContext context: Context, runner: SyncRunner, prefs: SyncPrefs, media: CloudMediaStore, db: ZuriDatabase) =
        CloudSyncImpl(context, runner, prefs, media, db)

    @Provides fun cloudAccount(impl: CloudAccountImpl): CloudAccount = impl
    @Provides fun cloudSync(impl: CloudSyncImpl): CloudSync = impl
    @Provides fun cloudMedia(impl: CloudMediaStore): CloudMedia = impl
}
