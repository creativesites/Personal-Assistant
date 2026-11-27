package app.zuri.android.data.local.db

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * JSON stored in message.quoted / media / reactions / location for messages that came from the
 * cloud (D-21). Written by the sync engine, read by the inbox repository.
 */
object CloudJson {
    val json = Json { ignoreUnknownKeys = true; explicitNulls = false; encodeDefaults = false }

    @Serializable data class Quoted(
        /** The server's id of the quoted message, when the server stores it. */
        val remoteId: String? = null,
        val waId: String,
        val fromMe: Boolean? = null,
        val senderName: String? = null,
        val type: String = "text",
        val text: String? = null,
        val deleted: Boolean = false,
    )

    @Serializable data class Media(
        val kind: String,
        val mime: String? = null,
        val size: Long? = null,
        val width: Int? = null,
        val height: Int? = null,
        val seconds: Double? = null,
        val voiceNote: Boolean = false,
        val roundVideo: Boolean = false,
        val gif: Boolean = false,
        val animated: Boolean = false,
        val fileName: String? = null,
        val pageCount: Int? = null,
        /** Base64 JPEG, a few KB: shown blurred until the file is downloaded. */
        val thumbnail: String? = null,
        val available: Boolean = true,
        /** Server path to fetch the file from (Bearer). */
        val path: String,
    )

    @Serializable data class Reaction(val emoji: String, val fromMe: Boolean = false, val reactor: String? = null, val at: Long = 0)

    @Serializable data class Location(val lat: Double, val lng: Double, val name: String? = null, val address: String? = null)

    fun quoted(s: String?): Quoted? = s?.let { runCatching { json.decodeFromString(Quoted.serializer(), it) }.getOrNull() }
    fun media(s: String?): Media? = s?.let { runCatching { json.decodeFromString(Media.serializer(), it) }.getOrNull() }
    fun reactions(s: String?): List<Reaction> = s?.let { runCatching { json.decodeFromString(kotlinx.serialization.builtins.ListSerializer(Reaction.serializer()), it) }.getOrNull() } ?: emptyList()
    fun location(s: String?): Location? = s?.let { runCatching { json.decodeFromString(Location.serializer(), it) }.getOrNull() }
}
