package app.zuri.android.coreai.di

import android.content.Context
import android.os.StatFs
import app.zuri.android.coreai.catalog.ModelCatalog
import app.zuri.android.coreai.device.AndroidDeviceProfiler
import app.zuri.android.coreai.install.AndroidModelLibrary
import app.zuri.android.coreai.install.ModelDownloader
import app.zuri.android.coreai.install.ModelInstaller
import app.zuri.android.coreai.runtime.LiteRtBenchmarks
import app.zuri.android.coreai.runtime.LiteRtEngineManager
import app.zuri.android.coreai.runtime.LiteRtLanguageModel
import app.zuri.android.coreai.storage.ModelStorage
import app.zuri.android.core.common.Clock
import app.zuri.android.domain.ai.LocalLanguageModel
import app.zuri.android.domain.ai.ModelBenchmarks
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.preferencesDataStoreFile
import app.zuri.android.domain.ai.ModelLibrary
import app.zuri.android.domain.ai.ModelSpec
import app.zuri.android.domain.privacy.EgressLedger
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import java.io.File
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object CoreAiModule {
    @Provides @Singleton
    fun catalog(): List<@JvmSuppressWildcards ModelSpec> = ModelCatalog.all

    @Provides @Singleton
    fun storage(@ApplicationContext context: Context) = ModelStorage(File(context.noBackupFilesDir, "models"))

    @Provides @Singleton
    fun profiler(@ApplicationContext context: Context) = AndroidDeviceProfiler(context)

    @Provides @Singleton
    fun installer(@ApplicationContext context: Context, storage: ModelStorage, downloader: ModelDownloader, ledger: EgressLedger) =
        ModelInstaller(storage, downloader, ledger) { runCatching { StatFs(context.noBackupFilesDir.path).availableBytes }.getOrDefault(0L) }

    @Provides @Singleton
    fun engines(@ApplicationContext context: Context) = LiteRtEngineManager(File(context.cacheDir, "litertlm"))

    @Provides @Singleton
    fun languageModel(catalog: List<@JvmSuppressWildcards ModelSpec>, storage: ModelStorage, engines: LiteRtEngineManager): LocalLanguageModel =
        LiteRtLanguageModel(catalog, storage, engines)

    @Provides @Singleton
    fun benchmarks(@ApplicationContext context: Context, catalog: List<@JvmSuppressWildcards ModelSpec>, storage: ModelStorage, engines: LiteRtEngineManager, clock: Clock): ModelBenchmarks =
        LiteRtBenchmarks(catalog, storage, engines, PreferenceDataStoreFactory.create { context.preferencesDataStoreFile("zuri_ai") }, clock)

    @Provides @Singleton
    fun library(
        @ApplicationContext context: Context,
        catalog: List<@JvmSuppressWildcards ModelSpec>,
        storage: ModelStorage,
        profiler: AndroidDeviceProfiler,
    ): ModelLibrary = AndroidModelLibrary(context, catalog, storage, profiler)
}
