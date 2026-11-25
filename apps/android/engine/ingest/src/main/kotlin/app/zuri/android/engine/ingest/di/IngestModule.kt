package app.zuri.android.engine.ingest.di

import app.zuri.android.domain.capture.CaptureControls
import app.zuri.android.domain.capture.CaptureStatusProvider
import app.zuri.android.engine.ingest.platform.AndroidCaptureControls
import app.zuri.android.engine.ingest.platform.AndroidCaptureStatusProvider
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent

@Module
@InstallIn(SingletonComponent::class)
abstract class IngestModule {
    @Binds abstract fun status(impl: AndroidCaptureStatusProvider): CaptureStatusProvider
    @Binds abstract fun controls(impl: AndroidCaptureControls): CaptureControls
}
