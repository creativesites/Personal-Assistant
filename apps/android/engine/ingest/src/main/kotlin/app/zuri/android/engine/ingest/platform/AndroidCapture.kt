package app.zuri.android.engine.ingest.platform

import android.content.ActivityNotFoundException
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.service.notification.NotificationListenerService
import androidx.core.app.NotificationManagerCompat
import app.zuri.android.data.local.db.ZuriDatabase
import app.zuri.android.domain.capture.CaptureControls
import app.zuri.android.domain.capture.CaptureStatus
import app.zuri.android.domain.capture.CaptureStatusProvider
import app.zuri.android.domain.capture.SourceKind
import app.zuri.android.domain.capture.SourceSettingsRepository
import app.zuri.android.engine.ingest.pipeline.IngestPipeline
import dagger.hilt.android.qualifiers.ApplicationContext
import java.time.LocalDate
import java.time.ZoneId
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.flowOn

/** Whether Android currently has the listener bound in this process. */
@Singleton
class ListenerConnection @Inject constructor() {
    private val _connected = MutableStateFlow(false)
    val connected = _connected.asStateFlow()
    fun set(value: Boolean) { _connected.value = value }
}

@Singleton
class AndroidCaptureStatusProvider @Inject constructor(
    @ApplicationContext private val context: Context,
    private val connection: ListenerConnection,
    private val settings: SourceSettingsRepository,
    private val pipeline: IngestPipeline,
    private val database: dagger.Lazy<ZuriDatabase>,
) : CaptureStatusProvider {
    private val access = MutableStateFlow(accessGranted())

    @OptIn(ExperimentalCoroutinesApi::class)
    override val status: Flow<CaptureStatus> = access.flatMapLatest { granted ->
        val dayStart = LocalDate.now(ZoneId.systemDefault()).atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli()
        val raw = if (granted) database.get().captureRawDao() else null
        combine(
            settings.settings,
            settings.paused,
            connection.connected,
            raw?.observeLastCapture() ?: flowOf(null),
            raw?.observeCountSince(dayStart) ?: flowOf(0),
        ) { list, paused, connected, lastStored, today ->
            CaptureStatus(
                accessGranted = granted,
                listenerConnected = connected,
                paused = paused,
                enabledSources = list.filter { it.enabled }.map { it.kind }.toSet(),
                lastCaptureAtMillis = listOfNotNull(lastStored, pipeline.lastCaptureAt.value).maxOrNull(),
                capturedToday = today,
            )
        }
    }.flowOn(Dispatchers.IO) // opening the encrypted database must not happen on the main thread

    override fun refresh() {
        access.value = accessGranted()
        if (access.value) pipeline.start()
    }

    override fun requestRebind() {
        if (accessGranted()) NotificationListenerService.requestRebind(ComponentName(context, ZuriNotificationListener::class.java))
    }

    private fun accessGranted() = context.packageName in NotificationManagerCompat.getEnabledListenerPackages(context)
}

class AndroidCaptureControls @Inject constructor(@ApplicationContext private val context: Context) : CaptureControls {
    override fun openAccessSettings() {
        val component = ComponentName(context, ZuriNotificationListener::class.java).flattenToString()
        val detail = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS).putExtra(Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME, component)
        } else null
        if (detail == null || !start(detail)) start(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
    }

    override fun openAppInfo() {
        start(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null)))
    }

    override fun openBatterySettings() {
        start(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
    }

    override fun isBatteryOptimised(): Boolean =
        context.getSystemService(PowerManager::class.java)?.isIgnoringBatteryOptimizations(context.packageName) == false

    override fun installedSources(): Set<SourceKind> {
        val pm = context.packageManager
        return SourceKind.entries.filter { kind ->
            kind.packages.any { pkg -> runCatching { pm.getPackageInfo(pkg, 0) }.isSuccess }
        }.toSet()
    }

    private fun start(intent: Intent): Boolean = try {
        context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        true
    } catch (e: ActivityNotFoundException) {
        false
    } catch (e: SecurityException) {
        false
    }
}
