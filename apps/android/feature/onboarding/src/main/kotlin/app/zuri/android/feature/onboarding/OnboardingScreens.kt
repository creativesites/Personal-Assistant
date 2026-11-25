package app.zuri.android.feature.onboarding

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CloudOff
import androidx.compose.material.icons.rounded.FactCheck
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.PhoneAndroid
import androidx.compose.material.icons.rounded.Cloud
import androidx.compose.material.icons.rounded.ToggleOn
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.zuri.android.core.ui.components.CardStyle
import app.zuri.android.core.ui.components.DetailTopBar
import app.zuri.android.core.ui.components.IconChip
import app.zuri.android.core.ui.components.StatusTag
import app.zuri.android.core.ui.components.Tone
import app.zuri.android.core.ui.components.ZuriCard
import app.zuri.android.core.ui.components.ZuriListGroup
import app.zuri.android.core.ui.components.ZuriListRow
import app.zuri.android.core.ui.theme.Zuri

/** Onboarding G01 → G02 → G03 (SCREEN_MAP.md). Completing it is what moves the app to the shell. */
@Composable
fun OnboardingRoute(viewModel: OnboardingViewModel = hiltViewModel()) {
    var step by rememberSaveable { mutableIntStateOf(0) }
    val status by viewModel.status.collectAsStateWithLifecycle()
    BackHandler(enabled = step > 0) { step-- }
    when (step) {
        0 -> WelcomeContent(onStart = { step = 1 }, onHaveAccount = { step = 2 })
        1 -> PrivacyContent(onContinue = { step = 2 }, onBack = { step = 0 })
        else -> SetupChoiceContent(status = status, onStartLocal = viewModel::startLocally, onBack = { step = 1 })
    }
}

@Composable
private fun OnboardingPage(top: (@Composable () -> Unit)? = null, bottom: @Composable () -> Unit, content: @Composable () -> Unit) {
    Column(Modifier.fillMaxSize().navigationBarsPadding()) {
        if (top != null) top() else Spacer(Modifier.statusBarsPadding())
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState())) { content() }
        Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) { bottom() }
    }
}

@Composable
fun WelcomeContent(onStart: () -> Unit, onHaveAccount: () -> Unit) {
    OnboardingPage(
        bottom = {
            Button(onClick = onStart, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) { Text(stringResource(R.string.onb_get_started)) }
            OutlinedButton(onClick = onHaveAccount, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) { Text(stringResource(R.string.onb_have_account)) }
        },
    ) {
        ThreadIllustration(Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 12.dp).aspectRatio(1.1f))
        Text(stringResource(R.string.onb_welcome_title), style = MaterialTheme.typography.headlineLarge, modifier = Modifier.padding(horizontal = 22.dp))
        Spacer(Modifier.height(8.dp))
        Text(stringResource(R.string.onb_welcome_body), style = MaterialTheme.typography.bodyLarge, color = Zuri.colors.muted, modifier = Modifier.padding(horizontal = 22.dp))
    }
}

/** The product idea drawn: messages from different apps connected by threads to what Zuri understood. */
@Composable
private fun ThreadIllustration(modifier: Modifier = Modifier) {
    val c = Zuri.colors
    val surface = MaterialTheme.colorScheme.surfaceContainerLowest.let { if (c.dark) MaterialTheme.colorScheme.surfaceContainer else it }
    val sourceColors = listOf(Color(0xFF1FA855), Color(0xFF229ED9), Color(0xFFD93025), Color(0xFF1FA855), Color(0xFF1A73E8), Color(0xFF128C7E), Color(0xFF3A76F0))
    val points = listOf(0.17f to 0.2f, 0.83f to 0.17f, 0.11f to 0.58f, 0.89f to 0.61f, 0.27f to 0.88f, 0.75f to 0.88f, 0.5f to 0.11f)
    Canvas(modifier) {
        val center = Offset(size.width / 2, size.height / 2)
        val thread = Brush.linearGradient(listOf(Color(0xFF0F8C7A), Color(0xFF4F46E5)))
        points.forEach { (x, y) ->
            val p = Offset(size.width * x, size.height * y)
            val path = Path().apply {
                moveTo(p.x, p.y)
                quadraticTo(center.x + (p.x - center.x) * 0.3f, center.y + (p.y - center.y) * 0.2f, center.x, center.y)
            }
            drawPath(path, thread, alpha = 0.7f, style = Stroke(width = 1.5.dp.toPx()))
        }
        val pill = Size(48.dp.toPx(), 26.dp.toPx())
        points.forEachIndexed { i, (x, y) ->
            val p = Offset(size.width * x, size.height * y)
            val tl = Offset(p.x - pill.width / 2, p.y - pill.height / 2)
            drawRoundRect(surface, tl, pill, CornerRadius(pill.height / 2))
            drawRoundRect(c.line, tl, pill, CornerRadius(pill.height / 2), style = Stroke(1.dp.toPx()))
            drawCircle(sourceColors[i], radius = 5.dp.toPx(), center = Offset(tl.x + 13.dp.toPx(), p.y))
            drawRoundRect(c.surface3, Offset(tl.x + 22.dp.toPx(), p.y - 3.dp.toPx()), Size(17.dp.toPx(), 6.dp.toPx()), CornerRadius(3.dp.toPx()))
        }
        drawCircle(c.ctxWeak, radius = 62.dp.toPx(), center = center)
        drawCircle(
            Brush.radialGradient(listOf(Color(0xFFA5F3FC), Color(0xFF06B6D4), Color(0xFF4F46E5)), center = center - Offset(12.dp.toPx(), 12.dp.toPx()), radius = 60.dp.toPx()),
            radius = 42.dp.toPx(), center = center,
        )
        drawCircle(Color.White.copy(alpha = 0.55f), radius = 9.dp.toPx(), center = center - Offset(12.dp.toPx(), 12.dp.toPx()))
    }
}

@Composable
fun PrivacyContent(onContinue: () -> Unit, onBack: () -> Unit) {
    OnboardingPage(
        top = { DetailTopBar(title = "", onBack = onBack) },
        bottom = { Button(onClick = onContinue, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) { Text(stringResource(R.string.onb_continue)) } },
    ) {
        Text(stringResource(R.string.onb_privacy_title), style = MaterialTheme.typography.headlineLarge, modifier = Modifier.padding(horizontal = 20.dp))
        Text(stringResource(R.string.onb_privacy_sub), color = Zuri.colors.muted, modifier = Modifier.padding(horizontal = 20.dp, vertical = 6.dp))
        Spacer(Modifier.height(6.dp))
        val items = listOf(
            Triple(Icons.Rounded.PhoneAndroid, R.string.onb_p1_t, R.string.onb_p1_s),
            Triple(Icons.Rounded.ToggleOn, R.string.onb_p2_t, R.string.onb_p2_s),
            Triple(Icons.Rounded.CloudOff, R.string.onb_p3_t, R.string.onb_p3_s),
            Triple(Icons.Rounded.FactCheck, R.string.onb_p4_t, R.string.onb_p4_s),
        )
        ZuriListGroup(rows = items.map { (icon, t, s) ->
            @Composable { ZuriListRow(title = stringResource(t), supporting = stringResource(s), supportingMaxLines = 4, leading = { IconChip(icon) }) }
        })
        Hint(stringResource(R.string.onb_privacy_hint))
    }
}

@Composable
fun SetupChoiceContent(status: SetupStatus, onStartLocal: () -> Unit, onBack: () -> Unit) {
    val working = status == SetupStatus.Working
    OnboardingPage(top = { DetailTopBar(title = "", onBack = onBack) }, bottom = {}) {
        Text(stringResource(R.string.onb_choice_title), style = MaterialTheme.typography.headlineLarge, modifier = Modifier.padding(horizontal = 20.dp, vertical = 6.dp))
        ZuriCard(onClick = if (working) null else onStartLocal, modifier = Modifier.semantics { role = Role.Button }) {
            Row(verticalAlignment = Alignment.Top) {
                IconChip(Icons.Rounded.PhoneAndroid)
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(stringResource(R.string.onb_local_t), style = MaterialTheme.typography.titleMedium)
                    Text(stringResource(R.string.onb_local_s), style = MaterialTheme.typography.bodyMedium, color = Zuri.colors.muted)
                    Spacer(Modifier.height(8.dp))
                    if (working) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            CircularProgressIndicator(Modifier.height(16.dp).width(16.dp), strokeWidth = 2.dp)
                            Spacer(Modifier.width(8.dp)); Text(stringResource(R.string.onb_starting), style = MaterialTheme.typography.bodySmall)
                        }
                    } else {
                        StatusTag(stringResource(R.string.onb_recommended), tone = Tone.Context)
                    }
                }
            }
        }
        ZuriCard(style = CardStyle.Flat) {
            Row(verticalAlignment = Alignment.Top) {
                IconChip(Icons.Rounded.Cloud, tone = Tone.Neutral)
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(stringResource(R.string.onb_cloud_t), style = MaterialTheme.typography.titleMedium, color = Zuri.colors.muted)
                    Text(stringResource(R.string.onb_cloud_s), style = MaterialTheme.typography.bodyMedium, color = Zuri.colors.muted)
                    Spacer(Modifier.height(8.dp))
                    StatusTag(stringResource(R.string.onb_not_yet))
                }
            }
        }
        if (status == SetupStatus.Failed) {
            Text(stringResource(R.string.onb_error), color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp))
        }
        Hint(stringResource(R.string.onb_choice_hint), Icons.Rounded.Lock)
    }
}

@Composable
private fun Hint(text: String, icon: androidx.compose.ui.graphics.vector.ImageVector = Icons.Rounded.Info) {
    ZuriCard(style = CardStyle.Flat) {
        Row(verticalAlignment = Alignment.Top) {
            Icon(icon, null, tint = Zuri.colors.ctxInk)
            Spacer(Modifier.width(10.dp))
            Text(text, style = MaterialTheme.typography.bodyMedium, color = Zuri.colors.muted)
        }
    }
}

