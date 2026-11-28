package app.zuri.android.feature.life

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CalendarMonth
import androidx.compose.material.icons.rounded.Event
import androidx.compose.material.icons.rounded.TaskAlt
import androidx.compose.material.icons.rounded.WavingHand
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.zuri.android.core.ui.components.EmptyState
import app.zuri.android.core.ui.theme.Zuri
import app.zuri.android.core.ui.theme.initialOf
import app.zuri.android.core.ui.theme.skinFor
import app.zuri.android.core.ui.universe.Eyebrow
import app.zuri.android.core.ui.universe.GhostButton
import app.zuri.android.core.ui.universe.Orb
import app.zuri.android.core.ui.universe.glass
import app.zuri.android.core.ui.universe.rise
import app.zuri.android.core.ui.universe.tiltClickable
import app.zuri.android.domain.inbox.ConversationId
import app.zuri.android.domain.people.Encounter

/**
 * Calendar as the owner's trajectory (Universe metaphor): the next 14 days of encounters — events
 * and promises Zuri read in their chats, check-ins their rhythm suggests, and (with permission)
 * their phone's own calendar, read-only.
 */
@Composable
fun TrajectoryRoute(onBack: () -> Unit, onOpenConversation: (ConversationId) -> Unit, viewModel: TrajectoryViewModel = hiltViewModel()) {
    val list by viewModel.encounters.collectAsStateWithLifecycle()
    val ctx = LocalContext.current
    val hasAccess = ctx.checkSelfPermission(Manifest.permission.READ_CALENDAR) == android.content.pm.PackageManager.PERMISSION_GRANTED
    val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted -> if (granted) viewModel.reload() }
    TrajectoryContent(list, hasAccess, onBack, onOpenConversation, onConnectCalendar = { ask.launch(Manifest.permission.READ_CALENDAR) })
}

@Composable
fun TrajectoryContent(
    list: List<Encounter>?, calendarAccess: Boolean, onBack: () -> Unit,
    onOpenConversation: (ConversationId) -> Unit = {}, onConnectCalendar: () -> Unit = {},
) {
    val u = Zuri.universe
    val today = stringResource(R.string.life_today); val tomorrow = stringResource(R.string.life_tomorrow); val yesterday = stringResource(R.string.life_yesterday)
    Column(Modifier.fillMaxSize()) {
        LifeHeader(stringResource(R.string.traj_eyebrow), stringResource(R.string.traj_title), onBack)
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
            if (!calendarAccess) item("connect") {
                Column(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 8.dp).glass(RoundedCornerShape(22.dp)).padding(16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Rounded.CalendarMonth, null, tint = u.nebulaSoft)
                        Spacer(Modifier.size(8.dp))
                        Text(stringResource(R.string.traj_connect_t), style = MaterialTheme.typography.titleMedium, color = u.ink)
                    }
                    Text(stringResource(R.string.traj_connect_b), style = MaterialTheme.typography.bodySmall, color = u.inkSoft, modifier = Modifier.padding(vertical = 8.dp))
                    GhostButton(stringResource(R.string.traj_connect_cta), onConnectCalendar)
                }
            }
            if (list != null && list.isEmpty()) item("empty") {
                EmptyState(Icons.Rounded.Event, stringResource(R.string.traj_empty_t), stringResource(R.string.traj_empty_b), Modifier.padding(top = 16.dp))
            }
            val byDay = list.orEmpty().withIndex().groupBy { dayLabel(it.value.atMillis, today, tomorrow, yesterday) }
            byDay.forEach { (day, group) ->
                item("d-$day") { Eyebrow(day, Modifier.padding(start = 22.dp, top = 14.dp, bottom = 4.dp)) }
                items(group, key = { "${it.index}-${it.value.atMillis}" }) { e -> EncounterRow(e.value, e.index, onOpenConversation) }
            }
        }
    }
}

@Composable
private fun EncounterRow(e: Encounter, index: Int, onOpen: (ConversationId) -> Unit) {
    val u = Zuri.universe
    val (title, sub, conv) = when (e) {
        is Encounter.Event -> Triple(e.title, listOfNotNull(e.person, if (e.hasTime) clockTime(e.atMillis) else null).joinToString(" · "), e.conversationId)
        is Encounter.PromiseDue -> Triple(e.title, listOfNotNull(stringResource(R.string.traj_promise), e.person).joinToString(" · "), e.conversationId)
        is Encounter.CheckIn -> Triple(stringResource(R.string.traj_checkin, e.person), stringResource(R.string.traj_checkin_b), e.conversationId)
        is Encounter.Device -> Triple(e.title, listOfNotNull(if (e.allDay) stringResource(R.string.traj_all_day) else clockTime(e.atMillis), e.location, e.calendar).joinToString(" · "), null)
    }
    Row(
        Modifier.fillMaxWidth().rise(index).padding(horizontal = 14.dp, vertical = 4.dp).glass(RoundedCornerShape(20.dp))
            .then(if (conv != null) Modifier.tiltClickable { onOpen(conv) } else Modifier).heightIn(min = 64.dp).padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(40.dp), contentAlignment = Alignment.Center) {
            when (e) {
                is Encounter.CheckIn -> Orb(36.dp, skinFor(e.conversationId.value), label = initialOf(e.person))
                is Encounter.Event -> Icon(Icons.Rounded.Event, null, tint = u.ion)
                is Encounter.PromiseDue -> Icon(Icons.Rounded.TaskAlt, null, tint = u.star)
                is Encounter.Device -> Icon(Icons.Rounded.CalendarMonth, null, tint = u.nebulaSoft)
            }
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleMedium, color = u.ink, maxLines = 2, overflow = TextOverflow.Ellipsis)
            if (sub.isNotEmpty()) Text(sub, style = MaterialTheme.typography.bodySmall, color = u.inkMuted, maxLines = 1)
        }
        if (e is Encounter.CheckIn) Icon(Icons.Rounded.WavingHand, null, tint = u.aurora, modifier = Modifier.size(18.dp))
    }
}

