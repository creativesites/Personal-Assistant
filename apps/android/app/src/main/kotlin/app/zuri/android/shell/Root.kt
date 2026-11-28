package app.zuri.android.shell

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.zuri.android.AppState
import app.zuri.android.R
import app.zuri.android.core.ui.components.IconChip
import app.zuri.android.core.ui.components.SecureContent
import app.zuri.android.core.ui.components.Tone
import app.zuri.android.core.ui.components.ZuriMark
import app.zuri.android.core.ui.theme.Zuri
import app.zuri.android.domain.workspace.WorkspaceAccent
import app.zuri.android.domain.workspace.WorkspaceId
import app.zuri.android.feature.onboarding.OnboardingRoute

@Composable
fun ZuriRoot(
    state: AppState,
    versionName: String,
    onUnlockRequested: () -> Unit,
    onSwitchWorkspace: (WorkspaceId) -> Unit,
    onCreateBusiness: (String, WorkspaceAccent) -> Unit,
    onHybrid: (Set<WorkspaceId>) -> Unit = {},
) {
    // Every screen sits in the sky (spec §10.1); surfaces above it are glass.
    app.zuri.android.core.ui.universe.SpaceBackground(Modifier.fillMaxSize()) {
        when (state) {
            AppState.Loading -> Unit // the splash screen stays up
            AppState.Onboarding -> OnboardingRoute()
            AppState.Locked -> LockScreen(onUnlockRequested)
            AppState.CannotOpenData -> CannotOpenDataScreen()
            is AppState.Ready -> SecureContent(enabled = state.blockScreenshots) {
                ZuriShell(state, versionName, onSwitchWorkspace, onCreateBusiness, onHybrid)
            }
        }
    }
}

@Composable
fun LockScreen(onUnlock: () -> Unit) {
    LaunchedEffect(Unit) { onUnlock() }
    Column(
        Modifier.fillMaxSize().safeDrawingPadding().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center,
    ) {
        ZuriMark(size = 64.dp)
        Spacer(Modifier.height(20.dp))
        Text(stringResource(R.string.lock_title), style = MaterialTheme.typography.headlineMedium)
        Spacer(Modifier.height(6.dp))
        Text(stringResource(R.string.lock_body), color = Zuri.colors.muted, textAlign = TextAlign.Center)
        Spacer(Modifier.height(24.dp))
        Button(onClick = onUnlock, modifier = Modifier.heightIn(min = 52.dp)) {
            Text(stringResource(R.string.lock_unlock))
        }
    }
}

@Composable
fun CannotOpenDataScreen() {
    Column(
        Modifier.fillMaxSize().safeDrawingPadding().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center,
    ) {
        IconChip(Icons.Rounded.ErrorOutline, tone = Tone.Bad, size = 56.dp)
        Spacer(Modifier.height(16.dp))
        Text(stringResource(R.string.fatal_title), style = MaterialTheme.typography.headlineSmall, textAlign = TextAlign.Center)
        Spacer(Modifier.height(8.dp))
        Text(stringResource(R.string.fatal_body), color = Zuri.colors.muted, textAlign = TextAlign.Center)
    }
}
