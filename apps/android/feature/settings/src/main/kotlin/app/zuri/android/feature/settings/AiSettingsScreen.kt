package app.zuri.android.feature.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ArrowDownward
import androidx.compose.material.icons.rounded.ArrowUpward
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Key
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.zuri.android.core.ui.components.DetailTopBar
import app.zuri.android.core.ui.components.SectionHeader
import app.zuri.android.core.ui.theme.Zuri
import app.zuri.android.core.ui.universe.Eyebrow
import app.zuri.android.core.ui.universe.GhostButton
import app.zuri.android.core.ui.universe.UChip
import app.zuri.android.core.ui.universe.glass
import app.zuri.android.domain.cloud.AiJob
import app.zuri.android.domain.cloud.AiSettings
import app.zuri.android.domain.cloud.AiSpend
import app.zuri.android.domain.cloud.CloudAccount
import app.zuri.android.domain.cloud.CloudAccountState
import app.zuri.android.domain.cloud.ModelCheck
import app.zuri.android.domain.cloud.ProviderKey
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

data class AiSettingsState(
    val loading: Boolean = true,
    val connected: Boolean = false,
    val jobs: List<AiJob> = emptyList(),
    val keys: List<ProviderKey> = emptyList(),
    val spend: AiSpend? = null,
    val checks: Map<String, ModelCheck> = emptyMap(),
    val testing: Boolean = false,
    val message: String? = null,
)

@HiltViewModel
class AiSettingsViewModel @Inject constructor(private val ai: AiSettings, private val account: CloudAccount) : ViewModel() {
    private val _state = MutableStateFlow(AiSettingsState())
    val state: StateFlow<AiSettingsState> = _state

    fun load() = viewModelScope.launch {
        if (account.state.value !is CloudAccountState.Connected) { _state.value = AiSettingsState(loading = false, connected = false); return@launch }
        val jobs = runCatching { ai.jobs() }.getOrDefault(emptyList())
        val keys = runCatching { ai.keys() }.getOrDefault(emptyList())
        val spend = runCatching { ai.spend() }.getOrNull()
        _state.value = _state.value.copy(loading = false, connected = true, jobs = jobs, keys = keys, spend = spend)
    }

    fun testAll() = viewModelScope.launch {
        val models = _state.value.jobs.flatMap { it.chain }.distinct()
        if (models.isEmpty()) return@launch
        _state.value = _state.value.copy(testing = true)
        val results = runCatching { ai.test(models) }.getOrDefault(emptyList())
        _state.value = _state.value.copy(testing = false, checks = results.associateBy { it.model })
    }

    /** Moves a model within a job's fallback chain, or removes it; the first model that answers wins. */
    fun move(job: AiJob, index: Int, delta: Int) = update(job) { chain ->
        val to = index + delta
        if (to !in chain.indices) chain else chain.toMutableList().apply { add(to, removeAt(index)) }
    }
    fun remove(job: AiJob, index: Int) = update(job) { chain -> if (chain.size <= 1) chain else chain.toMutableList().apply { removeAt(index) } }
    fun add(job: AiJob, model: String) = update(job) { chain -> if (model.isBlank() || model in chain) chain else chain + model.trim() }
    fun reset(job: AiJob) = viewModelScope.launch { runCatching { ai.resetChain(job.job) }; load() }

    private fun update(job: AiJob, change: (List<String>) -> List<String>) = viewModelScope.launch {
        val next = change(job.chain)
        if (next == job.chain) return@launch
        runCatching { ai.setChain(job.job, next) }.onFailure { _state.value = _state.value.copy(message = "Couldn't save: ${it.message}") }
        load()
    }

    fun saveKey(provider: String, key: String) = viewModelScope.launch {
        runCatching { ai.saveKey(provider, key) }.onFailure { _state.value = _state.value.copy(message = "Couldn't save the key: ${it.message}") }
        val msg = ai.testKey(provider)
        _state.value = _state.value.copy(message = msg)
        load()
    }
    fun deleteKey(provider: String) = viewModelScope.launch { runCatching { ai.deleteKey(provider) }; load() }
    fun testKey(provider: String) = viewModelScope.launch { _state.value = _state.value.copy(message = ai.testKey(provider)) }
    fun clearMessage() { _state.value = _state.value.copy(message = null) }
}

private val PROVIDERS = listOf("anthropic" to "Anthropic (Claude)", "google" to "Google (Gemini)", "openai" to "OpenAI", "deepseek" to "DeepSeek")
private val JOB_LABELS = mapOf(
    "reply_draft" to "Reply drafts", "auto_reply" to "Auto-replies", "chat_summary" to "Chat summaries",
    "analysis" to "Understanding messages", "networking_coach" to "Networking openers",
)

/** Settings → AI: which models do each job (in fallback order), the owner's own keys, and spend (docs/AI_API.md). */
@Composable
fun AiSettingsRoute(onBack: () -> Unit, viewModel: AiSettingsViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { viewModel.load() }
    var keyFor by remember { mutableStateOf<String?>(null) }
    var addTo by remember { mutableStateOf<AiJob?>(null) }
    val u = Zuri.universe
    Column(Modifier.fillMaxSize()) {
        DetailTopBar(stringResource(R.string.ai_title), onBack, subtitle = stringResource(R.string.ai_subtitle))
        Column(Modifier.verticalScroll(rememberScrollState()).padding(bottom = 24.dp)) {
            if (state.loading) LinearProgressIndicator(Modifier.fillMaxWidth().padding(16.dp))
            if (!state.loading && !state.connected) {
                Text(stringResource(R.string.ai_connect_first), style = MaterialTheme.typography.bodyMedium, color = u.inkSoft, modifier = Modifier.padding(20.dp))
                return@Column
            }
            state.message?.let { m ->
                Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp).glass(RoundedCornerShape(18.dp)).padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(m, style = MaterialTheme.typography.bodySmall, color = u.ink, modifier = Modifier.weight(1f))
                    IconButton(onClick = viewModel::clearMessage) { Icon(Icons.Rounded.Close, null, tint = u.inkMuted) }
                }
            }
            state.spend?.let { s ->
                SectionHeader(stringResource(R.string.ai_spend))
                Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Stat("$" + "%.2f".format(s.costUsd), stringResource(R.string.ai_spend_cost), Modifier.weight(1f))
                    Stat("%,d".format(s.requests), stringResource(R.string.ai_spend_requests), Modifier.weight(1f))
                    Stat(if (s.tokens > 1_000_000) "%.1fM".format(s.tokens / 1e6) else "%,d".format(s.tokens), stringResource(R.string.ai_spend_tokens), Modifier.weight(1f))
                }
            }
            SectionHeader(stringResource(R.string.ai_keys))
            Column(Modifier.fillMaxWidth().padding(horizontal = 12.dp).glass(RoundedCornerShape(22.dp)).padding(vertical = 4.dp)) {
                PROVIDERS.forEach { (id, label) ->
                    val k = state.keys.firstOrNull { it.provider == id }
                    Row(Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Rounded.Key, null, tint = if (k != null) u.aurora else u.inkMuted, modifier = Modifier.size(20.dp))
                        Spacer(Modifier.size(10.dp))
                        Column(Modifier.weight(1f)) {
                            Text(label, style = MaterialTheme.typography.titleMedium, color = u.ink)
                            Text(
                                k?.let { listOfNotNull(it.hint?.let { h -> "…$h" }, it.status, it.error).joinToString(" · ") } ?: stringResource(R.string.ai_key_none),
                                style = MaterialTheme.typography.bodySmall, color = if (k?.error != null) MaterialTheme.colorScheme.error else u.inkMuted, maxLines = 2,
                            )
                        }
                        if (k != null) {
                            TextButton(onClick = { viewModel.testKey(id) }) { Text(stringResource(R.string.ai_test)) }
                            TextButton(onClick = { viewModel.deleteKey(id) }) { Text(stringResource(R.string.ai_remove), color = MaterialTheme.colorScheme.error) }
                        } else TextButton(onClick = { keyFor = id }) { Text(stringResource(R.string.ai_add_key)) }
                    }
                }
            }
            Text(stringResource(R.string.ai_keys_hint), style = MaterialTheme.typography.bodySmall, color = u.inkMuted, modifier = Modifier.padding(horizontal = 20.dp, vertical = 6.dp))
            Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 12.dp, top = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                Eyebrow(stringResource(R.string.ai_jobs), Modifier.weight(1f))
                TextButton(onClick = viewModel::testAll, enabled = !state.testing) { Text(stringResource(if (state.testing) R.string.ai_testing else R.string.ai_test_all)) }
            }
            state.jobs.forEach { job -> JobCard(job, state.checks, viewModel, onAdd = { addTo = job }) }
        }
    }
    keyFor?.let { provider ->
        var key by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { keyFor = null },
            title = { Text(stringResource(R.string.ai_add_key_t, PROVIDERS.first { it.first == provider }.second)) },
            text = {
                Column {
                    Text(stringResource(R.string.ai_add_key_b), style = MaterialTheme.typography.bodySmall, color = u.inkSoft)
                    OutlinedTextField(key, { key = it }, singleLine = true, visualTransformation = PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password), modifier = Modifier.fillMaxWidth().padding(top = 8.dp))
                }
            },
            confirmButton = { TextButton(onClick = { viewModel.saveKey(provider, key); keyFor = null }, enabled = key.length > 10) { Text(stringResource(R.string.ai_save)) } },
            dismissButton = { TextButton(onClick = { keyFor = null }) { Text(stringResource(R.string.cloud_cancel)) } },
        )
    }
    addTo?.let { job ->
        var model by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { addTo = null },
            title = { Text(stringResource(R.string.ai_add_model)) },
            text = {
                Column {
                    Text(stringResource(R.string.ai_add_model_b), style = MaterialTheme.typography.bodySmall, color = u.inkSoft)
                    OutlinedTextField(model, { model = it.trim() }, singleLine = true, placeholder = { Text("anthropic/claude-sonnet-5-5") }, modifier = Modifier.fillMaxWidth().padding(top = 8.dp))
                }
            },
            confirmButton = { TextButton(onClick = { viewModel.add(job, model); addTo = null }, enabled = model.contains('/')) { Text(stringResource(R.string.ai_save)) } },
            dismissButton = { TextButton(onClick = { addTo = null }) { Text(stringResource(R.string.cloud_cancel)) } },
        )
    }
}

@Composable
private fun Stat(value: String, label: String, modifier: Modifier) {
    Column(modifier.glass(RoundedCornerShape(20.dp)).padding(12.dp)) {
        Text(value, style = MaterialTheme.typography.titleLarge, color = Zuri.universe.ink, maxLines = 1)
        Text(label, style = MaterialTheme.typography.labelSmall, color = Zuri.universe.inkMuted)
    }
}

@Composable
private fun JobCard(job: AiJob, checks: Map<String, ModelCheck>, vm: AiSettingsViewModel, onAdd: () -> Unit) {
    val u = Zuri.universe
    Column(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 5.dp).glass(RoundedCornerShape(22.dp)).padding(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(JOB_LABELS[job.job] ?: job.job, style = MaterialTheme.typography.titleMedium, color = u.ink, modifier = Modifier.weight(1f))
            if (job.isDefault) UChip(stringResource(R.string.ai_default), u.inkMuted) else TextButton(onClick = { vm.reset(job) }) { Text(stringResource(R.string.ai_reset)) }
        }
        job.chain.forEachIndexed { i, model ->
            val check = checks[model]
            Row(Modifier.fillMaxWidth().heightIn(min = 44.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("${i + 1}", style = MaterialTheme.typography.labelLarge, color = u.inkMuted, modifier = Modifier.padding(end = 8.dp))
                Column(Modifier.weight(1f)) {
                    Text(model.substringAfter('/'), style = MaterialTheme.typography.bodyMedium, color = u.ink, maxLines = 1)
                    if (check != null) Text(
                        if (check.ok) stringResource(R.string.ai_check_ok, check.ms ?: 0, if (check.ownKey) stringResource(R.string.ai_own_key) else stringResource(R.string.ai_zuri_key))
                        else check.error ?: stringResource(R.string.ai_check_failed),
                        style = MaterialTheme.typography.labelSmall, color = if (check.ok) u.aurora else u.ember,
                    )
                }
                IconButton(onClick = { vm.move(job, i, -1) }, enabled = i > 0) { Icon(Icons.Rounded.ArrowUpward, stringResource(R.string.ai_up), tint = u.inkMuted) }
                IconButton(onClick = { vm.move(job, i, 1) }, enabled = i < job.chain.lastIndex) { Icon(Icons.Rounded.ArrowDownward, stringResource(R.string.ai_down), tint = u.inkMuted) }
                IconButton(onClick = { vm.remove(job, i) }, enabled = job.chain.size > 1) { Icon(Icons.Rounded.Close, stringResource(R.string.ai_remove), tint = u.inkMuted) }
            }
        }
        Text(stringResource(R.string.ai_add_model), style = MaterialTheme.typography.labelLarge, color = u.ion,
            modifier = Modifier.clip(RoundedCornerShape(50)).clickable(onClick = onAdd).padding(horizontal = 8.dp, vertical = 10.dp))
    }
}

