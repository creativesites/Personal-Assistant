package app.zuri.android.feature.life

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import app.zuri.android.core.ui.theme.Zuri
import app.zuri.android.core.ui.universe.Eyebrow
import app.zuri.android.core.ui.universe.ScreenTitle

/** Universe header for detail screens: back, eyebrow, big title, optional trailing action. */
@Composable
internal fun LifeHeader(eyebrow: String, title: String, onBack: () -> Unit, trailing: @Composable () -> Unit = {}) {
    Row(Modifier.fillMaxWidth().statusBarsPadding().padding(start = 4.dp, end = 12.dp, top = 4.dp), verticalAlignment = Alignment.Bottom) {
        IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, stringResource(R.string.life_back), tint = Zuri.universe.ink) }
        Column(Modifier.weight(1f).padding(start = 4.dp)) {
            Eyebrow(eyebrow)
            ScreenTitle(title)
        }
        trailing()
    }
}

internal fun dayLabel(millis: Long, today: String, tomorrow: String, yesterday: String): String {
    val zone = java.time.ZoneId.systemDefault()
    val d = java.time.Instant.ofEpochMilli(millis).atZone(zone).toLocalDate()
    val now = java.time.LocalDate.now(zone)
    return when (d) {
        now -> today
        now.plusDays(1) -> tomorrow
        now.minusDays(1) -> yesterday
        else -> d.format(java.time.format.DateTimeFormatter.ofPattern("EEEE d MMMM", java.util.Locale.getDefault()))
    }
}

internal fun clockTime(millis: Long): String =
    java.time.format.DateTimeFormatter.ofPattern("HH:mm", java.util.Locale.getDefault()).format(java.time.Instant.ofEpochMilli(millis).atZone(java.time.ZoneId.systemDefault()))
