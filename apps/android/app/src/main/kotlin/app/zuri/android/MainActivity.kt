package app.zuri.android

import android.os.Build
import android.os.Bundle
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.getValue
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.zuri.android.core.security.applock.BiometricAuthenticator
import app.zuri.android.core.ui.theme.ZuriTheme
import app.zuri.android.domain.settings.ThemeMode
import app.zuri.android.shell.ZuriRoot
import app.zuri.android.shell.tintFor
import dagger.hilt.android.AndroidEntryPoint

/** FragmentActivity because BiometricPrompt needs one. */
@AndroidEntryPoint
class MainActivity : FragmentActivity() {
    private val viewModel: MainViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        val splash = installSplashScreen()
        super.onCreate(savedInstanceState)
        splash.setKeepOnScreenCondition { viewModel.state.value == AppState.Loading }
        // Zuri never shows its content in the recent-apps thumbnail (SECURITY_AND_PRIVACY.md §3.4).
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) setRecentsScreenshotEnabled(false)

        setContent {
            val mode by viewModel.themeMode.collectAsStateWithLifecycle()
            val state by viewModel.state.collectAsStateWithLifecycle()
            val dark = when (mode) { ThemeMode.SYSTEM -> isSystemInDarkTheme(); ThemeMode.LIGHT -> false; ThemeMode.DARK -> true }
            applySystemBars(dark)
            val tint = (state as? AppState.Ready)?.active?.let(::tintFor) ?: tintFor(null)
            ZuriTheme(darkTheme = dark, tint = tint) {
                ZuriRoot(
                    state = state,
                    versionName = BuildConfig.VERSION_NAME,
                    onUnlockRequested = ::requestUnlock,
                    onSwitchWorkspace = viewModel::switchTo,
                    onCreateBusiness = viewModel::createBusiness,
                )
            }
        }
    }

    private var lastDark: Boolean? = null
    private fun applySystemBars(dark: Boolean) {
        if (lastDark == dark) return
        lastDark = dark
        val style = if (dark) SystemBarStyle.dark(android.graphics.Color.TRANSPARENT)
        else SystemBarStyle.light(android.graphics.Color.TRANSPARENT, android.graphics.Color.TRANSPARENT)
        enableEdgeToEdge(statusBarStyle = style, navigationBarStyle = style)
    }

    private fun requestUnlock() {
        BiometricAuthenticator.authenticate(
            this, getString(R.string.lock_prompt_title), getString(R.string.lock_prompt_sub),
        ) { result -> if (result == BiometricAuthenticator.Result.Success) viewModel.onUnlocked() }
    }
}
