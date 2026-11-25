package app.zuri.android.coreai.runtime

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/** Validates the benchmark's extraction answer against its schema, by hand and strictly. */
object StructuredCheck {
    fun isValid(raw: String): Boolean = runCatching {
        val root = Json.parseToJsonElement(raw.trim()) as JsonObject
        val items = root.getValue("commitments").jsonArray
        items.isNotEmpty() && items.all { item ->
            val o = item.jsonObject
            o.getValue("who").jsonPrimitive.isString && o.getValue("what").jsonPrimitive.content.isNotBlank()
        }
    }.getOrDefault(false)
}
