package app.zuri.android.feature.settings

import android.text.format.Formatter
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Sensors
import androidx.compose.material.icons.rounded.Shield
import androidx.compose.material.icons.rounded.Storefront
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.zuri.android.core.ui.components.CardStyle
import app.zuri.android.core.ui.components.DetailTopBar
import app.zuri.android.core.ui.components.IconChip
import app.zuri.android.core.ui.components.SectionHeader
import app.zuri.android.core.ui.components.StatusTag
import app.zuri.android.core.ui.components.Tone
import app.zuri.android.core.ui.components.ZuriCard
import app.zuri.android.core.ui.components.ZuriListGroup
import app.zuri.android.core.ui.components.ZuriListRow
import app.zuri.android.core.ui.theme.Zuri
import app.zuri.android.domain.privacy.DeviceAccessReport
import app.zuri.android.domain.privacy.StorageReport
import app.zuri.android.domain.settings.LockTimeout
import app.zuri.android.domain.settings.ThemeMode

@Composable
private fun Chevron() = Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, null, tint = Zuri.colors.muted)

// ---------------- Settings (G10) ----------------

@Composable
fun SettingsRoute(
    versionName: String, onBack: () -> Unit, onOpenSecurity: () -> Unit, onOpenPrivacy: () -> Unit, onOpenSources: () -> Unit,
    onOpenWorkspaces: () -> Unit = {}, viewModel: SettingsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    SettingsContent(state, versionName, onBack, viewModel::setTheme, onOpenSecurity, onOpenPrivacy, onOpenSources, onOpenWorkspaces)
}

@Composable
fun SettingsContent(
    state: SettingsState, versionName: String, onBack: () -> Unit, onTheme: (ThemeMode) -> Unit,
    onOpenSecurity: () -> Unit, onOpenPrivacy: () -> Unit, onOpenSources: () -> Unit, onOpenWorkspaces: () -> Unit = {},
) {
    Column(Modifier.fillMaxSize()) {
        DetailTopBar(stringResource(R.string.settings_title), onBack)
        Column(Modifier.verticalScroll(rememberScrollState())) {
            SectionHeader(stringResource(R.string.settings_appearance))
            ZuriCard {
                Text(stringResource(R.string.settings_theme), style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(10.dp))
                val modes = listOf(ThemeMode.SYSTEM to R.string.settings_theme_system, ThemeMode.LIGHT to R.string.settings_theme_light, ThemeMode.DARK to R.string.settings_theme_dark)
                SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                    modes.forEachIndexed { i, (mode, label) ->
                        SegmentedButton(
                            selected = state.themeMode == mode, onClick = { onTheme(mode) },
                            shape = SegmentedButtonDefaults.itemShape(i, modes.size),
                        ) { Text(stringResource(label)) }
                    }
                }
                Spacer(Modifier.height(8.dp))
                Text(stringResource(R.string.settings_theme_hint), style = MaterialTheme.typography.bodySmall, color = Zuri.colors.muted)
            }
            ZuriListGroup(rows = listOf({
                ZuriListRow(
                    stringResource(R.string.settings_workspaces), supporting = stringResource(R.string.settings_workspaces_s),
                    leading = { IconChip(Icons.Rounded.Storefront) }, trailing = { Chevron() }, onClick = onOpenWorkspaces,
                )
            }))
            SectionHeader(stringResource(R.string.settings_privacy_security))
            ZuriListGroup(rows = listOf(
                { ZuriListRow(stringResource(R.string.settings_privacy_center), supporting = stringResource(R.string.settings_privacy_center_s), leading = { IconChip(Icons.Rounded.Shield) }, trailing = { Chevron() }, onClick = onOpenPrivacy) },
                { ZuriListRow(stringResource(R.string.settings_security), supporting = lockSummary(state), leading = { IconChip(Icons.Rounded.Lock) }, trailing = { Chevron() }, onClick = onOpenSecurity) },
                { ZuriListRow(stringResource(R.string.settings_sources), supporting = stringResource(R.string.settings_sources_s), leading = { IconChip(Icons.Rounded.Sensors) }, trailing = { Chevron() }, onClick = onOpenSources) },
            ))
            SectionHeader(stringResource(R.string.settings_about))
            ZuriListGroup(rows = listOf(
                { ZuriListRow(stringResource(R.string.settings_version), supporting = versionName, leading = { IconChip(Icons.Rounded.Info, tone = Tone.Neutral) }) },
                { ZuriListRow(stringResource(R.string.settings_licenses), supporting = stringResource(R.string.settings_licenses_s)) },
            ))
            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
private fun lockSummary(state: SettingsState): String = when {
    !state.deviceCanLock -> stringResource(R.string.security_lock_unavailable)
    !state.security.appLockEnabled -> stringResource(R.string.state_off)
    else -> stringResource(timeoutLabel(state.security.lockTimeout))
}

private fun timeoutLabel(t: LockTimeout) = when (t) {
    LockTimeout.IMMEDIATELY -> R.string.security_timeout_immediately
    LockTimeout.ONE_MINUTE -> R.string.security_timeout_1
    LockTimeout.FIVE_MINUTES -> R.string.security_timeout_5
    LockTimeout.FIFTEEN_MINUTES -> R.string.security_timeout_15
    LockTimeout.ON_RESTART_ONLY -> R.string.security_timeout_restart
}

// ---------------- Security (G12) ----------------

@Composable
fun SecurityRoute(onBack: () -> Unit, viewModel: SettingsViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    SecurityContent(state, onBack, viewModel::setAppLock, viewModel::setTimeout, viewModel::setBlockScreenshots)
}

@Composable
fun SecurityContent(
    state: SettingsState, onBack: () -> Unit, onAppLock: (Boolean) -> Unit,
    onTimeout: (LockTimeout) -> Unit, onBlockScreenshots: (Boolean) -> Unit,
) {
    val s = state.security
    Column(Modifier.fillMaxSize()) {
        DetailTopBar(stringResource(R.string.security_title), onBack)
        Column(Modifier.verticalScroll(rememberScrollState())) {
            ZuriListGroup(rows = listOf {
                ZuriListRow(
                    stringResource(R.string.security_lock),
                    supporting = if (state.deviceCanLock) stringResource(R.string.security_lock_s) else stringResource(R.string.security_lock_unavailable),
                    supportingMaxLines = 3, enabled = state.deviceCanLock,
                    trailing = { Switch(checked = s.appLockEnabled && state.deviceCanLock, onCheckedChange = onAppLock, enabled = state.deviceCanLock) },
                    onClick = { onAppLock(!s.appLockEnabled) }, role = Role.Switch,
                )
            })
            if (s.appLockEnabled && state.deviceCanLock) {
                SectionHeader(stringResource(R.string.security_lock_after))
                ZuriCard(contentPadding = false, modifier = Modifier.selectableGroup()) {
                    LockTimeout.entries.forEach { t ->
                        Row(
                            Modifier.fillMaxWidth().selectable(selected = s.lockTimeout == t, onClick = { onTimeout(t) }, role = Role.RadioButton)
                                .padding(horizontal = 8.dp, vertical = 2.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            RadioButton(selected = s.lockTimeout == t, onClick = null, modifier = Modifier.padding(12.dp))
                            Text(stringResource(timeoutLabel(t)), style = MaterialTheme.typography.bodyLarge)
                        }
                    }
                }
            }
            SectionHeader("")
            ZuriListGroup(rows = listOf {
                ZuriListRow(
                    stringResource(R.string.security_screenshots), supporting = stringResource(R.string.security_screenshots_s),
                    trailing = { Switch(checked = s.blockScreenshots, onCheckedChange = onBlockScreenshots) },
                    onClick = { onBlockScreenshots(!s.blockScreenshots) }, role = Role.Switch,
                )
            })
            Text(stringResource(R.string.security_recents_note), style = MaterialTheme.typography.bodySmall, color = Zuri.colors.muted, modifier = Modifier.padding(horizontal = 24.dp, vertical = 8.dp))
        }
    }
}

// ---------------- Privacy Center (G11) ----------------

@Composable
fun PrivacyCenterRoute(onBack: () -> Unit, onOpenLedger: () -> Unit = {}, onOpenContextLedger: () -> Unit = {}, viewModel: PrivacyCenterViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { viewModel.refresh() }
    PrivacyCenterContent(state, onBack, onOpenLedger, onOpenContextLedger)
}

@Composable
fun PrivacyCenterContent(state: PrivacyState, onBack: () -> Unit, onOpenLedger: () -> Unit = {}, onOpenContextLedger: () -> Unit = {}) {
    Column(Modifier.fillMaxSize()) {
        DetailTopBar(stringResource(R.string.privacy_title), onBack)
        Column(Modifier.verticalScroll(rememberScrollState())) {
            StorageCard(state.storage)
            SectionHeader(stringResource(R.string.privacy_leaves))
            val access = state.access
            ZuriCard(style = if (access?.hasNetworkPermission == false) CardStyle.Tinted else CardStyle.Plain) {
                Text(
                    when (access?.hasNetworkPermission) { null -> stringResource(R.string.loading); false -> stringResource(R.string.privacy_no_network); true -> stringResource(R.string.privacy_network) },
                    style = MaterialTheme.typography.bodyLarge,
                )
                if (access?.hasNetworkPermission == true) {
                    androidx.compose.material3.TextButton(onClick = onOpenLedger) { Text(stringResource(R.string.privacy_open_ledger)) }
                }
            }
            ZuriListGroup(rows = listOf({
                ZuriListRow(
                    stringResource(R.string.privacy_context_ledger), supporting = stringResource(R.string.privacy_context_ledger_s),
                    leading = { IconChip(Icons.Rounded.Shield) }, trailing = { Chevron() }, onClick = onOpenContextLedger,
                )
            }))
            if (access != null) PermissionsSection(access)
            SectionHeader(stringResource(R.string.privacy_consents))
            val notAvailable = stringResource(R.string.state_not_available)
            ZuriListGroup(rows = listOf(R.string.privacy_p1, R.string.privacy_p3, R.string.privacy_p4, R.string.privacy_p5, R.string.privacy_p6).map { label ->
                @Composable { ZuriListRow(stringResource(label), trailing = { StatusTag(notAvailable) }) }
            })
            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
private fun StorageCard(report: StorageReport?) {
    val context = LocalContext.current
    ZuriCard {
        Text(stringResource(R.string.privacy_stored), style = MaterialTheme.typography.bodySmall, color = Zuri.colors.muted)
        if (report == null) {
            Text(stringResource(R.string.loading), style = MaterialTheme.typography.headlineMedium)
            return@ZuriCard
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(Formatter.formatShortFileSize(context, report.databaseBytes), style = MaterialTheme.typography.headlineLarge, modifier = Modifier.weight(1f))
            if (report.databaseEncryptionVerified) StatusTag(stringResource(R.string.privacy_encrypted), tone = Tone.Ok)
            else StatusTag(stringResource(R.string.privacy_not_verified), tone = Tone.Warn)
        }
        Spacer(Modifier.height(6.dp))
        Text(
            stringResource(R.string.privacy_storage_detail, report.workspaceCount, report.messageCount, report.rawSnapshotCount),
            style = MaterialTheme.typography.bodySmall, color = Zuri.colors.muted,
        )
        if (report.databaseEncryptionVerified) {
            Spacer(Modifier.height(6.dp))
            Text(stringResource(R.string.privacy_storage_explain), style = MaterialTheme.typography.bodyMedium, color = Zuri.colors.muted)
        }
    }
}

@Composable
private fun PermissionsSection(a: DeviceAccessReport) {
    SectionHeader(stringResource(R.string.privacy_permissions))
    @Composable fun onOff(on: Boolean) = StatusTag(stringResource(if (on) R.string.state_on else R.string.state_off), tone = if (on) Tone.Ok else Tone.Neutral)
    ZuriListGroup(rows = listOf(
        { ZuriListRow(stringResource(R.string.privacy_notifications), trailing = { onOff(a.notificationAccessGranted) }) },
        { ZuriListRow(stringResource(R.string.privacy_contacts), trailing = { onOff(a.contactsPermissionGranted) }) },
        { ZuriListRow(stringResource(R.string.privacy_calendar), trailing = { onOff(a.calendarPermissionGranted) }) },
        {
            ZuriListRow(stringResource(R.string.privacy_screen_lock), trailing = {
                StatusTag(stringResource(if (a.deviceLockConfigured) R.string.state_set else R.string.state_not_set), tone = if (a.deviceLockConfigured) Tone.Ok else Tone.Warn)
            })
        },
    ))
}

