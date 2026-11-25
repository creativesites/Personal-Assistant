package app.zuri.android.core.common

import android.util.Log

/**
 * The only logger Zuri code may use (enforced by arch-tests). It logs structured events with
 * redacted field values: never message bodies, names, numbers or tokens
 * (SECURITY_AND_PRIVACY.md §3.6).
 */
object ZuriLog {
    fun interface Sink {
        fun write(priority: Int, tag: String, line: String)
    }

    @Volatile
    var sink: Sink = Sink { priority, tag, line -> Log.println(priority, tag, line) }

    fun i(tag: String, event: String, vararg fields: Pair<String, Any?>) = emit(Log.INFO, tag, event, fields)
    fun w(tag: String, event: String, vararg fields: Pair<String, Any?>) = emit(Log.WARN, tag, event, fields)
    fun e(tag: String, event: String, error: Throwable? = null, vararg fields: Pair<String, Any?>) {
        val all: Array<out Pair<String, Any?>> = if (error != null) arrayOf(*fields, "error" to error.javaClass.simpleName) else fields
        emit(Log.ERROR, tag, event, all)
    }

    internal fun format(event: String, fields: Array<out Pair<String, Any?>>): String =
        buildString {
            append(Redactor.redact(event))
            fields.forEach { (k, v) -> append(' ').append(k).append('=').append(Redactor.redact(v.toString())) }
        }

    private fun emit(priority: Int, tag: String, event: String, fields: Array<out Pair<String, Any?>>) {
        sink.write(priority, "Zuri/$tag", format(event, fields))
    }
}

/** Removes data that must never reach logs or crash reports. */
object Redactor {
    private const val MAX_VALUE = 80
    private val patterns = listOf(
        Regex("eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]*") to "[jwt]",
        Regex("(?i)\\b(bearer|sk|pk|key|token)[-_ ]?[A-Za-z0-9_-]{16,}") to "[secret]",
        Regex("[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}") to "[email]",
        Regex("\\+?\\d[\\d ()-]{7,}\\d") to "[number]",
        Regex("\\d{6,}") to "[number]",
    )

    fun redact(value: String): String {
        var out = value
        patterns.forEach { (regex, replacement) -> out = regex.replace(out, replacement) }
        return if (out.length > MAX_VALUE) out.take(MAX_VALUE) + "…" else out
    }
}
