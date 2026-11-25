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

/** Guards M1's privacy promises against accidental regressions (e.g. a library adding INTERNET). */
@RunWith(RobolectricTestRunner::class)
@Config(application = Application::class)
class ManifestPolicyTest {
    private val context = ApplicationProvider.getApplicationContext<Application>()

    @Test fun appCannotUseTheNetwork() {
        val info = context.packageManager.getPackageInfo(context.packageName, PackageManager.GET_PERMISSIONS)
        assertThat(info.requestedPermissions.orEmpty().toList()).doesNotContain(Manifest.permission.INTERNET)
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
