package app.zuri.android.data.local.db

import java.nio.ByteBuffer
import java.nio.ByteOrder

/** Float vectors stored as little-endian float32 blobs. */
object Vectors {
    fun pack(v: FloatArray): ByteArray = ByteBuffer.allocate(v.size * 4).order(ByteOrder.LITTLE_ENDIAN).apply { v.forEach { putFloat(it) } }.array()

    fun unpack(b: ByteArray): FloatArray {
        val buf = ByteBuffer.wrap(b).order(ByteOrder.LITTLE_ENDIAN)
        return FloatArray(b.size / 4) { buf.getFloat() }
    }

    /** Dot product of unit vectors: cosine similarity. */
    fun cosine(a: FloatArray, b: FloatArray): Float {
        if (a.size != b.size) return 0f
        var s = 0f
        for (i in a.indices) s += a[i] * b[i]
        return s
    }
}
