package app.zuri.android.di

import app.zuri.android.core.common.Clock
import app.zuri.android.domain.privacy.DeviceAccessInspector
import app.zuri.android.platform.AndroidDeviceAccessInspector
import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class AppModule {
    @Binds @Singleton
    abstract fun deviceAccess(impl: AndroidDeviceAccessInspector): DeviceAccessInspector

    companion object {
        @Provides @Singleton
        fun clock(): Clock = Clock.System

        @Provides @Singleton
        fun deviceCalendar(@dagger.hilt.android.qualifiers.ApplicationContext context: android.content.Context): app.zuri.android.domain.people.DeviceCalendar =
            app.zuri.android.platform.AndroidDeviceCalendar(context)
    }
}
