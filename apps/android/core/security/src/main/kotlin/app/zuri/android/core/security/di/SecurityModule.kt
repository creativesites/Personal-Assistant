package app.zuri.android.core.security.di

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.preferencesDataStoreFile
import app.zuri.android.core.common.Clock
import app.zuri.android.core.security.applock.AppLockController
import app.zuri.android.core.security.keys.AndroidKeystoreKeyWrapper
import app.zuri.android.core.security.keys.DatabaseKeyProvider
import app.zuri.android.core.security.keys.KeyWrapper
import app.zuri.android.core.security.secrets.AeadSecretStore
import app.zuri.android.core.security.secrets.PrefsCiphertextStorage
import app.zuri.android.core.security.secrets.SecretStore
import app.zuri.android.core.security.secrets.TinkAead
import app.zuri.android.core.security.settings.DataStoreSecuritySettingsRepository
import app.zuri.android.domain.settings.SecuritySettingsRepository
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import java.io.File
import javax.inject.Named
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object SecurityModule {
    @Provides @Singleton @Named("db")
    fun dbKeyWrapper(@ApplicationContext context: Context): KeyWrapper =
        AndroidKeystoreKeyWrapper(context, alias = "zuri_db_kek_v1")

    @Provides @Singleton
    fun databaseKeyProvider(@ApplicationContext context: Context, @Named("db") wrapper: KeyWrapper): DatabaseKeyProvider =
        DatabaseKeyProvider(File(context.noBackupFilesDir, "keys/zuri_db.key.wrapped"), wrapper)

    @Provides @Singleton
    fun secretStore(@ApplicationContext context: Context): SecretStore = AeadSecretStore(
        aead = TinkAead.create(context, keysetPrefsFile = "zuri_tink_keyset", keysetName = "secrets", masterKeyAlias = "zuri_secrets_master_v1"),
        storage = PrefsCiphertextStorage(context, "zuri_secrets"),
    )

    @Provides @Singleton @Named("security")
    fun securityPrefs(@ApplicationContext context: Context): DataStore<Preferences> =
        PreferenceDataStoreFactory.create { context.preferencesDataStoreFile("zuri_security") }

    @Provides @Singleton
    fun securitySettings(@Named("security") store: DataStore<Preferences>): SecuritySettingsRepository =
        DataStoreSecuritySettingsRepository(store)

    @Provides @Singleton
    fun appLockController(clock: Clock): AppLockController = AppLockController(clock)
}
