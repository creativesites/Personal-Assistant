package app.zuri.android.data.remote.di

import app.zuri.android.core.security.secrets.SecretStore
import app.zuri.android.data.remote.BuildConfig
import app.zuri.android.data.remote.ClerkAuth
import app.zuri.android.data.remote.CloudAccountStore
import app.zuri.android.data.remote.CloudApi
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import java.util.concurrent.TimeUnit
import javax.inject.Named
import javax.inject.Singleton
import okhttp3.OkHttpClient

@Module
@InstallIn(SingletonComponent::class)
object RemoteModule {
    @Provides @Singleton @Named("cloud")
    fun cloudHttp(): OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    @Provides @Named("apiBaseUrl")
    fun apiBaseUrl(): String = BuildConfig.API_BASE_URL

    @Provides @Singleton
    fun cloudApi(@Named("apiBaseUrl") base: String, @Named("cloud") http: OkHttpClient, tokens: CloudApi.TokenSource): CloudApi = CloudApi(base, http, tokens)

    @Provides @Singleton
    fun clerkAuth(): ClerkAuth = ClerkAuth()

    @Provides @Singleton
    fun cloudAccountStore(secrets: SecretStore): CloudAccountStore = CloudAccountStore(secrets)
}
