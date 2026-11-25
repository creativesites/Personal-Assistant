package app.zuri.android.engine.ingest.di

import app.zuri.android.domain.capture.CaptureControls
import app.zuri.android.domain.capture.CaptureStatusProvider
import app.zuri.android.engine.ingest.platform.AndroidCaptureControls
import app.zuri.android.engine.ingest.platform.AndroidCaptureStatusProvider
import android.content.Context
import app.zuri.android.core.common.Clock
import app.zuri.android.data.local.db.ZuriDatabase
import app.zuri.android.domain.inbox.ReplySender
import app.zuri.android.engine.ingest.reply.NotificationReplySender
import app.zuri.android.engine.ingest.reply.ReplyActions
import dagger.Binds
import dagger.Provides
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Singleton
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent

@Module
@InstallIn(SingletonComponent::class)
abstract class IngestModule {
    @Binds abstract fun status(impl: AndroidCaptureStatusProvider): CaptureStatusProvider
    @Binds abstract fun controls(impl: AndroidCaptureControls): CaptureControls

    companion object {
        @Provides @Singleton
        fun replyActions() = ReplyActions()

        @Provides @Singleton
        fun replySender(@ApplicationContext context: Context, db: ZuriDatabase, actions: ReplyActions, clock: Clock): ReplySender =
            NotificationReplySender(context, db, actions, clock)
    }
}
