package app.zuri.android.feature.models

import android.Manifest
import android.os.Build
import android.text.format.Formatter
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Memory
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.zuri.android.core.ui.components.CardStyle
import app.zuri.android.core.ui.components.DetailTopBar
import app.zuri.android.core.ui.components.IconChip
import app.zuri.android.core.ui.components.SectionHeader
import app.zuri.android.core.ui.components.StatusTag
import app.zuri.android.core.ui.components.Tone
import app.zuri.android.core.ui.components.ZuriCard
import app.zuri.android.core.ui.theme.Zuri
import app.zuri.android.domain.ai.DeviceProfile
import app.zuri.android.domain.ai.FailureReason
import app.zuri.android.domain.ai.FitVerdict
import app.zuri.android.domain.ai.ModelEntry
import app.zuri.android.domain.ai.ModelFit
import app.zuri.android.domain.ai.ModelRole
import app.zuri.android.domain.ai.ModelSpec
import app.zuri.android.domain.ai.ModelState
import app.zuri.android.domain.ai.ModelTier

data class ModelsActions(
    val onBack: () -> Unit = {},
    val onDownload: (ModelSpec) -> Unit = {},
    /** Continue a download the person already agreed to (paused or interrupted): no second confirmation. */
    val onResume: (ModelSpec) -> Unit = {},
    val onPause: (ModelSpec) -> Unit = {},
    val onDelete: (ModelSpec) -> Unit = {},
    val onOpenLedger: () -> Unit = {},
    val onTest: (ModelSpec) -> Unit = {},
)

/** A01 Model library, with the A03 compatibility verdict per model and the A02 download sheet. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ModelsRoute(onBack: () -> Unit, onOpenLedger: () -> Unit, viewModel: ModelsViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var confirm by rememberSaveable { mutableStateOf<String?>(null) }
    var pendingMobile by rememberSaveable { mutableStateOf(false) }
    LifecycleResumeEffect(Unit) {
        viewModel.refreshDevice()
        onPauseOrDispose { }
    }
    // The progress notification needs this on Android 13+; downloading works either way.
    val notifications = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        confirm?.let { viewModel.download(it, pendingMobile) }
        confirm = null
    }
    ModelsContent(state, ModelsActions(onBack, onDownload = { confirm = it.id }, onResume = { viewModel.download(it.id, allowMobileData = false) }, onPause = { viewModel.pause(it.id) }, onDelete = { viewModel.delete(it.id) }, onOpenLedger = onOpenLedger, onTest = { viewModel.test(it.id) }))
    val spec = state.entries.firstOrNull { it.spec.id == confirm }?.spec
    if (spec != null) {
        ModalBottomSheet(onDismissRequest = { confirm = null }) {
            DownloadSheetContent(spec, onStart = { mobile ->
                pendingMobile = mobile
                if (Build.VERSION.SDK_INT >= 33) {
                    notifications.launch(Manifest.permission.POST_NOTIFICATIONS)
                } else {
                    viewModel.download(spec.id, mobile)
                    confirm = null
                }
            })
        }
    }
}

@Composable
private fun bytes(n: Long): String = Formatter.formatShortFileSize(LocalContext.current, n)

@Composable
fun ModelsContent(state: ModelsState, actions: ModelsActions, modifier: Modifier = Modifier) {
    var deleting by rememberSaveable { mutableStateOf<String?>(null) }
    Column(modifier.fillMaxSize()) {
        DetailTopBar(stringResource(R.string.models_title), actions.onBack, subtitle = stringResource(R.string.models_subtitle))
        Column(Modifier.verticalScroll(rememberScrollState()).padding(bottom = 24.dp)) {
            Text(stringResource(R.string.models_intro), style = MaterialTheme.typography.bodyMedium, color = Zuri.colors.muted, modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp))
            TextButton(onClick = actions.onOpenLedger, modifier = Modifier.padding(horizontal = 8.dp)) { Text(stringResource(R.string.open_ledger)) }
            state.device?.let { DeviceCard(it) }
            val chat = state.entries.filter { it.spec.role == ModelRole.CHAT }
            val search = state.entries.filter { it.spec.role == ModelRole.EMBEDDING }
            if (chat.isNotEmpty()) {
                SectionHeader(stringResource(R.string.section_chat))
                chat.forEach { ModelCard(it, state, actions) { deleting = it.spec.id } }
            }
            if (search.isNotEmpty()) {
                SectionHeader(stringResource(R.string.section_search))
                search.forEach { ModelCard(it, state, actions) { deleting = it.spec.id } }
            }
        }
    }
    state.entries.firstOrNull { it.spec.id == deleting }?.let { e ->
        AlertDialog(
            onDismissRequest = { deleting = null },
            title = { Text(stringResource(R.string.delete_title, e.spec.name)) },
            text = { Text(stringResource(R.string.delete_body, bytes(e.spec.sizeBytes))) },
            confirmButton = { TextButton(onClick = { actions.onDelete(e.spec); deleting = null }) { Text(stringResource(R.string.action_delete), color = Zuri.colors.bad) } },
            dismissButton = { TextButton(onClick = { deleting = null }) { Text(stringResource(R.string.cancel)) } },
        )
    }
}

@Composable
private fun DeviceCard(d: DeviceProfile) {
    ZuriCard(style = CardStyle.Tinted) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconChip(Icons.Rounded.Memory, size = 36.dp)
            Spacer(Modifier.width(12.dp))
            Column {
                Text(stringResource(R.string.device_title), style = MaterialTheme.typography.titleMedium)
                Text(stringResource(R.string.device_ram, bytes(d.totalRamBytes)), style = MaterialTheme.typography.bodyMedium, color = Zuri.colors.muted)
                Text(stringResource(R.string.device_storage, bytes(d.freeStorageBytes)), style = MaterialTheme.typography.bodyMedium, color = Zuri.colors.muted)
                d.socModel?.let { Text(stringResource(R.string.device_chip, it), style = MaterialTheme.typography.bodyMedium, color = Zuri.colors.muted) }
            }
        }
    }
}

@Composable
private fun ModelCard(e: ModelEntry, state: ModelsState, actions: ModelsActions, onDelete: () -> Unit) {
    val device = state.device
    val s = e.spec
    val installed = e.state is ModelState.Installed
    ZuriCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconChip(if (s.role == ModelRole.EMBEDDING) Icons.Rounded.Search else Icons.Rounded.AutoAwesome, size = 36.dp)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(s.name, style = MaterialTheme.typography.titleMedium)
                Text(
                    stringResource(R.string.model_meta, bytes(s.sizeBytes), s.parameters, s.licence, s.publisher),
                    style = MaterialTheme.typography.bodySmall, color = Zuri.colors.muted,
                )
            }
            StatusTag(
                stringResource(when (s.tier) { ModelTier.LITE -> R.string.tier_lite; ModelTier.STANDARD -> R.string.tier_standard; ModelTier.HIGH -> R.string.tier_high }),
                tone = if (s.tier == ModelTier.STANDARD) Tone.Context else Tone.Neutral,
            )
        }
        Spacer(Modifier.height(10.dp))
        if (device != null && !installed) {
            val verdict = ModelFit.verdict(s, device)
            val (text, tone) = when (verdict) {
                FitVerdict.GOOD -> stringResource(R.string.fit_good) to Tone.Ok
                FitVerdict.TIGHT -> stringResource(R.string.fit_tight) to Tone.Warn
                FitVerdict.TOO_LARGE_FOR_MEMORY -> stringResource(R.string.fit_memory) to Tone.Bad
                FitVerdict.NOT_ENOUGH_STORAGE -> stringResource(R.string.fit_storage, bytes(ModelFit.storageShortfall(s, device))) to Tone.Warn
                FitVerdict.UNSUPPORTED_DEVICE -> stringResource(R.string.fit_unsupported) to Tone.Bad
            }
            StatusTag(text, tone = tone)
            Spacer(Modifier.height(10.dp))
        }
        StateRow(e, device, actions, onDelete)
        if (installed && s.role == ModelRole.CHAT) TestSection(s, state, actions)
    }
}

@Composable
private fun StateRow(e: ModelEntry, device: DeviceProfile?, actions: ModelsActions, onDelete: () -> Unit) {
    val s = e.spec
    val canDownload = device == null || ModelFit.verdict(s, device).let { it == FitVerdict.GOOD || it == FitVerdict.TIGHT }
    when (val st = e.state) {
        is ModelState.Installed -> Row(verticalAlignment = Alignment.CenterVertically) {
            StatusTag(stringResource(R.string.state_installed, bytes(st.sizeBytes)), tone = Tone.Ok)
            Spacer(Modifier.weight(1f))
            TextButton(onClick = onDelete) { Text(stringResource(R.string.action_delete), color = Zuri.colors.bad) }
        }
        is ModelState.Downloading -> Column {
            LinearProgressIndicator(progress = { if (st.bytesTotal > 0) st.bytesDone.toFloat() / st.bytesTotal else 0f }, modifier = Modifier.fillMaxWidth())
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(stringResource(R.string.state_downloading, bytes(st.bytesDone), bytes(st.bytesTotal)), style = MaterialTheme.typography.bodySmall, color = Zuri.colors.muted, modifier = Modifier.weight(1f))
                TextButton(onClick = { actions.onPause(s) }) { Text(stringResource(R.string.action_pause)) }
            }
        }
        is ModelState.Paused -> Row(verticalAlignment = Alignment.CenterVertically) {
            Text(stringResource(R.string.state_paused, bytes(st.bytesDone), bytes(st.bytesTotal)), style = MaterialTheme.typography.bodySmall, color = Zuri.colors.muted, modifier = Modifier.weight(1f))
            OutlinedButton(onClick = { actions.onResume(s) }, enabled = canDownload) { Text(stringResource(R.string.action_resume)) }
        }
        is ModelState.Queued -> Row(verticalAlignment = Alignment.CenterVertically) {
            Text(stringResource(if (st.waitingForWifi) R.string.state_queued_wifi else R.string.state_queued), style = MaterialTheme.typography.bodySmall, color = Zuri.colors.muted, modifier = Modifier.weight(1f))
            TextButton(onClick = { actions.onPause(s) }) { Text(stringResource(R.string.cancel)) }
        }
        ModelState.Verifying -> Text(stringResource(R.string.state_verifying), style = MaterialTheme.typography.bodySmall, color = Zuri.colors.muted)
        is ModelState.Failed -> Column {
            Text(
                stringResource(when (st.reason) { FailureReason.NETWORK -> R.string.failed_network; FailureReason.CHECKSUM_MISMATCH -> R.string.failed_checksum; FailureReason.NOT_ENOUGH_STORAGE -> R.string.failed_storage; FailureReason.UNKNOWN -> R.string.failed_unknown }),
                style = MaterialTheme.typography.bodySmall, color = Zuri.colors.bad,
            )
            OutlinedButton(onClick = { if (st.reason == FailureReason.NETWORK) actions.onResume(s) else actions.onDownload(s) }, enabled = canDownload) { Text(stringResource(R.string.action_retry)) }
        }
        ModelState.NotInstalled -> Button(onClick = { actions.onDownload(s) }, enabled = canDownload) { Text(stringResource(R.string.action_download)) }
    }
}

/** A03 benchmark: real timings from this phone, with the answer it produced. */
@Composable
private fun TestSection(s: ModelSpec, state: ModelsState, actions: ModelsActions) {
    Spacer(Modifier.height(8.dp))
    val b = state.benchmarks[s.id]
    when {
        state.testing == s.id -> Row(verticalAlignment = Alignment.CenterVertically) {
            CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
            Spacer(Modifier.width(10.dp))
            Text(stringResource(R.string.test_running), style = MaterialTheme.typography.bodySmall, color = Zuri.colors.muted)
        }
        else -> {
            if (state.testFailed == s.id) Text(stringResource(R.string.test_failed), style = MaterialTheme.typography.bodySmall, color = Zuri.colors.bad)
            if (b != null) {
                Text(
                    stringResource(R.string.test_result, "%.1f".format(b.loadSeconds), "%.1f".format(b.timeToFirstTokenSeconds), "%.0f".format(b.decodeTokensPerSecond * 0.75)),
                    style = MaterialTheme.typography.bodyMedium,
                )
                b.structuredOutputWorks?.let { ok ->
                    Text(
                        if (ok) stringResource(R.string.test_structured_ok, "%.1f".format(b.structuredSeconds ?: 0.0)) else stringResource(R.string.test_structured_bad),
                        style = MaterialTheme.typography.bodySmall, color = if (ok) Zuri.colors.ok else Zuri.colors.warn,
                    )
                }
                Text("“" + b.sampleAnswer + "”", style = MaterialTheme.typography.bodySmall, color = Zuri.colors.muted, modifier = Modifier.padding(top = 4.dp))
            }
            OutlinedButton(onClick = { actions.onTest(s) }, enabled = state.testing == null) {
                Text(stringResource(if (b == null) R.string.test_run else R.string.test_again))
            }
        }
    }
}

/** A02: what downloading means, before anything starts. */
@Composable
fun DownloadSheetContent(spec: ModelSpec, onStart: (allowMobileData: Boolean) -> Unit) {
    var mobile by rememberSaveable { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth().padding(horizontal = 22.dp).navigationBarsPadding(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(stringResource(R.string.sheet_title, spec.name), style = MaterialTheme.typography.headlineSmall)
        Text(stringResource(R.string.sheet_size, bytes(spec.sizeBytes)), style = MaterialTheme.typography.bodyMedium)
        Text(stringResource(R.string.sheet_source, "huggingface.co", spec.publisher), style = MaterialTheme.typography.bodyMedium)
        Text(stringResource(R.string.sheet_licence, spec.licence), style = MaterialTheme.typography.bodyMedium)
        Text(stringResource(R.string.sheet_privacy), style = MaterialTheme.typography.bodyMedium, color = Zuri.colors.muted)
        Text(stringResource(R.string.sheet_verify), style = MaterialTheme.typography.bodyMedium, color = Zuri.colors.muted)
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = 4.dp)) {
            Column(Modifier.weight(1f)) {
                Text(stringResource(R.string.sheet_mobile_t), style = MaterialTheme.typography.titleSmall)
                Text(stringResource(R.string.sheet_mobile_s), style = MaterialTheme.typography.bodySmall, color = Zuri.colors.muted)
            }
            Switch(checked = mobile, onCheckedChange = { mobile = it })
        }
        Button(onClick = { onStart(mobile) }, modifier = Modifier.fillMaxWidth().height(52.dp)) { Text(stringResource(R.string.sheet_start)) }
        Spacer(Modifier.height(12.dp))
    }
}
