package app.zuri.android.core.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.ExpandMore
import androidx.compose.material.icons.rounded.Sensors
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.zuri.android.core.ui.theme.Zuri

/** The chip naming the active workspace. It opens the context switcher from every root screen. */
@Composable
fun ContextChip(label: String, icon: ImageVector, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val c = Zuri.colors
    Surface(
        onClick = onClick,
        modifier = modifier.heightIn(min = 44.dp).widthIn(max = 240.dp).semantics { contentDescription = "Context: $label. Switch context" },
        shape = CircleShape,
        color = Zuri.universe.glassTop,
        border = BorderStroke(1.dp, Zuri.universe.glassBorder),
    ) {
        Row(Modifier.padding(start = 6.dp, end = 10.dp, top = 6.dp, bottom = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(28.dp).clip(CircleShape).background(c.ctx), contentAlignment = Alignment.Center) {
                Icon(icon, null, tint = Color.White, modifier = Modifier.size(17.dp))
            }
            Spacer(Modifier.size(8.dp))
            Text(label, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
            Icon(Icons.Rounded.ExpandMore, null, tint = c.muted, modifier = Modifier.size(20.dp))
        }
    }
}

/**
 * Top bar for root destinations: a soft band of the context tint fading into the page, the context
 * chip, then actions and the capture-status button.
 */
@Composable
fun RootTopBar(
    contextLabel: String,
    contextIcon: ImageVector,
    captureState: CaptureState,
    onContextClick: () -> Unit,
    onCaptureClick: () -> Unit,
    modifier: Modifier = Modifier,
    actions: @Composable RowScope.() -> Unit = {},
) {
    val c = Zuri.colors
    Row(
        modifier
            .fillMaxWidth()
            // A faint wash of the workspace colour over the sky, so the context reads on every root screen.
            .background(Brush.verticalGradient(listOf(c.ctx.copy(alpha = if (c.dark) 0.22f else 0.14f), Color.Transparent)))
            .statusBarsPadding()
            .padding(start = 14.dp, end = 6.dp, top = 6.dp, bottom = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        ContextChip(contextLabel, contextIcon, onContextClick)
        Spacer(Modifier.weight(1f))
        actions()
        val captureLabel = when (captureState) {
            CaptureState.Listening -> "Capture is listening"
            CaptureState.Degraded -> "Capture needs attention"
            CaptureState.Off -> "Capture is off"
        }
        IconButton(onClick = onCaptureClick, modifier = Modifier.semantics { contentDescription = captureLabel }) {
            Box {
                Icon(Icons.Rounded.Sensors, contentDescription = null)
                CaptureStatusDot(captureState, Modifier.align(Alignment.TopEnd))
            }
        }
    }
}

/** Top bar for detail screens: back arrow, title and optional subtitle, actions. */
@Composable
fun DetailTopBar(
    title: String,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    actions: @Composable RowScope.() -> Unit = {},
) {
    Row(
        modifier.fillMaxWidth().statusBarsPadding().padding(start = 4.dp, end = 4.dp, top = 4.dp, bottom = 6.dp).heightIn(min = 56.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Back") }
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (subtitle != null) Text(subtitle, style = MaterialTheme.typography.bodySmall, color = Zuri.colors.muted)
        }
        actions()
    }
}
