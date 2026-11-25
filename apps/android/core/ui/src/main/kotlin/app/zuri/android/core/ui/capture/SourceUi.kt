package app.zuri.android.core.ui.capture

import androidx.annotation.StringRes
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AddReaction
import androidx.compose.material.icons.rounded.Block
import androidx.compose.material.icons.rounded.ContactPage
import androidx.compose.material.icons.rounded.Description
import androidx.compose.material.icons.rounded.EmojiEmotions
import androidx.compose.material.icons.rounded.Gif
import androidx.compose.material.icons.rounded.GraphicEq
import androidx.compose.material.icons.rounded.Image
import androidx.compose.material.icons.rounded.LocationOn
import androidx.compose.material.icons.rounded.Mic
import androidx.compose.material.icons.rounded.Password
import androidx.compose.material.icons.rounded.Poll
import androidx.compose.material.icons.rounded.PhoneMissed
import androidx.compose.material.icons.rounded.Videocam
import androidx.compose.material.icons.rounded.VisibilityOff
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.zuri.android.core.ui.R
import app.zuri.android.core.ui.theme.Zuri
import app.zuri.android.domain.capture.SourceKind
import app.zuri.android.domain.inbox.PlaceholderKind

@StringRes
fun SourceKind.label(): Int = when (this) {
    SourceKind.WHATSAPP -> R.string.source_whatsapp
    SourceKind.WHATSAPP_BUSINESS -> R.string.source_whatsapp_business
    SourceKind.TELEGRAM -> R.string.source_telegram
    SourceKind.SIGNAL -> R.string.source_signal
    SourceKind.MESSENGER -> R.string.source_messenger
    SourceKind.SLACK -> R.string.source_slack
    SourceKind.GMAIL -> R.string.source_gmail
    SourceKind.GOOGLE_MESSAGES -> R.string.source_google_messages
    SourceKind.SAMSUNG_MESSAGES -> R.string.source_samsung_messages
}

/** Neutral two-letter marks: Zuri doesn't reproduce other apps' logos. */
private fun SourceKind.mark(): String = when (this) {
    SourceKind.WHATSAPP -> "WA"
    SourceKind.WHATSAPP_BUSINESS -> "WB"
    SourceKind.TELEGRAM -> "TG"
    SourceKind.SIGNAL -> "SI"
    SourceKind.MESSENGER -> "MS"
    SourceKind.SLACK -> "SL"
    SourceKind.GMAIL -> "GM"
    SourceKind.GOOGLE_MESSAGES -> "SM"
    SourceKind.SAMSUNG_MESSAGES -> "SS"
}

@Composable
fun SourceMark(kind: SourceKind, modifier: Modifier = Modifier, size: Dp = 40.dp) {
    val c = Zuri.colors
    Box(
        modifier.size(size).clip(RoundedCornerShape(size * 0.32f)).background(c.surface3).clearAndSetSemantics { },
        contentAlignment = Alignment.Center,
    ) {
        Text(kind.mark(), color = c.ctxInk, fontWeight = FontWeight.Bold, fontSize = (size.value * 0.34f).sp)
    }
}

@StringRes
fun PlaceholderKind.label(): Int = when (this) {
    PlaceholderKind.PHOTO -> R.string.placeholder_photo
    PlaceholderKind.VIDEO -> R.string.placeholder_video
    PlaceholderKind.VOICE_NOTE -> R.string.placeholder_voice_note
    PlaceholderKind.AUDIO -> R.string.placeholder_audio
    PlaceholderKind.DOCUMENT -> R.string.placeholder_document
    PlaceholderKind.STICKER -> R.string.placeholder_sticker
    PlaceholderKind.GIF -> R.string.placeholder_gif
    PlaceholderKind.LOCATION -> R.string.placeholder_location
    PlaceholderKind.CONTACT_CARD -> R.string.placeholder_contact_card
    PlaceholderKind.POLL -> R.string.placeholder_poll
    PlaceholderKind.DELETED -> R.string.placeholder_deleted
    PlaceholderKind.OTP_HIDDEN -> R.string.placeholder_otp_hidden
    PlaceholderKind.CONTENT_HIDDEN -> R.string.placeholder_content_hidden
    PlaceholderKind.MISSED_CALL -> R.string.placeholder_missed_call
    PlaceholderKind.REACTION -> R.string.placeholder_reaction
}

/** A short explanation of why the content isn't there, for placeholders where that's not obvious. */
@StringRes
fun PlaceholderKind.note(): Int? = when (this) {
    PlaceholderKind.PHOTO, PlaceholderKind.VIDEO, PlaceholderKind.VOICE_NOTE, PlaceholderKind.AUDIO,
    PlaceholderKind.DOCUMENT, PlaceholderKind.GIF, PlaceholderKind.STICKER -> R.string.placeholder_note_media
    PlaceholderKind.OTP_HIDDEN -> R.string.placeholder_note_otp
    PlaceholderKind.CONTENT_HIDDEN -> R.string.placeholder_note_hidden
    else -> null
}

fun PlaceholderKind.icon(): ImageVector = when (this) {
    PlaceholderKind.PHOTO -> Icons.Rounded.Image
    PlaceholderKind.VIDEO -> Icons.Rounded.Videocam
    PlaceholderKind.VOICE_NOTE -> Icons.Rounded.Mic
    PlaceholderKind.AUDIO -> Icons.Rounded.GraphicEq
    PlaceholderKind.DOCUMENT -> Icons.Rounded.Description
    PlaceholderKind.STICKER -> Icons.Rounded.EmojiEmotions
    PlaceholderKind.GIF -> Icons.Rounded.Gif
    PlaceholderKind.LOCATION -> Icons.Rounded.LocationOn
    PlaceholderKind.CONTACT_CARD -> Icons.Rounded.ContactPage
    PlaceholderKind.POLL -> Icons.Rounded.Poll
    PlaceholderKind.DELETED -> Icons.Rounded.Block
    PlaceholderKind.OTP_HIDDEN -> Icons.Rounded.Password
    PlaceholderKind.CONTENT_HIDDEN -> Icons.Rounded.VisibilityOff
    PlaceholderKind.MISSED_CALL -> Icons.Rounded.PhoneMissed
    PlaceholderKind.REACTION -> Icons.Rounded.AddReaction
}
