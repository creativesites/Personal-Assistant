package app.zuri.android.feature.inbox

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import app.zuri.android.core.ui.theme.Zuri
import app.zuri.android.domain.workspace.MoveSummary
import app.zuri.android.domain.workspace.Workspace
import app.zuri.android.domain.workspace.WorkspaceId

/** Move a chat to another workspace: says exactly what moves, and asks first (D-04 §3). */
@Composable
fun MoveContent(
    workspaces: List<Workspace>,
    current: WorkspaceId,
    preview: suspend () -> MoveSummary,
    onMove: (WorkspaceId) -> Unit,
    onCancel: () -> Unit,
) {
    var target by remember { mutableStateOf(workspaces.firstOrNull { it.id != current }?.id) }
    var summary by remember { mutableStateOf<MoveSummary?>(null) }
    LaunchedEffect(Unit) { summary = preview() }
    Column(Modifier.fillMaxWidth().padding(horizontal = 22.dp).navigationBarsPadding()) {
        Text(stringResource(R.string.move_title), style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(8.dp))
        workspaces.forEach { ws ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                RadioButton(selected = target == ws.id, onClick = { target = ws.id }, enabled = ws.id != current)
                Text(
                    if (ws.id == current) stringResource(R.string.move_current, ws.name) else ws.name,
                    style = MaterialTheme.typography.bodyLarge, color = if (ws.id == current) Zuri.colors.muted else MaterialTheme.colorScheme.onSurface,
                )
            }
        }
        Spacer(Modifier.height(8.dp))
        summary?.let { s ->
            Text(stringResource(R.string.move_body, s.messages, s.memories), style = MaterialTheme.typography.bodyMedium, color = Zuri.colors.muted)
        }
        Row(Modifier.fillMaxWidth().padding(vertical = 12.dp)) {
            Spacer(Modifier.weight(1f))
            TextButton(onClick = onCancel) { Text(stringResource(R.string.cancel)) }
            TextButton(onClick = { target?.let(onMove) }, enabled = target != null && target != current) { Text(stringResource(R.string.move_confirm)) }
        }
    }
}
