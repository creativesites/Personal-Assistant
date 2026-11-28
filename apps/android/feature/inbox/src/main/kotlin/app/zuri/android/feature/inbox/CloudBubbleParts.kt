package app.zuri.android.feature.inbox

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaPlayer
import android.net.Uri
import android.text.format.Formatter
import android.util.Base64
import android.widget.VideoView
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.CloudDownload
import androidx.compose.material.icons.rounded.Description
import androidx.compose.material.icons.rounded.Done
import androidx.compose.material.icons.rounded.DoneAll
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Place
import androidx.compose.material.icons.rounded.Schedule
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.FileProvider
import app.zuri.android.core.ui.capture.label
import app.zuri.android.core.ui.theme.Zuri
import app.zuri.android.domain.inbox.DeliveryStatus
import app.zuri.android.domain.inbox.GeoPoint
import app.zuri.android.domain.inbox.MediaKind
import app.zuri.android.domain.inbox.MessageMedia
import app.zuri.android.domain.inbox.QuotedMessage
import app.zuri.android.domain.inbox.Reaction
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext

// Rich parts of a cloud message bubble (D-21): quote, media, location, reactions, ticks.

/**
 * The quoted message inside a reply. Contrast is set for the bubble it sits in: on the owner's violet
 * bubble it is white on a darker inset; on a glass bubble it is ion/ink on a deep inset (both skies).
 */
@Composable
internal fun QuoteBlock(q: QuotedMessage, mine: Boolean, onJump: (() -> Unit)?) {
    val u = Zuri.universe
    val inset = when {
        mine -> Color.Black.copy(alpha = 0.24f)
        u.night -> Color.Black.copy(alpha = 0.32f)
        else -> u.nebula.copy(alpha = 0.08f)
    }
    val bar = if (mine) Color.White else u.ion
    val nameColor = if (mine) Color.White else if (u.night) u.ion else u.nebula
    val bodyColor = if (mine) Color.White.copy(alpha = 0.88f) else u.inkSoft
    Row(
        Modifier.fillMaxWidth().padding(bottom = 6.dp).clip(RoundedCornerShape(12.dp)).background(inset)
            .then(if (onJump != null) Modifier.clickable(onClick = onJump) else Modifier),
    ) {
        Box(Modifier.width(4.dp).heightIn(min = 40.dp).background(bar))
        Column(Modifier.padding(horizontal = 9.dp, vertical = 6.dp)) {
            Text(
                if (q.fromMe == true) stringResource(R.string.you) else q.senderName ?: stringResource(R.string.quoted_someone),
                style = MaterialTheme.typography.labelMedium, color = nameColor, maxLines = 1,
            )
            val body = when {
                q.deleted -> stringResource(app.zuri.android.domain.inbox.PlaceholderKind.DELETED.label())
                !q.text.isNullOrBlank() -> q.text!!
                q.placeholder != null -> stringResource(q.placeholder!!.label())
                else -> "…"
            }
            Text(body, style = MaterialTheme.typography.bodySmall, color = bodyColor, maxLines = 2, overflow = TextOverflow.Ellipsis,
                fontStyle = if (q.deleted) FontStyle.Italic else FontStyle.Normal)
        }
    }
}

@Composable
internal fun MediaBlock(media: MessageMedia, state: MediaUi?, onOpen: (force: Boolean) -> Unit, onView: (MediaUi.Ready, MediaKind) -> Unit) {
    when (media.kind) {
        MediaKind.IMAGE, MediaKind.VIDEO, MediaKind.STICKER -> VisualMedia(media, state, onOpen, onView)
        MediaKind.AUDIO -> AudioMedia(media, state, onOpen)
        MediaKind.DOCUMENT -> DocumentMedia(media, state, onOpen)
    }
}

@Composable
private fun VisualMedia(media: MessageMedia, state: MediaUi?, onOpen: (Boolean) -> Unit, onView: (MediaUi.Ready, MediaKind) -> Unit) {
    val thumb = remember(media.thumbnailBase64) { media.thumbnailBase64?.let(::decodeThumb) }
    val ready = state as? MediaUi.Ready
    val full by produceState<ImageBitmap?>(null, ready?.path, media.kind) {
        value = if (ready != null && media.kind != MediaKind.VIDEO) withContext(Dispatchers.IO) { decodeSampled(ready.path, 900) } else null
    }
    // Auto-fetch small visual media on screen (Wi-Fi-only rules still apply in the store).
    LaunchedEffect(Unit) { if (state == null && media.available && media.kind != MediaKind.VIDEO) onOpen(false) }
    val ratio = if ((media.width ?: 0) > 0 && (media.height ?: 0) > 0) (media.width!!.toFloat() / media.height!!).coerceIn(0.5f, 2f) else 1f
    val sticker = media.kind == MediaKind.STICKER
    Box(
        Modifier.padding(bottom = 4.dp).widthIn(max = if (sticker) 150.dp else 260.dp).fillMaxWidth().aspectRatio(ratio)
            .clip(RoundedCornerShape(12.dp)).background(if (sticker) Color.Transparent else Zuri.colors.surface2)
            .clickable {
                when {
                    ready != null -> onView(ready, media.kind)
                    media.available -> onOpen(true)
                }
            },
        contentAlignment = Alignment.Center,
    ) {
        val shown = full ?: thumb
        if (shown != null) {
            Image(shown, null, contentScale = if (sticker) ContentScale.Fit else ContentScale.Crop,
                modifier = Modifier.fillMaxSize().then(if (full == null && !sticker) Modifier.blur(8.dp) else Modifier))
        }
        when {
            !media.available -> Overlay(Icons.Rounded.ErrorOutline, stringResource(R.string.media_unavailable))
            state is MediaUi.Loading -> CircularProgressIndicator(Modifier.size(32.dp), strokeWidth = 3.dp)
            state is MediaUi.NeedsWifi -> Overlay(Icons.Rounded.CloudDownload, media.sizeBytes?.let { Formatter.formatShortFileSize(LocalContext.current, it) } ?: stringResource(R.string.media_download))
            state is MediaUi.Failed -> Overlay(Icons.Rounded.ErrorOutline, stringResource(R.string.media_retry))
            media.kind == MediaKind.VIDEO -> Box(Modifier.size(52.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.45f)), contentAlignment = Alignment.Center) {
                if (state is MediaUi.Loading) CircularProgressIndicator(Modifier.size(28.dp), color = Color.White)
                else Icon(Icons.Rounded.PlayArrow, null, tint = Color.White, modifier = Modifier.size(34.dp))
            }
        }
    }
    // A video opens full-screen once downloaded.
    LaunchedEffect(ready?.path) { if (ready != null && media.kind == MediaKind.VIDEO) onView(ready, media.kind) }
}

@Composable
private fun Overlay(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String) {
    Row(
        Modifier.clip(RoundedCornerShape(50)).background(Color.Black.copy(alpha = 0.5f)).padding(horizontal = 12.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, null, tint = Color.White, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(6.dp))
        Text(label, color = Color.White, style = MaterialTheme.typography.labelMedium)
    }
}

/** Voice notes and audio: play in the bubble, with a speed toggle like WhatsApp. */
@Composable
private fun AudioMedia(media: MessageMedia, state: MediaUi?, onOpen: (Boolean) -> Unit) {
    val ready = state as? MediaUi.Ready
    var playing by remember { mutableStateOf(false) }
    var progress by remember { mutableFloatStateOf(0f) }
    var speed by remember { mutableFloatStateOf(1f) }
    val player = remember(ready?.path) {
        ready?.let { r -> runCatching { MediaPlayer().apply { setDataSource(r.path); prepare(); setOnCompletionListener { playing = false; progress = 0f } } }.getOrNull() }
    }
    DisposableEffect(player) { onDispose { player?.release() } }
    LaunchedEffect(playing, player) {
        while (playing && player != null) {
            progress = player.currentPosition.toFloat() / player.duration.coerceAtLeast(1)
            delay(100)
        }
    }
    LaunchedEffect(player) { if (player != null && state is MediaUi.Ready) { player.start(); playing = true } }
    Row(Modifier.widthIn(min = 220.dp).padding(bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        IconButton(onClick = {
            when {
                player == null -> if (media.available) onOpen(true)
                playing -> { player.pause(); playing = false }
                else -> { player.playbackParams = player.playbackParams.setSpeed(speed); player.start(); playing = true }
            }
        }) {
            when {
                state is MediaUi.Loading -> CircularProgressIndicator(Modifier.size(24.dp), strokeWidth = 2.dp)
                playing -> Icon(Icons.Rounded.Pause, stringResource(R.string.media_pause))
                else -> Icon(Icons.Rounded.PlayArrow, stringResource(R.string.media_play))
            }
        }
        Column(Modifier.weight(1f)) {
            LinearProgressIndicator(progress = { progress }, modifier = Modifier.fillMaxWidth().height(4.dp).clip(RoundedCornerShape(2.dp)))
            Spacer(Modifier.height(4.dp))
            Text(
                listOfNotNull(
                    if (!media.available) stringResource(R.string.media_unavailable) else null,
                    (state as? MediaUi.Failed)?.message,
                    media.seconds?.let { "%d:%02d".format(it.toInt() / 60, it.toInt() % 60) },
                ).joinToString(" · "),
                style = MaterialTheme.typography.labelSmall, color = androidx.compose.material3.LocalContentColor.current.copy(alpha = 0.75f),
            )
        }
        Text(
            "${if (speed % 1f == 0f) speed.toInt() else speed}×",
            style = MaterialTheme.typography.labelMedium, color = Zuri.colors.ctx,
            modifier = Modifier.padding(start = 6.dp).clip(RoundedCornerShape(50)).clickable {
                speed = when (speed) { 1f -> 1.5f; 1.5f -> 2f; else -> 1f }
                if (playing) player?.let { it.playbackParams = it.playbackParams.setSpeed(speed) }
            }.padding(horizontal = 8.dp, vertical = 6.dp),
        )
    }
}

@Composable
private fun DocumentMedia(media: MessageMedia, state: MediaUi?, onOpen: (Boolean) -> Unit) {
    val ctx = LocalContext.current
    val ready = state as? MediaUi.Ready
    LaunchedEffect(ready?.path) { if (ready != null) openExternally(ctx, ready) }
    Row(
        Modifier.padding(bottom = 4.dp).widthIn(min = 220.dp).clip(RoundedCornerShape(12.dp)).background(Color.Black.copy(alpha = 0.22f))
            .clickable(enabled = media.available) { if (ready != null) openExternally(ctx, ready) else onOpen(true) }.padding(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (state is MediaUi.Loading) CircularProgressIndicator(Modifier.size(28.dp), strokeWidth = 2.dp)
        else Icon(Icons.Rounded.Description, null, tint = Zuri.colors.ctx, modifier = Modifier.size(28.dp))
        Spacer(Modifier.width(10.dp))
        Column {
            Text(media.fileName ?: stringResource(app.zuri.android.domain.inbox.PlaceholderKind.DOCUMENT.label()), style = MaterialTheme.typography.bodyMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(
                listOfNotNull(
                    media.pageCount?.let { stringResource(R.string.media_pages, it) },
                    media.sizeBytes?.let { Formatter.formatShortFileSize(ctx, it) },
                    if (!media.available) stringResource(R.string.media_unavailable) else null,
                    (state as? MediaUi.Failed)?.message,
                ).joinToString(" · "),
                style = MaterialTheme.typography.labelSmall, color = androidx.compose.material3.LocalContentColor.current.copy(alpha = 0.75f),
            )
        }
    }
}

@Composable
internal fun LocationBlock(p: GeoPoint) {
    val ctx = LocalContext.current
    Row(
        Modifier.padding(bottom = 4.dp).clip(RoundedCornerShape(12.dp)).background(Color.Black.copy(alpha = 0.22f))
            .clickable {
                val label = Uri.encode(p.name ?: "${p.lat},${p.lng}")
                runCatching { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("geo:${p.lat},${p.lng}?q=${p.lat},${p.lng}($label)"))) }
            }.padding(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Rounded.Place, null, tint = Zuri.colors.bad, modifier = Modifier.size(28.dp))
        Spacer(Modifier.width(8.dp))
        Column {
            Text(p.name ?: stringResource(app.zuri.android.domain.inbox.PlaceholderKind.LOCATION.label()), style = MaterialTheme.typography.bodyMedium)
            p.address?.let { Text(it, style = MaterialTheme.typography.labelSmall, color = androidx.compose.material3.LocalContentColor.current.copy(alpha = 0.75f), maxLines = 2) }
        }
    }
}

/** One chip per emoji with a count; the owner's own reaction is highlighted. */
@Composable
internal fun ReactionChips(reactions: List<Reaction>, mine: Boolean) {
    val groups = reactions.groupBy { it.emoji }
    Row(Modifier.padding(top = 2.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        groups.forEach { (emoji, rs) ->
            val own = rs.any { it.fromMe }
            Text(
                if (rs.size > 1) "$emoji ${rs.size}" else emoji,
                style = MaterialTheme.typography.labelMedium,
                modifier = Modifier.clip(RoundedCornerShape(50))
                    .background(if (own) Zuri.colors.ctxWeak else Zuri.colors.surface3)
                    .padding(horizontal = 8.dp, vertical = 3.dp),
            )
        }
    }
}

@Composable
internal fun Ticks(status: DeliveryStatus?) {
    val (icon, tint) = when (status) {
        DeliveryStatus.READ -> Icons.Rounded.DoneAll to Color(0xFF34B7F1)
        DeliveryStatus.DELIVERED -> Icons.Rounded.DoneAll to Zuri.colors.faint
        DeliveryStatus.SENT -> Icons.Rounded.Done to Zuri.colors.faint
        DeliveryStatus.SENDING -> Icons.Rounded.Schedule to Zuri.colors.faint
        DeliveryStatus.FAILED -> Icons.Rounded.ErrorOutline to Zuri.colors.bad
        null -> return
    }
    Icon(icon, null, tint = tint, modifier = Modifier.padding(start = 3.dp).size(15.dp))
}

/** Full-screen photo or video. */
@Composable
internal fun MediaViewer(ready: MediaUi.Ready, kind: MediaKind, onClose: () -> Unit) {
    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Box(Modifier.fillMaxSize().background(Color.Black), contentAlignment = Alignment.Center) {
            if (kind == MediaKind.VIDEO) {
                AndroidView({ ctx -> VideoView(ctx).apply { setVideoPath(ready.path); setMediaController(android.widget.MediaController(ctx).also { it.setAnchorView(this) }); start() } },
                    Modifier.fillMaxWidth())
            } else {
                val bmp by produceState<ImageBitmap?>(null, ready.path) { value = withContext(Dispatchers.IO) { decodeSampled(ready.path, 2048) } }
                bmp?.let { Image(it, null, contentScale = ContentScale.Fit, modifier = Modifier.fillMaxSize()) }
            }
            IconButton(onClick = onClose, modifier = Modifier.align(Alignment.TopEnd).padding(12.dp)) {
                Icon(Icons.Rounded.Close, stringResource(R.string.close), tint = Color.White)
            }
        }
    }
}

private fun decodeThumb(b64: String): ImageBitmap? = runCatching {
    val bytes = Base64.decode(b64, Base64.DEFAULT)
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap()
}.getOrNull()

private fun decodeSampled(path: String, maxSide: Int): ImageBitmap? = runCatching {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(path, bounds)
    var sample = 1
    while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= maxSide) sample *= 2
    BitmapFactory.decodeFile(path, BitmapFactory.Options().apply { inSampleSize = sample; inPreferredConfig = Bitmap.Config.ARGB_8888 })?.asImageBitmap()
}.getOrNull()

private fun openExternally(ctx: android.content.Context, ready: MediaUi.Ready) {
    runCatching {
        val uri = FileProvider.getUriForFile(ctx, ctx.packageName + ".media", File(ready.path))
        ctx.startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(uri, ready.mime ?: "*/*").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION))
    }
}
