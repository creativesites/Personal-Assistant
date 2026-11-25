package app.zuri.android.coreai.remote

import app.zuri.android.coreai.install.ModelDownloader
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object RemoteModule {
    @Provides @Singleton
    fun downloader(): ModelDownloader = OkHttpModelDownloader()
}
