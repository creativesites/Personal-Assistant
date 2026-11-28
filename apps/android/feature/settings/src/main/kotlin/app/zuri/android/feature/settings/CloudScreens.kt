package app.zuri.android.feature.settings

import android.text.format.DateUtils
import android.text.format.Formatter
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Cloud
import androidx.compose.material.icons.rounded.CloudSync
import androidx.compose.material.icons.rounded.Image
import androidx.compose.material.icons.rounded.Wifi
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.zuri.android.core.ui.components.DetailTopBar
import app.zuri.android.core.ui.components.IconChip
import app.zuri.android.core.ui.components.SectionHeader
import app.zuri.android.core.ui.components.StatusTag
import app.zuri.android.core.ui.components.Tone
import app.zuri.android.core.ui.components.ZuriCard
import app.zuri.android.core.ui.components.ZuriListGroup
import app.zuri.android.core.ui.components.ZuriListRow
import app.zuri.android.core.ui.theme.Zuri
import app.zuri.android.domain.cloud.CloudAccount
import app.zuri.android.domain.cloud.CloudAccountState
import app.zuri.android.domain.cloud.CloudSync
import app.zuri.android.domain.cloud.CloudSyncStatus
import app.zuri.android.domain.cloud.SignInStep
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

@HiltViewModel
class CloudViewModel @Inject constructor(private val account: CloudAccount, private val sync: CloudSync) : ViewModel() {
    val state: StateFlow<CloudAccountState> = account.state
    val status: StateFlow<CloudSyncStatus?> = sync.status.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    data class Form(val busy: Boolean = false, val codeSentTo: String? = null, val error: String? = null)
    val form = MutableStateFlow(Form())

    fun google() = run { account.signInWithGoogle() }
    fun sendCode(email: String) = run(email) { account.sendEmailCode(email) }
    fun verify(code: String) = run { account.verifyEmailCode(code) }

    private fun run(email: String? = null, step: suspend () -> SignInStep) {
        if (form.value.busy) return
        form.value = form.value.copy(busy = true, error = null)
        viewModelScope.launch {
            form.value = when (val r = step()) {
                SignInStep.Done -> Form()
                SignInStep.CodeSent -> Form(codeSentTo = email ?: form.value.codeSentTo)
                is SignInStep.Failed -> form.value.copy(busy = false, error = r.message)
            }
        }
    }

    fun setSync(on: Boolean) = viewModelScope.launch { sync.setEnabled(on) }
    fun syncNow() = sync.syncNow()
    fun setWifiOnly(on: Boolean) = viewModelScope.launch { sync.setMediaWifiOnly(on) }
    fun setUpload(on: Boolean) = viewModelScope.launch { sync.setUploadCaptures(on) }
    fun clearMedia() = viewModelScope.launch { sync.clearMediaCache() }
    fun disconnect(remove: Boolean) = viewModelScope.launch { account.disconnect(remove) }
}

/** Settings → Zuri cloud (M7): connect this phone, then the chat sync controls (D-21). */
@Composable
fun CloudRoute(onBack: () -> Unit, viewModel: CloudViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val status by viewModel.status.collectAsStateWithLifecycle()
    val form by viewModel.form.collectAsStateWithLifecycle()
    CloudContent(
        state, status, form, onBack, viewModel::google, viewModel::sendCode, viewModel::verify,
        { viewModel.setSync(it) }, viewModel::syncNow, { viewModel.setWifiOnly(it) }, { viewModel.clearMedia() }, { viewModel.disconnect(it) },
        onUpload = { viewModel.setUpload(it) },
    )
}

@Composable
fun CloudContent(
    state: CloudAccountState, status: CloudSyncStatus?, form: CloudViewModel.Form, onBack: () -> Unit,
    onGoogle: () -> Unit, onSendCode: (String) -> Unit, onVerify: (String) -> Unit,
    onSync: (Boolean) -> Unit, onSyncNow: () -> Unit, onWifiOnly: (Boolean) -> Unit, onClearMedia: () -> Unit, onDisconnect: (Boolean) -> Unit,
    onUpload: (Boolean) -> Unit = {},
) {
    Column(Modifier.fillMaxSize()) {
        DetailTopBar(stringResource(R.string.cloud_title), onBack, subtitle = stringResource(R.string.cloud_subtitle))
        Column(Modifier.verticalScroll(rememberScrollState()).padding(bottom = 24.dp)) {
            when (state) {
                is CloudAccountState.Connected -> Connected(state, status, onSync, onSyncNow, onWifiOnly, onClearMedia, onDisconnect, onUpload)
                CloudAccountState.Connecting -> ZuriCard { Text(stringResource(R.string.cloud_connecting)); Spacer(Modifier.height(10.dp)); LinearProgressIndicator(Modifier.fillMaxWidth()) }
                is CloudAccountState.NeedsSignIn -> {
                    ZuriCard { StatusTag(stringResource(R.string.cloud_needs_sign_in), tone = Tone.Warn); Spacer(Modifier.height(6.dp)); Text(state.reason, style = MaterialTheme.typography.bodySmall, color = Zuri.colors.muted) }
                    SignIn(form, onGoogle, onSendCode, onVerify)
                }
                CloudAccountState.NotConnected -> SignIn(form, onGoogle, onSendCode, onVerify)
            }
        }
    }
}

@Composable
private fun SignIn(form: CloudViewModel.Form, onGoogle: () -> Unit, onSendCode: (String) -> Unit, onVerify: (String) -> Unit) {
    var email by rememberSaveable { mutableStateOf("") }
    var code by rememberSaveable { mutableStateOf("") }
    ZuriCard {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            IconChip(Icons.Rounded.Cloud)
            Text(stringResource(R.string.cloud_title), style = MaterialTheme.typography.titleMedium)
        }
        Spacer(Modifier.height(10.dp))
        Text(stringResource(R.string.cloud_explainer), style = MaterialTheme.typography.bodyMedium, color = Zuri.colors.muted)
        Spacer(Modifier.height(16.dp))
        Button(onClick = onGoogle, enabled = !form.busy, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(stringResource(R.string.cloud_google)) }
        Spacer(Modifier.height(16.dp))
        if (form.codeSentTo == null) {
            OutlinedTextField(email, { email = it }, label = { Text(stringResource(R.string.cloud_email)) }, singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email), modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(8.dp))
            OutlinedButton(onClick = { onSendCode(email) }, enabled = !form.busy && email.contains('@'), modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
                Text(stringResource(R.string.cloud_send_code))
            }
        } else {
            Text(stringResource(R.string.cloud_code_sent, form.codeSentTo), style = MaterialTheme.typography.bodySmall)
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(code, { code = it.filter(Char::isDigit).take(6) }, label = { Text(stringResource(R.string.cloud_code)) }, singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword), modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(8.dp))
            Button(onClick = { onVerify(code) }, enabled = !form.busy && code.length == 6, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(stringResource(R.string.cloud_verify)) }
        }
        if (form.busy) { Spacer(Modifier.height(12.dp)); LinearProgressIndicator(Modifier.fillMaxWidth()) }
        form.error?.let { Spacer(Modifier.height(10.dp)); Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
    }
}

@Composable
private fun Connected(
    state: CloudAccountState.Connected, status: CloudSyncStatus?, onSync: (Boolean) -> Unit, onSyncNow: () -> Unit,
    onWifiOnly: (Boolean) -> Unit, onClearMedia: () -> Unit, onDisconnect: (Boolean) -> Unit,
    onUpload: (Boolean) -> Unit = {},
) {
    val ctx = LocalContext.current
    var confirm by remember { mutableStateOf(false) }
    ZuriCard {
        Text(stringResource(R.string.cloud_connected_as), style = MaterialTheme.typography.labelMedium, color = Zuri.colors.muted)
        Text(state.name ?: state.email ?: "—", style = MaterialTheme.typography.titleMedium)
        state.email?.takeIf { state.name != null }?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = Zuri.colors.muted) }
    }
    SectionHeader(stringResource(R.string.cloud_sync))
    ZuriCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconChip(Icons.Rounded.CloudSync)
            Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                Text(stringResource(R.string.cloud_sync), style = MaterialTheme.typography.titleMedium)
                Text(stringResource(R.string.cloud_sync_s), style = MaterialTheme.typography.bodySmall, color = Zuri.colors.muted)
            }
            Switch(checked = status?.enabled == true, onCheckedChange = onSync)
        }
        if (status != null) {
            Spacer(Modifier.height(12.dp))
            val p = status.progress
            when {
                p?.total != null -> {
                    Text(stringResource(R.string.cloud_importing, "%,d".format(p.applied), "%,d".format(p.total)), style = MaterialTheme.typography.bodySmall)
                    Spacer(Modifier.height(6.dp))
                    LinearProgressIndicator(progress = { (p.applied.toFloat() / p.total!!.coerceAtLeast(1)).coerceIn(0f, 1f) }, modifier = Modifier.fillMaxWidth())
                }
                status.running -> { Text(stringResource(R.string.cloud_syncing), style = MaterialTheme.typography.bodySmall); Spacer(Modifier.height(6.dp)); LinearProgressIndicator(Modifier.fillMaxWidth()) }
                else -> Text(
                    status.lastSuccessAt?.let { stringResource(R.string.cloud_last_sync, DateUtils.getRelativeTimeSpanString(it).toString()) } ?: stringResource(R.string.cloud_never_synced),
                    style = MaterialTheme.typography.bodySmall, color = Zuri.colors.muted,
                )
            }
            Text(stringResource(R.string.cloud_messages, "%,d".format(status.cloudMessages)), style = MaterialTheme.typography.bodySmall, color = Zuri.colors.muted)
            status.lastError?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error) }
            Spacer(Modifier.height(8.dp))
            OutlinedButton(onClick = onSyncNow, enabled = status.enabled && !status.running, modifier = Modifier.heightIn(min = 44.dp)) { Text(stringResource(R.string.cloud_sync_now)) }
        }
    }
    SectionHeader(stringResource(R.string.cloud_upload_h))
    ZuriListGroup(rows = listOf({
        ZuriListRow(
            stringResource(R.string.cloud_upload), supporting = stringResource(R.string.cloud_upload_s),
            leading = { IconChip(Icons.Rounded.CloudSync, tone = Tone.Neutral) },
            trailing = { Switch(checked = status?.uploadCaptures ?: false, onCheckedChange = onUpload) },
        )
    }))
    SectionHeader(stringResource(R.string.cloud_media))
    ZuriListGroup(rows = listOf(
        {
            ZuriListRow(
                stringResource(R.string.cloud_wifi_only), supporting = stringResource(R.string.cloud_wifi_only_s),
                leading = { IconChip(Icons.Rounded.Wifi) },
                trailing = { Switch(checked = status?.mediaWifiOnly ?: true, onCheckedChange = onWifiOnly) },
            )
        },
        {
            ZuriListRow(
                stringResource(R.string.cloud_cache, Formatter.formatShortFileSize(ctx, status?.mediaCacheBytes ?: 0)),
                leading = { IconChip(Icons.Rounded.Image, tone = Tone.Neutral) },
                trailing = { TextButton(onClick = onClearMedia) { Text(stringResource(R.string.cloud_clear_cache)) } },
            )
        },
    ))
    Spacer(Modifier.height(16.dp))
    TextButton(onClick = { confirm = true }, modifier = Modifier.padding(horizontal = 12.dp).heightIn(min = 44.dp)) {
        Text(stringResource(R.string.cloud_disconnect), color = MaterialTheme.colorScheme.error)
    }
    if (confirm) {
        AlertDialog(
            onDismissRequest = { confirm = false },
            title = { Text(stringResource(R.string.cloud_disconnect_t)) },
            text = {
                Column {
                    Text(stringResource(R.string.cloud_disconnect_b))
                    Spacer(Modifier.height(12.dp))
                    Button(onClick = { confirm = false; onDisconnect(false) }, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.cloud_keep)) }
                    TextButton(onClick = { confirm = false; onDisconnect(true) }, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.cloud_remove), color = MaterialTheme.colorScheme.error) }
                }
            },
            confirmButton = {},
            dismissButton = { TextButton(onClick = { confirm = false }) { Text(stringResource(R.string.cloud_cancel)) } },
        )
    }
}
