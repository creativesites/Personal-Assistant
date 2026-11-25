package app.zuri.android.core.common

/** Injectable time source so time-dependent logic (app lock, briefs, cadence) is testable. */
fun interface Clock {
    fun nowMillis(): Long

    companion object {
        val System: Clock = Clock { java.lang.System.currentTimeMillis() }
    }
}
