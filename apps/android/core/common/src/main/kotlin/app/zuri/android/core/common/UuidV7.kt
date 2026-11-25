package app.zuri.android.core.common

import java.security.SecureRandom

/**
 * RFC 9562 UUID version 7: 48-bit Unix milliseconds, then random bits. Time-ordered, so locally
 * created rows sort by creation time, and compatible with the server's `uuid` primary keys.
 */
object UuidV7 {
    private val random = SecureRandom()

    fun generate(clock: Clock = Clock.System): String = generate(clock.nowMillis(), random)

    internal fun generate(millis: Long, random: java.util.Random): String {
        require(millis in 0..0xFFFF_FFFF_FFFFL) { "timestamp out of range" }
        val bytes = ByteArray(16).also { random.nextBytes(it) }
        for (i in 0 until 6) bytes[i] = (millis ushr (40 - 8 * i)).toByte()
        bytes[6] = ((bytes[6].toInt() and 0x0F) or 0x70).toByte() // version 7
        bytes[8] = ((bytes[8].toInt() and 0x3F) or 0x80).toByte() // variant 10
        val hex = bytes.joinToString("") { "%02x".format(it) }
        return "${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}"
    }

    fun timestampOf(uuid: String): Long = uuid.replace("-", "").substring(0, 12).toLong(16)
}
