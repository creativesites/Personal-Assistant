package app.zuri.android

import android.Manifest
import android.app.Application
import android.content.pm.PackageManager
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.xmlpull.v1.XmlPullParser

/** Guards the privacy promises against accidental regressions (e.g. a library adding a permission). */
@RunWith(RobolectricTestRunner::class)
@Config(application = Application::class)
class ManifestPolicyTest {
    private val context = ApplicationProvider.getApplicationContext<Application>()

    /**
     * Every permission is accounted for. INTERNET arrived in M3 for model downloads only; code that
     * may use it is confined to :core-ai:remote by the architecture tests.
     */
    @Test fun onlyExpectedPermissionsAreRequested() {
        val info = context.packageManager.getPackageInfo(context.packageName, PackageManager.GET_PERMISSIONS)
        val allowed = setOf(
            Manifest.permission.INTERNET,
            Manifest.permission.ACCESS_NETWORK_STATE, // WorkManager: wait for Wi-Fi
            Manifest.permission.WAKE_LOCK, Manifest.permission.RECEIVE_BOOT_COMPLETED, // WorkManager
            Manifest.permission.FOREGROUND_SERVICE, Manifest.permission.FOREGROUND_SERVICE_DATA_SYNC, // download progress
            Manifest.permission.POST_NOTIFICATIONS,
            Manifest.permission.USE_BIOMETRIC, Manifest.permission.USE_FINGERPRINT, // app lock
            Manifest.permission.READ_CALENDAR, // M6 Trajectory: read-only, asked for with an explanation, optional
            "com.google.android.c2dm.permission.RECEIVE", // G7: FCM sync tickles (data-only, no content)
            context.packageName + ".DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION",
        )
        assertThat(allowed).containsAtLeastElementsIn(info.requestedPermissions.orEmpty().toList())
    }

    @Test fun cleartextTrafficIsOff() {
        val flags = context.packageManager.getApplicationInfo(context.packageName, 0).flags
        assertThat(flags and android.content.pm.ApplicationInfo.FLAG_USES_CLEARTEXT_TRAFFIC).isEqualTo(0)
    }

    @Test fun backupIsDisabled() {
        val flags = context.packageManager.getApplicationInfo(context.packageName, 0).flags
        assertThat(flags and android.content.pm.ApplicationInfo.FLAG_ALLOW_BACKUP).isEqualTo(0)
    }

    @Test fun everyDataDomainIsExcludedFromBackupAndTransfer() {
        val excluded = mutableMapOf<String, MutableSet<String>>()
        var section = ""
        context.resources.getXml(R.xml.data_extraction_rules).use { p ->
            while (p.next() != XmlPullParser.END_DOCUMENT) {
                if (p.eventType != XmlPullParser.START_TAG) continue
                when (p.name) {
                    "cloud-backup", "device-transfer" -> section = p.name
                    "exclude" -> excluded.getOrPut(section) { mutableSetOf() } += p.getAttributeValue(null, "domain")
                }
            }
        }
        val all = setOf("root", "file", "database", "sharedpref", "external")
        assertThat(excluded["cloud-backup"]).containsAtLeastElementsIn(all)
        assertThat(excluded["device-transfer"]).containsAtLeastElementsIn(all)
    }
}
