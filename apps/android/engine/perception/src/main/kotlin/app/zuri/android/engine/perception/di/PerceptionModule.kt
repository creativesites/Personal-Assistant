package app.zuri.android.engine.perception.di

import android.content.Context
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.preferencesDataStoreFile
import app.zuri.android.core.common.Clock
import app.zuri.android.data.local.db.ZuriDatabase
import app.zuri.android.domain.ai.LocalLanguageModel
import app.zuri.android.domain.memory.PerceptionControls
import app.zuri.android.engine.perception.pipeline.AndroidPerceptionControls
import app.zuri.android.engine.perception.pipeline.PerceptionRunner
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object PerceptionModule {
    @Provides @Singleton
    fun runner(db: ZuriDatabase, model: LocalLanguageModel, clock: Clock) = PerceptionRunner(db, model, clock)

    @Provides @Singleton
    fun androidControls(@ApplicationContext context: Context, db: ZuriDatabase, model: LocalLanguageModel, clock: Clock) =
        AndroidPerceptionControls(context, db, model, PreferenceDataStoreFactory.create { context.preferencesDataStoreFile("zuri_perception") }, clock)

    @Provides @Singleton
    fun controls(impl: AndroidPerceptionControls): PerceptionControls = impl
}
