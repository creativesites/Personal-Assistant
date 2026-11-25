package app.zuri.android.feature.sources

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Block
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.NotificationsActive
import androidx.compose.material.icons.rounded.Tune
import androidx.compose.material.icons.rounded.Visibility
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.zuri.android.core.ui.capture.SourceMark
import app.zuri.android.core.ui.capture.label
import app.zuri.android.core.ui.components.CardStyle
import app.zuri.android.core.ui.components.DetailTopBar
import app.zuri.android.core.ui.components.IconChip
import app.zuri.android.core.ui.components.SectionHeader
import app.zuri.android.core.ui.components.Tone
import app.zuri.android.core.ui.components.ZuriCard
import app.zuri.android.core.ui.components.ZuriListGroup
import app.zuri.android.core.ui.components.ZuriListRow
import app.zuri.android.core.ui.theme.Zuri
import app.zuri.android.domain.capture.CaptureHealth
import app.zuri.android.domain.capture.RetentionOptions
import app.zuri.android.domain.capture.SourceCapabilities
import app.zuri.android.domain.capture.SourceKind
import java.text.DateFormat
import java.util.Date

/** Callbacks for [SourcesContent], kept together so previews and tests can pass no-ops. */
data class SourcesActions(
    val onBack: () -> Unit = {},
    val onToggle: (SourceKind, Boolean) -> Unit = { _, _ -> },
    val onStoreOnly: (SourceKind, Boolean) -> Unit = { _, _ -> },
    val onRetention: (SourceKind, Int?) -> Unit = { _, _ -> },
    val onDeleteAll: (SourceKind) -> Unit = {},
    val onPause: (Boolean) -> Unit = {},
    val onAllowAccess: () -> Unit = {},
    val onAppInfo: () -> Unit = {},
    val onReconnect: () -> Unit = {},
    val onBattery: () -> Unit = {},
)

/** G04 Notification source selection, with the G04b prominent disclosure before Android's screen. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SourcesRoute(onBack: () -> Unit, viewModel: SourcesViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var disclosure by rememberSaveable { mutableStateOf(false) }
    LifecycleResumeEffect(Unit) {
        viewModel.refresh()
        onPauseOrDispose { }
    }
    SourcesContent(
        state,
        SourcesActions(
            onBack = onBack,
            onToggle = { kind, on -> if (viewModel.setEnabled(kind, on)) disclosure = true },
            onStoreOnly = { k, v -> viewModel.setStoreOnly(k, v) },
            onRetention = { k, v -> viewModel.setRetention(k, v) },
            onDeleteAll = { viewModel.deleteAll(it) },
            onPause = { viewModel.setPaused(it) },
            onAllowAccess = { disclosure = true },
            onAppInfo = viewModel::openAppInfo,
            onReconnect = viewModel::reconnect,
            onBattery = viewModel::openBatterySettings,
        ),
    )
    if (disclosure) {
        val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        ModalBottomSheet(onDismissRequest = { disclosure = false }, sheetState = sheet) {
            AccessDisclosureContent(
                onContinue = { disclosure = false; viewModel.openAccessSettings() },
                onNotNow = { disclosure = false },
            )
        }
    }
}

@Composable
fun SourcesContent(state: SourcesState, actions: SourcesActions, modifier: Modifier = Modifier) {
    var confirmDelete by rememberSaveable { mutableStateOf<SourceKind?>(null) }
    var expanded by rememberSaveable { mutableStateOf<SourceKind?>(null) }
    Column(modifier.fillMaxSize()) {
        DetailTopBar(stringResource(R.string.sources_title), actions.onBack, subtitle = stringResource(R.string.sources_subtitle))
        Column(Modifier.verticalScroll(rememberScrollState()).padding(bottom = 24.dp)) {
            StatusCard(state, actions)
            if (state.status.enabledSources.isNotEmpty() || state.status.paused) {
                ZuriListGroup(rows = listOf {
                    ZuriListRow(
                        stringResource(R.string.pause_t), supporting = stringResource(R.string.pause_s),
                        trailing = { Switch(checked = state.status.paused, onCheckedChange = actions.onPause) },
                        onClick = { actions.onPause(!state.status.paused) }, role = Role.Switch,
                    )
                })
            }
            SectionHeader(stringResource(R.string.section_sources))
            ZuriListGroup(rows = state.rows.map { row ->
                {
                    SourceRowView(
                        row = row,
                        expanded = expanded == row.setting.kind && row.setting.enabled,
                        onExpand = { expanded = if (expanded == row.setting.kind) null else row.setting.kind },
                        actions = actions,
                        onDelete = { confirmDelete = row.setting.kind },
                    )
                }
            })
            ZuriCard(style = CardStyle.Flat) {
                Text(stringResource(R.string.limits_t), style = MaterialTheme.typography.titleSmall)
                Spacer(Modifier.height(4.dp))
                Text(stringResource(R.string.limits_b), style = MaterialTheme.typography.bodyMedium, color = Zuri.colors.muted)
            }
        }
    }
    confirmDelete?.let { kind ->
        val count = state.rows.firstOrNull { it.setting.kind == kind }?.messageCount ?: 0
        val name = stringResource(kind.label())
        AlertDialog(
            onDismissRequest = { confirmDelete = null },
            title = { Text(stringResource(R.string.delete_all_title, count, name)) },
            text = { Text(stringResource(R.string.delete_all_body)) },
            confirmButton = { TextButton(onClick = { actions.onDeleteAll(kind); confirmDelete = null }) { Text(stringResource(R.string.delete), color = Zuri.colors.bad) } },
            dismissButton = { TextButton(onClick = { confirmDelete = null }) { Text(stringResource(R.string.cancel)) } },
        )
    }
}

@Composable
private fun StatusCard(state: SourcesState, actions: SourcesActions) {
    val s = state.status
    val style = if (s.state == CaptureHealth.LISTENING) CardStyle.Tinted else CardStyle.Plain
    ZuriCard(style = style) {
        when (s.state) {
            CaptureHealth.LISTENING -> {
                StatusLine(Tone.Ok, stringResource(R.string.status_listening_t))
                val last = s.lastCaptureAtMillis
                Body(
                    if (last == null) stringResource(R.string.status_listening_none)
                    else stringResource(R.string.status_listening_b, s.capturedToday, DateFormat.getTimeInstance(DateFormat.SHORT).format(Date(last))),
                )
            }
            CaptureHealth.NEEDS_ACCESS -> {
                StatusLine(Tone.Warn, stringResource(R.string.status_access_t))
                Body(stringResource(R.string.status_access_b))
                Spacer(Modifier.height(12.dp))
                Button(onClick = actions.onAllowAccess, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.status_access_cta)) }
                Spacer(Modifier.height(12.dp))
                HorizontalDivider(color = Zuri.colors.line)
                Spacer(Modifier.height(10.dp))
                Text(stringResource(R.string.status_greyed_t), style = MaterialTheme.typography.titleSmall)
                Body(stringResource(R.string.status_greyed_b))
                TextButton(onClick = actions.onAppInfo) { Text(stringResource(R.string.status_greyed_cta)) }
            }
            CaptureHealth.DISCONNECTED -> {
                StatusLine(Tone.Warn, stringResource(R.string.status_disconnected_t))
                Body(stringResource(R.string.status_disconnected_b))
                Spacer(Modifier.height(12.dp))
                Button(onClick = actions.onReconnect) { Text(stringResource(R.string.status_reconnect)) }
                if (state.batteryOptimised) {
                    Spacer(Modifier.height(10.dp))
                    Body(stringResource(R.string.status_battery_b))
                    TextButton(onClick = actions.onBattery) { Text(stringResource(R.string.status_battery_cta)) }
                }
            }
            CaptureHealth.OFF -> if (s.paused) {
                StatusLine(Tone.Neutral, stringResource(R.string.status_paused_t))
                Body(stringResource(R.string.status_paused_b))
                Spacer(Modifier.height(12.dp))
                OutlinedButton(onClick = { actions.onPause(false) }) { Text(stringResource(R.string.status_resume)) }
            } else {
                StatusLine(Tone.Neutral, stringResource(R.string.status_off_t))
                Body(stringResource(R.string.status_off_b))
            }
        }
    }
}

@Composable
private fun StatusLine(tone: Tone, text: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        IconChip(Icons.Rounded.NotificationsActive, tone = tone, size = 34.dp)
        Text(text, style = MaterialTheme.typography.titleMedium)
    }
    Spacer(Modifier.height(8.dp))
}

@Composable
private fun Body(text: String) = Text(text, style = MaterialTheme.typography.bodyMedium, color = Zuri.colors.muted)

@Composable
private fun SourceRowView(row: SourceRow, expanded: Boolean, onExpand: () -> Unit, actions: SourcesActions, onDelete: () -> Unit) {
    val kind = row.setting.kind
    val supporting = when {
        !row.installed -> stringResource(R.string.source_not_installed)
        row.setting.enabled && row.messageCount > 0 -> pluralStringResource(R.plurals.source_count, row.messageCount, row.messageCount)
        else -> capabilityLine(kind.capabilities)
    }
    Column {
        ZuriListRow(
            title = stringResource(kind.label()),
            supporting = supporting,
            supportingMaxLines = 4,
            leading = { SourceMark(kind) },
            trailing = {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (row.setting.enabled) IconChipButton(Icons.Rounded.Tune, onExpand)
                    Switch(checked = row.setting.enabled, enabled = row.installed, onCheckedChange = { actions.onToggle(kind, it) })
                }
            },
            enabled = row.installed,
            onClick = { actions.onToggle(kind, !row.setting.enabled) },
            role = Role.Switch,
        )
        if (expanded) SourceOptions(row, actions, onDelete)
    }
}

@Composable
private fun IconChipButton(icon: ImageVector, onClick: () -> Unit) {
    androidx.compose.material3.IconButton(onClick = onClick) {
        androidx.compose.material3.Icon(icon, contentDescription = stringResource(R.string.opt_retention_t), tint = Zuri.colors.muted)
    }
}

@Composable
private fun capabilityLine(c: SourceCapabilities): String {
    val parts = buildList {
        add(stringResource(R.string.cap_text))
        if (c.groups) add(stringResource(R.string.cap_groups))
        if (c.contentOftenHidden) add(stringResource(R.string.cap_hidden))
        if (c.otpRedaction) add(stringResource(R.string.cap_otp))
        if (c.partialByDesign) add(stringResource(R.string.cap_partial))
        if (c.mediaAsLabelsOnly) add(stringResource(R.string.cap_media))
    }
    return parts.joinToString(" · ")
}

@Composable
private fun SourceOptions(row: SourceRow, actions: SourcesActions, onDelete: () -> Unit) {
    val kind = row.setting.kind
    Column(Modifier.fillMaxWidth().padding(start = 14.dp, end = 14.dp, bottom = 14.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(stringResource(R.string.opt_store_only_t), style = MaterialTheme.typography.titleSmall)
                Text(stringResource(R.string.opt_store_only_s), style = MaterialTheme.typography.bodySmall, color = Zuri.colors.muted)
            }
            Switch(checked = row.setting.storeOnly, onCheckedChange = { actions.onStoreOnly(kind, it) })
        }
        Spacer(Modifier.height(12.dp))
        Text(stringResource(R.string.opt_retention_t), style = MaterialTheme.typography.titleSmall)
        Spacer(Modifier.height(6.dp))
        val labels = listOf(R.string.opt_retention_30, R.string.opt_retention_90, R.string.opt_retention_365, R.string.opt_retention_forever)
        SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
            RetentionOptions.days.forEachIndexed { i, days ->
                SegmentedButton(
                    selected = row.setting.retentionDays == days,
                    onClick = { actions.onRetention(kind, days) },
                    shape = SegmentedButtonDefaults.itemShape(i, RetentionOptions.days.size),
                    icon = {},
                ) { Text(stringResource(labels[i]), maxLines = 1, style = MaterialTheme.typography.labelMedium) }
            }
        }
        if (row.messageCount > 0) {
            Spacer(Modifier.height(6.dp))
            TextButton(onClick = onDelete) { Text(stringResource(R.string.opt_delete_all, stringResource(kind.label())), color = Zuri.colors.bad) }
        }
    }
}

/** G04b: the Play-required prominent disclosure shown before Android's Notification access screen. */
@Composable
fun AccessDisclosureContent(onContinue: () -> Unit, onNotNow: () -> Unit, modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 22.dp).navigationBarsPadding()) {
        Text(stringResource(R.string.disclosure_title), style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(16.dp))
        Point(Icons.Rounded.Visibility, R.string.disclosure_read_t, R.string.disclosure_read_b)
        Point(Icons.Rounded.Block, R.string.disclosure_not_t, R.string.disclosure_not_b)
        Point(Icons.Rounded.Lock, R.string.disclosure_where_t, R.string.disclosure_where_b)
        Point(Icons.Rounded.Tune, R.string.disclosure_control_t, R.string.disclosure_control_b)
        Spacer(Modifier.height(4.dp))
        Text(stringResource(R.string.disclosure_next), style = MaterialTheme.typography.bodyMedium, color = Zuri.colors.muted)
        Spacer(Modifier.height(18.dp))
        Button(onClick = onContinue, modifier = Modifier.fillMaxWidth().height(52.dp)) { Text(stringResource(R.string.disclosure_continue)) }
        TextButton(onClick = onNotNow, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.disclosure_not_now)) }
        Spacer(Modifier.height(12.dp))
    }
}

@Composable
private fun ColumnScope.Point(icon: ImageVector, title: Int, body: Int) {
    Row(Modifier.padding(bottom = 14.dp)) {
        IconChip(icon, size = 36.dp)
        Spacer(Modifier.padding(start = 12.dp))
        Column(Modifier.weight(1f)) {
            Text(stringResource(title), style = MaterialTheme.typography.titleSmall)
            Text(stringResource(body), style = MaterialTheme.typography.bodyMedium, color = Zuri.colors.muted)
        }
    }
}

