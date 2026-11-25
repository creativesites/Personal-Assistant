package app.zuri.android.feature.settings

import android.text.format.Formatter
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CloudDownload
import androidx.compose.material.icons.rounded.Shield
import androidx.compose.material3.HorizontalDivider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.zuri.android.core.ui.components.DetailTopBar
import app.zuri.android.core.ui.components.EmptyState
import app.zuri.android.core.ui.components.IconChip
import app.zuri.android.core.ui.components.Tone
import app.zuri.android.core.ui.components.ZuriListRow
import app.zuri.android.core.ui.theme.Zuri
import app.zuri.android.domain.privacy.EgressLedger
import app.zuri.android.domain.privacy.EgressPurpose
import app.zuri.android.domain.privacy.EgressRecord
import dagger.hilt.android.lifecycle.HiltViewModel
import java.text.DateFormat
import java.util.Date
import javax.inject.Inject
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

@HiltViewModel
class LedgerViewModel @Inject constructor(ledger: EgressLedger) : ViewModel() {
    val records: StateFlow<List<EgressRecord>?> = ledger.records.map<List<EgressRecord>, List<EgressRecord>?> { it }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)
}

/** A08 What leaves my phone: the egress ledger, exactly as recorded. */
@Composable
fun LedgerRoute(onBack: () -> Unit, viewModel: LedgerViewModel = hiltViewModel()) {
    val records by viewModel.records.collectAsStateWithLifecycle()
    LedgerContent(records, onBack)
}

@Composable
fun LedgerContent(records: List<EgressRecord>?, onBack: () -> Unit, format: (Long) -> String = { DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT).format(Date(it)) }) {
    val ctx = LocalContext.current
    Column(Modifier.fillMaxSize()) {
        DetailTopBar(stringResource(R.string.ledger_title), onBack, subtitle = stringResource(R.string.ledger_subtitle))
        when {
            records == null -> Unit
            records.isEmpty() -> EmptyState(Icons.Rounded.Shield, stringResource(R.string.ledger_empty_t), stringResource(R.string.ledger_empty_b), Modifier.padding(top = 16.dp))
            else -> LazyColumn {
                items(records, key = { it.id }) { r ->
                    ZuriListRow(
                        title = when (r.purpose) { EgressPurpose.MODEL_DOWNLOAD -> stringResource(R.string.ledger_model_download) } + " · " + r.detail,
                        supporting = stringResource(R.string.ledger_detail, format(r.atMillis), r.host, Formatter.formatShortFileSize(ctx, r.bytesReceived)),
                        leading = { IconChip(Icons.Rounded.CloudDownload, tone = Tone.Neutral, size = 36.dp) },
                    )
                    HorizontalDivider(color = Zuri.colors.line)
                }
            }
        }
    }
}
