package app.zuri.android.shell

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.Bookmarks
import androidx.compose.material.icons.rounded.Group
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.Shield
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import app.zuri.android.R
import app.zuri.android.core.ui.components.EmptyState
import app.zuri.android.core.ui.components.IconChip
import app.zuri.android.core.ui.components.ZuriListGroup
import app.zuri.android.core.ui.components.ZuriListRow
import app.zuri.android.core.ui.theme.Zuri

/** Root tabs whose features arrive in later milestones show their real, empty state. */
@Composable
fun EmptyTab(icon: ImageVector, title: Int, body: Int) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        EmptyState(icon, stringResource(title), stringResource(body), Modifier.padding(top = 24.dp))
    }
}

@Composable fun PeopleTab() = EmptyTab(Icons.Rounded.Group, R.string.people_empty_t, R.string.people_empty_b)

@Composable
fun MoreTab(onSettings: () -> Unit, onPrivacy: () -> Unit, onSecurity: () -> Unit, onModels: () -> Unit, onMemory: () -> Unit) {
    @Composable fun chevron() = Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, null, tint = Zuri.colors.muted)
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        Text(stringResource(R.string.more_title), style = MaterialTheme.typography.headlineLarge, modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp))
        ZuriListGroup(rows = listOf(
            { ZuriListRow(stringResource(R.string.more_memory), leading = { IconChip(Icons.Rounded.Bookmarks) }, trailing = { chevron() }, onClick = onMemory) },
            { ZuriListRow(stringResource(R.string.settings), leading = { IconChip(Icons.Rounded.Settings) }, trailing = { chevron() }, onClick = onSettings) },
            { ZuriListRow(stringResource(R.string.more_models), leading = { IconChip(Icons.Rounded.AutoAwesome) }, trailing = { chevron() }, onClick = onModels) },
            { ZuriListRow(stringResource(R.string.more_privacy), leading = { IconChip(Icons.Rounded.Shield) }, trailing = { chevron() }, onClick = onPrivacy) },
            { ZuriListRow(stringResource(R.string.more_security), leading = { IconChip(Icons.Rounded.Lock) }, trailing = { chevron() }, onClick = onSecurity) },
        ))
    }
}

