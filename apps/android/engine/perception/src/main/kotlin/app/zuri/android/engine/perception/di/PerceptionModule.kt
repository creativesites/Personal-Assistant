package app.zuri.android.engine.perception.di

import android.content.Context
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.preferencesDataStoreFile
import app.zuri.android.core.common.Clock
import app.zuri.android.data.local.db.ZuriDatabase
import app.zuri.android.domain.ai.LocalLanguageModel
import app.zuri.android.domain.inbox.AutoReplies
import app.zuri.android.domain.inbox.ConversationInsights
import app.zuri.android.domain.inbox.DraftFeedback
import app.zuri.android.engine.perception.insight.LocalConversationInsights
import app.zuri.android.domain.inbox.ReplyDrafter
import app.zuri.android.domain.inbox.ReplySender
import app.zuri.android.engine.perception.autoreply.AndroidAutoReplies
import app.zuri.android.engine.perception.autoreply.AutoReplyEngine
import app.zuri.android.domain.memory.PerceptionControls
import app.zuri.android.engine.perception.drafts.LocalReplyDrafter
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

    @Provides @Singleton
    fun drafter(db: ZuriDatabase, model: LocalLanguageModel, clock: Clock): ReplyDrafter = LocalReplyDrafter(db, model, clock::nowMillis)

    @Provides @Singleton
    fun indexer(db: ZuriDatabase, embedder: app.zuri.android.domain.ai.LocalEmbedder, clock: Clock) =
        app.zuri.android.engine.perception.embed.SemanticIndexer(db, embedder, clock::nowMillis)

    @Provides @Singleton
    fun localInsights(db: ZuriDatabase, model: LocalLanguageModel, clock: Clock) = LocalConversationInsights(db, model, clock::nowMillis)

    @Provides @Singleton
    fun insights(impl: LocalConversationInsights): ConversationInsights = impl

    @Provides @Singleton
    fun draftFeedback(impl: LocalConversationInsights): DraftFeedback = impl

    @Provides @Singleton
    fun androidAutoReplies(@ApplicationContext context: Context, db: ZuriDatabase, clock: Clock) =
        AndroidAutoReplies(context, db, PreferenceDataStoreFactory.create { context.preferencesDataStoreFile("zuri_auto_reply") }, clock)

    @Provides @Singleton
    fun autoReplies(impl: AndroidAutoReplies): AutoReplies = impl

    @Provides @Singleton
    fun autoReplyEngine(db: ZuriDatabase, drafter: ReplyDrafter, sender: ReplySender, settings: AndroidAutoReplies, clock: Clock) =
        AutoReplyEngine(db, drafter, sender, settings::current, clock)
}
