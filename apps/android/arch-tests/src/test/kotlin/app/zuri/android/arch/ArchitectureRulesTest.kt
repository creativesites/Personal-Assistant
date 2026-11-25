package app.zuri.android.arch

import com.lemonappdev.konsist.api.Konsist
import com.lemonappdev.konsist.api.verify.assertFalse
import org.junit.Test

/**
 * Architecture rules from ARCHITECTURE.md §3.1 and SECURITY_AND_PRIVACY.md §4, checked on every build.
 * Konsist reads the source tree, so these hold regardless of how dependencies are wired.
 */
class ArchitectureRulesTest {
    private val production = Konsist.scopeFromProduction()

    @Test fun featuresDoNotReachIntoTheDataLayer() {
        production.files.filter { it.path.contains("/feature/") }
            .assertFalse { file ->
                file.imports.any {
                    it.name.startsWith("app.zuri.android.data.") || it.name.startsWith("app.zuri.android.core.security.") ||
                        it.name.startsWith("app.zuri.android.engine.") || it.name.startsWith("app.zuri.android.coreai.")
                }
            }
    }

    /** Only the ingest engine may touch notifications; nothing else reads another app's content. */
    @Test fun onlyTheIngestEngineReadsNotifications() {
        production.files.filter { !it.path.contains("/engine/ingest/") }
            .assertFalse { file -> file.imports.any { it.name.startsWith("android.service.notification.") } }
    }

    @Test fun domainIsPlatformFree() {
        production.files.filter { it.path.contains("/domain/src/") }
            .assertFalse { file -> file.imports.any { it.name.startsWith("android.") || it.name.startsWith("androidx.") } }
    }

    /** Only the future remote modules (data/remote, core-ai/remote) may talk to the network. */
    @Test fun noModuleOpensNetworkConnections() {
        val allowed = listOf("/data/remote/", "/core-ai/remote/")
        val forbidden = listOf("okhttp3.", "java.net.HttpURLConnection", "java.net.URL", "retrofit2.", "io.ktor.client")
        production.files.filter { f -> allowed.none { f.path.contains(it) } }
            .assertFalse { file -> file.imports.any { imp -> forbidden.any { imp.name.startsWith(it) } } }
    }

    /** All logging goes through the redacting ZuriLog. */
    @Test fun androidLogIsOnlyUsedByZuriLog() {
        production.files.filter { !it.path.endsWith("/ZuriLog.kt") }
            .assertFalse { file -> file.imports.any { it.name == "android.util.Log" } }
    }
}
