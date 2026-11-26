package app.zuri.android.feature.settings

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.rounded.Badge
import androidx.compose.material.icons.rounded.Description
import androidx.compose.material.icons.rounded.Hub
import androidx.compose.material.icons.rounded.Lightbulb
import androidx.compose.material.icons.rounded.Memory
import androidx.compose.material.icons.rounded.Sensors
import androidx.compose.material.icons.rounded.Shield
import androidx.compose.material.icons.rounded.Storefront
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.zuri.android.core.ui.capture.label
import app.zuri.android.core.ui.components.CardStyle
import app.zuri.android.core.ui.components.DetailTopBar
import app.zuri.android.core.ui.components.EmptyState
import app.zuri.android.core.ui.components.IconChip
import app.zuri.android.core.ui.components.SectionHeader
import app.zuri.android.core.ui.components.Tone
import app.zuri.android.core.ui.components.ZuriCard
import app.zuri.android.core.ui.components.ZuriListGroup
import app.zuri.android.core.ui.components.ZuriListRow
import app.zuri.android.core.ui.theme.Zuri
import app.zuri.android.domain.capture.SourceKind
import app.zuri.android.domain.context.ActiveContextProvider
import app.zuri.android.domain.context.ContextLedger
import app.zuri.android.domain.context.ContextWidening
import app.zuri.android.domain.settings.AppPreferencesRepository
import app.zuri.android.domain.workspace.BrandProfile
import app.zuri.android.domain.workspace.Workspace
import app.zuri.android.domain.workspace.WorkspaceId
import app.zuri.android.domain.workspace.WorkspaceKind
import app.zuri.android.domain.workspace.WorkspaceNames
import app.zuri.android.domain.workspace.WorkspaceRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import java.text.DateFormat
import java.util.Date
import javax.inject.Inject
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class WorkspacesState(
    val loading: Boolean = true,
    val workspaces: List<Workspace> = emptyList(),
    val active: Workspace? = null,
    val rules: Map<SourceKind, WorkspaceId> = emptyMap(),
)

@HiltViewModel
class WorkspacesViewModel @Inject constructor(
    private val repo: WorkspaceRepository,
    private val prefs: AppPreferencesRepository,
    context: ActiveContextProvider,
    ledger: ContextLedger,
) : ViewModel() {
    val state: StateFlow<WorkspacesState> = combine(repo.observeAll(), repo.observeRules(), context.active) { all, rules, ctx ->
        WorkspacesState(false, all, ctx?.primary, rules)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), WorkspacesState())

    val ledger: StateFlow<List<ContextWidening>?> = ledger.observe().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    fun rename(id: WorkspaceId, name: String) = viewModelScope.launch { runCatching { repo.rename(id, name) } }
    fun saveBrand(id: WorkspaceId, brand: BrandProfile) = viewModelScope.launch { repo.updateBrand(id, brand) }
    fun setRule(source: SourceKind, workspace: WorkspaceId?) = viewModelScope.launch { repo.setRule(source, workspace) }

    fun delete(id: WorkspaceId, onDone: () -> Unit) = viewModelScope.launch {
        val personal = repo.ensurePersonal()
        if (state.value.active?.id == id || prefs.preferences.first().hybridWorkspaceIds.contains(id)) prefs.setActiveWorkspace(personal.id)
        repo.deleteBusiness(id)
        onDone()
    }
}

/** B02 Studio (M5 shell): the business workspace's home until Business Studio (M10) fills it in. */
@Composable
fun StudioRoute(
    onOpenWorkspace: (WorkspaceId) -> Unit,
    onOpenMemory: () -> Unit,
    onOpenModels: () -> Unit,
    onOpenPrivacy: () -> Unit,
    onOpenSources: () -> Unit,
    vm: WorkspacesViewModel = hiltViewModel(),
) {
    val state by vm.state.collectAsStateWithLifecycle()
    val ws = state.active ?: return
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        Text(stringResource(R.string.studio_title), style = MaterialTheme.typography.headlineLarge, modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp))
        ZuriCard(style = CardStyle.Tinted, onClick = { onOpenWorkspace(ws.id) }) {
            Text(ws.brand.displayName ?: ws.name, style = MaterialTheme.typography.titleLarge)
            val line = listOfNotNull(ws.brand.phone, ws.brand.email, ws.brand.address).joinToString(" · ")
            Text(
                line.ifEmpty { stringResource(R.string.studio_brand_empty) },
                style = MaterialTheme.typography.bodyMedium, color = Zuri.colors.muted,
            )
            TextButton(onClick = { onOpenWorkspace(ws.id) }) { Text(stringResource(R.string.studio_brand_edit)) }
        }
        val sourcesHere = state.rules.filterValues { it == ws.id }.keys
        SectionHeader(stringResource(R.string.studio_workspace))
        ZuriListGroup(rows = listOf(
            {
                ZuriListRow(
                    stringResource(R.string.studio_rules),
                    supporting = if (sourcesHere.isEmpty()) stringResource(R.string.studio_rules_none) else sourcesHere.map { stringResource(it.label()) }.joinToString(", "),
                    leading = { IconChip(Icons.Rounded.Hub) }, trailing = { Chev() }, onClick = { onOpenWorkspace(ws.id) },
                )
            },
            { ZuriListRow(stringResource(R.string.studio_memory), supporting = stringResource(R.string.studio_memory_s), leading = { IconChip(Icons.Rounded.Lightbulb) }, trailing = { Chev() }, onClick = onOpenMemory) },
        ))
        SectionHeader(stringResource(R.string.studio_phone))
        ZuriListGroup(rows = listOf(
            { ZuriListRow(stringResource(R.string.studio_models), leading = { IconChip(Icons.Rounded.Memory, tone = Tone.Neutral) }, trailing = { Chev() }, onClick = onOpenModels) },
            { ZuriListRow(stringResource(R.string.studio_privacy), leading = { IconChip(Icons.Rounded.Shield, tone = Tone.Neutral) }, trailing = { Chev() }, onClick = onOpenPrivacy) },
            { ZuriListRow(stringResource(R.string.studio_sources), leading = { IconChip(Icons.Rounded.Sensors, tone = Tone.Neutral) }, trailing = { Chev() }, onClick = onOpenSources) },
        ))
        ZuriCard(style = CardStyle.Flat) {
            Text(stringResource(R.string.studio_next), style = MaterialTheme.typography.bodyMedium, color = Zuri.colors.muted)
        }
        Spacer(Modifier.height(24.dp))
    }
}

/** D01 Documents (M5 shell): honest about what's coming, and whether the brand profile is ready. */
@Composable
fun DocumentsRoute(onOpenWorkspace: (WorkspaceId) -> Unit, vm: WorkspacesViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val ws = state.active ?: return
    Column(Modifier.fillMaxSize()) {
        Text(stringResource(R.string.docs_title), style = MaterialTheme.typography.headlineLarge, modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp))
        EmptyState(
            Icons.Rounded.Description, stringResource(R.string.docs_empty_t),
            stringResource(if (ws.brand.isEmpty) R.string.docs_empty_b_nobrand else R.string.docs_empty_b_brand, ws.name),
            Modifier.padding(top = 16.dp),
            action = if (ws.brand.isEmpty) { { TextButton(onClick = { onOpenWorkspace(ws.id) }) { Text(stringResource(R.string.studio_brand_edit)) } } } else null,
        )
    }
}

@Composable
private fun Chev() = Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, null, tint = Zuri.colors.muted)

/** Workspace settings: name, brand profile, which apps' new chats come here, and deletion. */
@Composable
fun WorkspaceSettingsRoute(id: String, onBack: () -> Unit, vm: WorkspacesViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val ws = state.workspaces.firstOrNull { it.id.value == id }
    LaunchedEffect(state.loading, ws == null) { if (!state.loading && ws == null) onBack() }
    if (ws == null) return
    var name by rememberSaveable(ws.id.value) { mutableStateOf(ws.name) }
    var b by rememberSaveable(ws.id.value, stateSaver = BrandSaver) { mutableStateOf(ws.brand) }
    var confirmDelete by rememberSaveable { mutableStateOf(false) }
    Column(Modifier.fillMaxSize()) {
        DetailTopBar(ws.name, onBack, subtitle = stringResource(if (ws.kind == WorkspaceKind.PERSONAL) R.string.ws_personal else R.string.ws_business))
        Column(Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 16.dp)) {
            OutlinedTextField(
                value = name, onValueChange = { name = it.take(WorkspaceNames.MAX_LENGTH) }, label = { Text(stringResource(R.string.ws_name)) },
                singleLine = true, modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
            )
            TextButton(onClick = { vm.rename(ws.id, name) }, enabled = WorkspaceNames.normalize(name) != null && name.trim() != ws.name) { Text(stringResource(R.string.ws_rename)) }

            if (ws.kind == WorkspaceKind.BUSINESS) {
                SectionHeader(stringResource(R.string.ws_brand), modifier = Modifier.padding(horizontal = 0.dp))
                Text(stringResource(R.string.ws_brand_note), style = MaterialTheme.typography.bodySmall, color = Zuri.colors.muted)
                Field(R.string.ws_brand_name, b.displayName) { b = b.copy(displayName = it) }
                Field(R.string.ws_brand_phone, b.phone, KeyboardType.Phone) { b = b.copy(phone = it) }
                Field(R.string.ws_brand_email, b.email, KeyboardType.Email) { b = b.copy(email = it) }
                Field(R.string.ws_brand_address, b.address) { b = b.copy(address = it) }
                Field(R.string.ws_brand_website, b.website, KeyboardType.Uri) { b = b.copy(website = it) }
                Field(R.string.ws_brand_tax, b.taxNumber) { b = b.copy(taxNumber = it) }
                Field(R.string.ws_brand_terms, b.paymentTerms) { b = b.copy(paymentTerms = it) }
                Field(R.string.ws_brand_bank, b.bankDetails) { b = b.copy(bankDetails = it) }
                Text(stringResource(R.string.ws_brand_bank_note), style = MaterialTheme.typography.labelSmall, color = Zuri.colors.faint)
                TextButton(onClick = { vm.saveBrand(ws.id, b) }, enabled = b != ws.brand) { Text(stringResource(R.string.ws_brand_save)) }

                SectionHeader(stringResource(R.string.ws_rules))
                Text(stringResource(R.string.ws_rules_note), style = MaterialTheme.typography.bodySmall, color = Zuri.colors.muted)
                SourceKind.entries.forEach { kind ->
                    val here = state.rules[kind] == ws.id
                    val elsewhere = state.rules[kind]?.takeIf { it != ws.id }?.let { other -> state.workspaces.firstOrNull { it.id == other }?.name }
                    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(stringResource(kind.label()), style = MaterialTheme.typography.bodyLarge)
                            if (elsewhere != null) Text(stringResource(R.string.ws_rules_elsewhere, elsewhere), style = MaterialTheme.typography.labelSmall, color = Zuri.colors.muted)
                        }
                        Switch(checked = here, onCheckedChange = { on -> vm.setRule(kind, if (on) ws.id else null) })
                    }
                }

                SectionHeader(stringResource(R.string.ws_danger))
                TextButton(onClick = { confirmDelete = true }) { Text(stringResource(R.string.ws_delete), color = Zuri.colors.bad) }
            }
            Spacer(Modifier.height(24.dp))
        }
    }
    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text(stringResource(R.string.ws_delete_title, ws.name)) },
            text = { Text(stringResource(R.string.ws_delete_body)) },
            confirmButton = { TextButton(onClick = { confirmDelete = false; vm.delete(ws.id, onBack) }) { Text(stringResource(R.string.ws_delete), color = Zuri.colors.bad) } },
            dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text(stringResource(R.string.cancel)) } },
        )
    }
}

private val BrandSaver = androidx.compose.runtime.saveable.listSaver<BrandProfile, String?>(
    save = { listOf(it.displayName, it.phone, it.email, it.address, it.website, it.taxNumber, it.bankDetails, it.paymentTerms) },
    restore = { BrandProfile(it[0], it[1], it[2], it[3], it[4], it[5], it[6], it[7]) },
)

@Composable
private fun Field(label: Int, value: String?, type: KeyboardType = KeyboardType.Text, onChange: (String) -> Unit) {
    OutlinedTextField(
        value = value.orEmpty(), onValueChange = { onChange(it.take(500)) }, label = { Text(stringResource(label)) },
        keyboardOptions = KeyboardOptions(keyboardType = type), modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
    )
}

/** Every time the owner mixed contexts (widened Ask, or asked in Hybrid view). No content is kept. */
@Composable
fun ContextLedgerRoute(onBack: () -> Unit, vm: WorkspacesViewModel = hiltViewModel()) {
    val rows by vm.ledger.collectAsStateWithLifecycle()
    val fmt = DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT)
    Column(Modifier.fillMaxSize()) {
        DetailTopBar(stringResource(R.string.cledger_title), onBack, subtitle = stringResource(R.string.cledger_sub))
        when {
            rows == null -> Unit
            rows!!.isEmpty() -> EmptyState(Icons.Rounded.Badge, stringResource(R.string.cledger_empty_t), stringResource(R.string.cledger_empty_b), Modifier.padding(top = 16.dp))
            else -> LazyColumn {
                items(rows!!) { r ->
                    ZuriListRow(
                        title = stringResource(R.string.cledger_row, r.from.joinToString(", "), r.added.joinToString(", ")),
                        supporting = fmt.format(Date(r.atMillis)) + " · " + r.purpose.name.lowercase().replace('_', ' '),
                        leading = { IconChip(Icons.Rounded.Storefront, tone = Tone.Warn, size = 36.dp) },
                    )
                    HorizontalDivider(color = Zuri.colors.line)
                }
            }
        }
    }
}


/** All workspaces, each opening its settings. */
@Composable
fun WorkspacesRoute(onBack: () -> Unit, onOpen: (WorkspaceId) -> Unit, vm: WorkspacesViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    Column(Modifier.fillMaxSize()) {
        DetailTopBar(stringResource(R.string.settings_workspaces), onBack)
        ZuriListGroup(rows = state.workspaces.map { ws ->
            @Composable {
                ZuriListRow(
                    ws.name,
                    supporting = stringResource(if (ws.kind == WorkspaceKind.PERSONAL) R.string.ws_personal else R.string.ws_business),
                    leading = { IconChip(if (ws.kind == WorkspaceKind.PERSONAL) Icons.Rounded.Badge else Icons.Rounded.Storefront) },
                    trailing = { Chev() }, onClick = { onOpen(ws.id) },
                )
            }
        })
    }
}
