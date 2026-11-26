package app.zuri.android.engine.retrieval.di

import app.zuri.android.data.local.db.ZuriDatabase
import app.zuri.android.domain.ai.LocalLanguageModel
import app.zuri.android.domain.memory.AskZuri
import app.zuri.android.engine.retrieval.LocalAskZuri
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object RetrievalModule {
    @Provides @Singleton
    fun ask(db: ZuriDatabase, model: LocalLanguageModel, embedder: app.zuri.android.domain.ai.LocalEmbedder): AskZuri = LocalAskZuri(db, model, embedder = embedder)
}
