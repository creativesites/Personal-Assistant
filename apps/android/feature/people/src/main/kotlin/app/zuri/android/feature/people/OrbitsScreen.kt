package app.zuri.android.feature.people

import android.text.format.DateUtils
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Forum
import androidx.compose.material.icons.rounded.Hub
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.zuri.android.core.ui.components.EmptyState
import app.zuri.android.core.ui.theme.HealthBand
import app.zuri.android.core.ui.theme.SunSkin
import app.zuri.android.core.ui.theme.Zuri
import app.zuri.android.core.ui.theme.bandColor
import app.zuri.android.core.ui.theme.healthBand
import app.zuri.android.core.ui.theme.initialOf
import app.zuri.android.core.ui.theme.skinFor
import app.zuri.android.core.ui.universe.Eyebrow
import app.zuri.android.core.ui.universe.LaunchButton
import app.zuri.android.core.ui.universe.LivePill
import app.zuri.android.core.ui.universe.Orb
import app.zuri.android.core.ui.universe.OrbitBody
import app.zuri.android.core.ui.universe.OrbitRing
import app.zuri.android.core.ui.universe.OrbitSystem
import app.zuri.android.core.ui.universe.ScreenTitle
import app.zuri.android.core.ui.universe.UChip
import app.zuri.android.core.ui.universe.glass
import app.zuri.android.core.ui.universe.rise
import app.zuri.android.core.ui.universe.tiltClickable
import app.zuri.android.domain.inbox.ConversationId
import app.zuri.android.domain.people.HealthTrend
import app.zuri.android.domain.people.Relationship

/** Orbits (spec §4.4): the owner's people as a star system. Healthier relationships orbit closer. */
@Composable
fun OrbitsRoute(onOpenConversation: (ConversationId) -> Unit, onOpenNetwork: () -> Unit = {}, viewModel: OrbitsViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val avatars by viewModel.avatars.collectAsStateWithLifecycle()
    LifecycleResumeEffect(Unit) { viewModel.refresh(); onPauseOrDispose { } }
    OrbitsContent(state, avatars, viewModel::setFilter, viewModel::needAvatar, viewModel::setTier, onOpenConversation, onOpenNetwork)
}

enum class OrbitFilter { ALL, ATTENTION, DORMANT }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OrbitsContent(
    state: OrbitsState,
    avatars: Map<String, ImageBitmap> = emptyMap(),
    onFilter: (OrbitFilter) -> Unit = {},
    onNeedAvatar: (String) -> Unit = {},
    onSetTier: (ConversationId, Int) -> Unit = { _, _ -> },
    onOpenConversation: (ConversationId) -> Unit = {},
    onOpenNetwork: () -> Unit = {},
) {
    val u = Zuri.universe
    var selected by remember { mutableStateOf<Relationship?>(null) }
    val list = state.visible
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 16.dp)) {
        item(key = "header") {
            Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 16.dp, top = 2.dp, bottom = 4.dp), verticalAlignment = Alignment.Bottom) {
                Column(Modifier.weight(1f)) {
                    Eyebrow(stringResource(R.string.orbits_eyebrow))
                    ScreenTitle(stringResource(R.string.orbits_title))
                }
                val thriving = state.people.count { healthBand(it.score) == HealthBand.Thriving }
                if (state.people.isNotEmpty()) LivePill(stringResource(R.string.orbits_thriving, thriving), color = u.aurora)
            }
        }
        if (!state.loading && state.people.isEmpty()) {
            item(key = "empty") { EmptyState(Icons.Rounded.Hub, stringResource(R.string.orbits_empty_t), stringResource(R.string.orbits_empty_b), Modifier.padding(top = 24.dp)) }
            return@LazyColumn
        }
        item(key = "filters") {
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterPill(stringResource(R.string.orbits_all), state.filter == OrbitFilter.ALL) { onFilter(OrbitFilter.ALL) }
                FilterPill(stringResource(R.string.orbits_attention), state.filter == OrbitFilter.ATTENTION) { onFilter(OrbitFilter.ATTENTION) }
                FilterPill(stringResource(R.string.orbits_dormant), state.filter == OrbitFilter.DORMANT) { onFilter(OrbitFilter.DORMANT) }
                // Network (Part C): the warm list and keep-warm nudges from the cloud.
                FilterPill(stringResource(R.string.orbits_network) + " →", false, onOpenNetwork)
            }
        }
        item(key = "map") { GravityMap(list, avatars, selected?.conversationId) { id -> selected = list.firstOrNull { it.conversationId.value == id } } }
        itemsIndexed(list, key = { _, r -> r.conversationId.value }) { i, r ->
            LaunchedEffect(r.conversationId) { onNeedAvatar(r.conversationId.value) }
            PersonRow(r, avatars[r.conversationId.value], i) { selected = r }
        }
    }
    selected?.let { r ->
        val live = state.people.firstOrNull { it.conversationId == r.conversationId } ?: r
        ModalBottomSheet(onDismissRequest = { selected = null }) {
            ProfileSheet(live, avatars[live.conversationId.value], onSetTier = { onSetTier(live.conversationId, it) }) {
                selected = null; onOpenConversation(live.conversationId)
            }
        }
    }
}

@Composable
private fun FilterPill(text: String, on: Boolean, onClick: () -> Unit) {
    val u = Zuri.universe
    Text(
        text, color = if (on) Color.White else u.inkSoft, style = MaterialTheme.typography.labelLarge,
        modifier = Modifier.heightIn(min = 40.dp).clip(RoundedCornerShape(50))
            .then(if (on) Modifier.background(Brush.horizontalGradient(app.zuri.android.core.ui.theme.OutgoingGradient), RoundedCornerShape(50)) else Modifier.glass(RoundedCornerShape(50)))
            .semantics { selected = on }.clickable(role = Role.Tab, onClick = onClick).padding(horizontal = 16.dp, vertical = 10.dp),
    )
}


/**
 * The gravity map (spec §4.4): the owner's sun at the centre; rings at the thriving zone, steady
 * zone and the dashed drift line. Up to 10 people: radius = 30 + (100 − health)/100 × (maxR − 30),
 * size by tier, spread by the golden angle so planets never clump.
 */
@Composable
private fun GravityMap(people: List<Relationship>, avatars: Map<String, ImageBitmap>, selected: ConversationId?, onSelect: (String) -> Unit) {
    if (people.isEmpty()) return
    val u = Zuri.universe
    val maxR = 150f
    val shown = people.sortedWith(compareBy<Relationship> { it.tier }.thenByDescending { it.score }).take(10)
    val bodies = shown.mapIndexed { i, r ->
        OrbitBody(
            key = r.conversationId.value, skin = skinFor(r.conversationId.value),
            size = when (r.tier) { 1 -> 44.dp; 2 -> 36.dp; else -> 30.dp },
            radius = (30 + (100 - r.score) / 100f * (maxR - 30)).dp,
            angle0 = Math.toRadians(i * 137.5).toFloat(), speed = 1,
            label = initialOf(r.name), selected = r.conversationId == selected, image = avatars[r.conversationId.value],
        )
    }
    OrbitSystem(
        bodies = bodies,
        rings = listOf(
            OrbitRing((maxR * 0.42f).dp, u.aurora.copy(alpha = 0.55f)),
            OrbitRing((maxR * 0.70f).dp, u.ion.copy(alpha = 0.45f)),
            OrbitRing(maxR.dp, u.ember.copy(alpha = 0.6f), dashed = true),
        ),
        center = SunSkin, centerSize = 44.dp, centerLabel = "YOU", height = 300.dp, tiltDeg = 64f, periodMs = 80_000,
        description = stringResource(R.string.orbits_map_description, shown.joinToString { "${it.name}, health ${it.score}" }),
        onBody = onSelect,
    )
}

@Composable
internal fun PersonAvatar(r: Relationship, photo: ImageBitmap?, size: Dp) {
    if (photo != null) {
        val skin = skinFor(r.conversationId.value)
        Image(photo, null, contentScale = ContentScale.Crop,
            modifier = Modifier.size(size).clip(CircleShape).border(2.dp, Brush.linearGradient(listOf(skin.highlight, skin.body, skin.shadow)), CircleShape))
    } else Orb(size, skinFor(r.conversationId.value), label = initialOf(r.name))
}

@Composable
private fun PersonRow(r: Relationship, photo: ImageBitmap?, index: Int, onClick: () -> Unit) {
    val u = Zuri.universe
    val band = healthBand(r.score)
    Row(
        Modifier.fillMaxWidth().rise(index).padding(horizontal = 14.dp, vertical = 4.dp).glass(RoundedCornerShape(22.dp))
            .tiltClickable(onClick = onClick).heightIn(min = 72.dp).padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        PersonAvatar(r, photo, 44.dp)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(r.name, style = MaterialTheme.typography.titleMedium, color = u.ink, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                Text(r.score.toString(), style = MaterialTheme.typography.titleLarge, color = u.bandColor(band))
            }
            Text(r.reason, style = MaterialTheme.typography.bodySmall, color = u.inkSoft, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Row(Modifier.padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                UChip(band.label, u.bandColor(band))
                trendLabel(r.trend)?.let { UChip(it, if (r.trend == HealthTrend.IMPROVING) u.aurora else u.ember) }
            }
        }
    }
}

@Composable
private fun trendLabel(t: HealthTrend): String? = when (t) {
    HealthTrend.IMPROVING -> stringResource(R.string.orbits_warming)
    HealthTrend.DECLINING -> stringResource(R.string.orbits_cooling)
    HealthTrend.STABLE -> null
}

/** The profile sheet: health ring, why, rhythm, circle, and the one action, open the chat. */
@Composable
private fun ProfileSheet(r: Relationship, photo: ImageBitmap?, onSetTier: (Int) -> Unit, onOpenChat: () -> Unit) {
    val u = Zuri.universe
    val band = healthBand(r.score)
    Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(bottom = 28.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Box(Modifier.size(132.dp), contentAlignment = Alignment.Center) {
            Canvas(Modifier.size(132.dp)) {
                val w = 8.dp.toPx(); val inset = w / 2
                drawArc(u.glassBorder, 0f, 360f, false, Offset(inset, inset), Size(size.width - w, size.height - w), style = Stroke(w))
                drawArc(u.bandColor(band), -90f, 360f * r.score / 100f, false, Offset(inset, inset), Size(size.width - w, size.height - w), style = Stroke(w, cap = StrokeCap.Round))
            }
            PersonAvatar(r, photo, 96.dp)
        }
        Spacer(Modifier.height(10.dp))
        Text(r.name, style = MaterialTheme.typography.headlineSmall, color = u.ink)
        Text(stringResource(R.string.orbits_health, r.score), style = MaterialTheme.typography.bodyMedium, color = u.bandColor(band))
        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            UChip(stringResource(tierLabel(r.tier)), u.nebulaSoft)
            UChip(band.label, u.bandColor(band))
            trendLabel(r.trend)?.let { UChip(it, if (r.trend == HealthTrend.IMPROVING) u.aurora else u.ember) }
        }
        Spacer(Modifier.height(14.dp))
        Column(Modifier.fillMaxWidth().glass(RoundedCornerShape(22.dp)).padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Eyebrow(stringResource(R.string.orbits_why))
            Text(r.reason, style = MaterialTheme.typography.bodyMedium, color = u.ink)
            val rhythm = buildList {
                r.usualGapDays?.let { add(if (it < 1) stringResource(R.string.orbits_rhythm_daily) else stringResource(R.string.orbits_rhythm, it.toInt().coerceAtLeast(1))) }
                r.lastInteractionAt?.let { add(stringResource(R.string.orbits_last, DateUtils.getRelativeTimeSpanString(it).toString())) }
                r.nextCheckAt?.let { if (it > System.currentTimeMillis()) add(stringResource(R.string.orbits_next, DateUtils.getRelativeTimeSpanString(it).toString())) }
            }
            if (rhythm.isNotEmpty()) Text(rhythm.joinToString(" · "), style = MaterialTheme.typography.bodySmall, color = u.inkMuted)
        }
        Spacer(Modifier.height(14.dp))
        Eyebrow(stringResource(R.string.orbits_circle), Modifier.fillMaxWidth())
        Spacer(Modifier.height(6.dp))
        val tiers = listOf(1, 2, 3, 4, 5)
        SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
            tiers.forEachIndexed { i, t ->
                SegmentedButton(selected = r.tier == t, onClick = { onSetTier(t) }, shape = SegmentedButtonDefaults.itemShape(i, tiers.size)) {
                    Text(stringResource(tierShort(t)), maxLines = 1)
                }
            }
        }
        Text(stringResource(R.string.orbits_circle_hint), style = MaterialTheme.typography.bodySmall, color = u.inkMuted, modifier = Modifier.padding(top = 6.dp))
        Spacer(Modifier.height(16.dp))
        LaunchButton(stringResource(R.string.orbits_open_chat), onOpenChat, icon = { Icon(Icons.Rounded.Forum, null, tint = Color.White, modifier = Modifier.size(20.dp)) })
    }
}

private fun tierLabel(t: Int) = when (t) { 1 -> R.string.tier_1; 2 -> R.string.tier_2; 3 -> R.string.tier_3; 4 -> R.string.tier_4; else -> R.string.tier_5 }
private fun tierShort(t: Int) = when (t) { 1 -> R.string.tier_1_s; 2 -> R.string.tier_2_s; 3 -> R.string.tier_3_s; 4 -> R.string.tier_4_s; else -> R.string.tier_5_s }
