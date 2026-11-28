package app.zuri.android.core.ui.components

import androidx.compose.foundation.background
import androidx.compose.ui.draw.clip
import app.zuri.android.core.ui.universe.Eyebrow
import app.zuri.android.core.ui.universe.glass
import app.zuri.android.core.ui.universe.tiltClickable

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import app.zuri.android.core.ui.theme.Zuri

enum class CardStyle { Plain, Tinted, Flat }

/** The standard 24 dp card. Tinted uses the context colour; Flat sits quietly on the page. */
@Composable
fun ZuriCard(
    modifier: Modifier = Modifier,
    style: CardStyle = CardStyle.Plain,
    onClick: (() -> Unit)? = null,
    contentPadding: Boolean = true,
    content: @Composable ColumnScope.() -> Unit,
) {
    // Universe glass (spec §3.4): translucent over the sky. Tinted adds the context colour; Flat is fainter.
    val c = Zuri.colors
    val shape = MaterialTheme.shapes.large
    val surface = when (style) {
        CardStyle.Plain -> Modifier.glass(shape)
        CardStyle.Tinted -> Modifier.glass(shape).background(c.ctx.copy(alpha = 0.14f))
        CardStyle.Flat -> Modifier.clip(shape).background(c.surface2)
    }
    val m = modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 5.dp).then(surface)
        .then(if (onClick != null) Modifier.tiltClickable(onClick = onClick) else Modifier)
    Column(m.then(if (contentPadding) Modifier.padding(horizontal = 16.dp, vertical = 14.dp) else Modifier), content = content)
}

/** A titled group of content with an optional trailing action ("All", "Edit"). */
@Composable
fun SectionHeader(title: String, modifier: Modifier = Modifier, action: String? = null, onAction: (() -> Unit)? = null) {
    Row(
        modifier.fillMaxWidth().padding(start = 20.dp, end = 8.dp, top = 14.dp, bottom = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Eyebrow(title, Modifier.weight(1f).semantics { heading() })
        if (action != null && onAction != null) {
            TextButton(onClick = onAction) { Text(action, color = Zuri.colors.ctxInk) }
        }
    }
}
