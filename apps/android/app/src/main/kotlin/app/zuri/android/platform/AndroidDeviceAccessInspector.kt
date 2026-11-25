package app.zuri.android.platform

import android.Manifest
import android.app.KeyguardManager
import android.content.Context
import android.content.pm.PackageManager
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import app.zuri.android.domain.privacy.DeviceAccessInspector
import app.zuri.android.domain.privacy.DeviceAccessReport
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject

/** Reads what the installed app can actually do, so Privacy Center never states an assumption. */
class AndroidDeviceAccessInspector @Inject constructor(
    @ApplicationContext private val context: Context,
) : DeviceAccessInspector {
    override fun report(): DeviceAccessReport {
        val pm = context.packageManager
        val requested = pm.getPackageInfo(context.packageName, PackageManager.GET_PERMISSIONS).requestedPermissions.orEmpty()
        fun granted(p: String) = ContextCompat.checkSelfPermission(context, p) == PackageManager.PERMISSION_GRANTED
        return DeviceAccessReport(
            hasNetworkPermission = Manifest.permission.INTERNET in requested,
            notificationAccessGranted = context.packageName in NotificationManagerCompat.getEnabledListenerPackages(context),
            contactsPermissionGranted = granted(Manifest.permission.READ_CONTACTS),
            calendarPermissionGranted = granted(Manifest.permission.READ_CALENDAR),
            deviceLockConfigured = context.getSystemService(KeyguardManager::class.java)?.isDeviceSecure == true,
        )
    }
}
