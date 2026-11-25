package app.zuri.android.shell

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.Storefront
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import app.zuri.android.R
import app.zuri.android.core.ui.components.IconChip
import app.zuri.android.core.ui.components.Tone
import app.zuri.android.core.ui.components.ZuriListGroup
import app.zuri.android.core.ui.components.ZuriListRow
import app.zuri.android.core.ui.theme.Zuri
import app.zuri.android.core.ui.theme.ZuriTint
import app.zuri.android.domain.workspace.Workspace
import app.zuri.android.domain.workspace.WorkspaceAccent
import app.zuri.android.domain.workspace.WorkspaceId
import app.zuri.android.domain.workspace.WorkspaceKind
import app.zuri.android.domain.workspace.WorkspaceNames

fun tintFor(workspace: Workspace?): ZuriTint = when (workspace?.accent) {
    null, WorkspaceAccent.TEAL -> ZuriTint.Teal
    WorkspaceAccent.INDIGO -> ZuriTint.Indigo
    WorkspaceAccent.PLUM -> ZuriTint.Plum
    WorkspaceAccent.AMBER -> ZuriTint.Amber
    WorkspaceAccent.SKY -> ZuriTint.Sky
    WorkspaceAccent.SLATE -> ZuriTint.Slate
}

fun iconFor(workspace: Workspace): ImageVector =
    if (workspace.kind == WorkspaceKind.PERSONAL) Icons.Rounded.Person else Icons.Rounded.Storefront

/** G08: switch the active context. Each workspace's own colour previews what the app will look like. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ContextSwitcherSheet(
    workspaces: List<Workspace>,
    active: WorkspaceId,
    onSelect: (WorkspaceId) -> Unit,
    onCreate: (String, WorkspaceAccent) -> Unit,
    onDismiss: () -> Unit,
) {
    var creating by rememberSaveable { mutableStateOf(false) }
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(Modifier.navigationBarsPadding().padding(bottom = 12.dp)) {
            Text(stringResource(R.string.ctx_title), style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(horizontal = 20.dp))
            Text(stringResource(R.string.ctx_sub), style = MaterialTheme.typography.bodyMedium, color = Zuri.colors.muted, modifier = Modifier.padding(horizontal = 20.dp, vertical = 6.dp))
            val selectedLabel = stringResource(R.string.ctx_selected)
            ZuriListGroup(rows = workspaces.map { ws ->
                @Composable {
                    ZuriListRow(
                        title = ws.name,
                        supporting = stringResource(if (ws.kind == WorkspaceKind.PERSONAL) R.string.ctx_personal_s else R.string.ctx_business_s),
                        leading = { WorkspaceBadge(ws) },
                        trailing = if (ws.id == active) { { Icon(Icons.Rounded.CheckCircle, selectedLabel, tint = Zuri.colors.ctx) } } else null,
                        onClick = { onSelect(ws.id); onDismiss() },
                        modifier = Modifier.semantics { selected = ws.id == active },
                    )
                }
            } + listOf<@Composable () -> Unit> {
                ZuriListRow(stringResource(R.string.ctx_new), leading = { IconChip(Icons.Rounded.Add, tone = Tone.Neutral) }, onClick = { creating = true })
            })
        }
    }
    if (creating) {
        NewWorkspaceDialog(onDismiss = { creating = false }, onCreate = { name, accent -> creating = false; onCreate(name, accent); onDismiss() })
    }
}

@Composable
private fun WorkspaceBadge(ws: Workspace) {
    Box(Modifier.size(40.dp).clip(RoundedCornerShape(14.dp)).background(tintFor(ws).base), contentAlignment = Alignment.Center) {
        Icon(iconFor(ws), null, tint = Color.White)
    }
}

private val businessAccents = listOf(WorkspaceAccent.INDIGO, WorkspaceAccent.PLUM, WorkspaceAccent.AMBER, WorkspaceAccent.SKY, WorkspaceAccent.SLATE)

@Composable
private fun NewWorkspaceDialog(onDismiss: () -> Unit, onCreate: (String, WorkspaceAccent) -> Unit) {
    var name by rememberSaveable { mutableStateOf("") }
    var accent by rememberSaveable { mutableStateOf(WorkspaceAccent.INDIGO) }
    val valid = WorkspaceNames.normalize(name) != null
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.ctx_new_title)) },
        text = {
            Column {
                Text(stringResource(R.string.ctx_new_body), style = MaterialTheme.typography.bodyMedium, color = Zuri.colors.muted)
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = name, onValueChange = { name = it.take(WorkspaceNames.MAX_LENGTH) },
                    label = { Text(stringResource(R.string.ctx_name)) }, singleLine = true, modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(12.dp))
                Text(stringResource(R.string.ctx_colour), style = MaterialTheme.typography.titleSmall)
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    businessAccents.forEach { a ->
                        val tint = tintFor(Workspace(WorkspaceId("x"), WorkspaceKind.BUSINESS, "", a, 0))
                        Box(
                            Modifier.size(40.dp).clip(CircleShape).background(tint.base)
                                .then(if (a == accent) Modifier.border(3.dp, MaterialTheme.colorScheme.onSurface, CircleShape) else Modifier)
                                .clickable { accent = a }
                                .semantics { contentDescription = a.name.lowercase(); selected = a == accent },
                        )
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = { onCreate(name, accent) }, enabled = valid) { Text(stringResource(R.string.ctx_create)) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.cancel)) } },
    )
}
