package app.zuri.android.data.local.db

import java.io.File
import net.zetetic.database.sqlcipher.SQLiteDatabase

/**
 * How the database is keyed.
 *
 * - **Raw key.** The 256-bit key from DatabaseKeyProvider is used directly (`x'<hex>'`), so SQLCipher
 *   skips PBKDF2. Stretching is for human passphrases; ours is already a random Keystore-wrapped key,
 *   and stretching made every new connection take about a second on a Galaxy S20.
 * - **Ownership.** SQLCipher keeps a reference to the key array (it never copies it) and reads it
 *   again for every new connection. The array handed to it must stay intact for the life of the
 *   process: never zero it.
 * - **Migration.** Builds before 2026-11-25 zeroed that array right after building the database, so
 *   every connection keyed with 32 zero bytes run through PBKDF2. Those databases are re-keyed once,
 *   in place, to the real raw key ([migrateIfNeeded]).
 */
object DatabaseKeying {
    private val zeroPassphrase = ByteArray(32)

    /** The `x'…'` form SQLCipher treats as a raw key. Returns a new array the caller hands over. */
    fun rawKey(key: ByteArray): ByteArray {
        require(key.size == 32) { "Expected a 256-bit key" }
        val hex = key.joinToString("") { "%02x".format(it) }
        return "x'$hex'".toByteArray(Charsets.US_ASCII)
    }

    enum class Result { NEW_DATABASE, ALREADY_RAW, MIGRATED_FROM_LEGACY, UNREADABLE }

    /** Re-keys a legacy database to [raw] if needed. Call before Room opens the file. */
    fun migrateIfNeeded(file: File, raw: ByteArray, legacyCandidates: List<ByteArray>): Result {
        if (!file.exists()) return Result.NEW_DATABASE
        if (canOpen(file, raw)) return Result.ALREADY_RAW
        for (legacy in legacyCandidates + listOf(zeroPassphrase)) {
            val db = runCatching { SQLiteDatabase.openDatabase(file.path, legacy, null, SQLiteDatabase.OPEN_READWRITE, null, null) }.getOrNull() ?: continue
            try {
                db.rawQuery("SELECT count(*) FROM sqlite_master").use { it.moveToFirst() }
            } catch (e: Exception) {
                db.close()
                continue
            }
            db.use {
                // Fold the WAL into the main file first; then switch the key. Room turns WAL back on.
                it.rawQuery("PRAGMA journal_mode = DELETE").use { c -> c.moveToFirst() }
                it.rawExecSQL("PRAGMA rekey = \"${String(raw, Charsets.US_ASCII)}\"")
            }
            return if (canOpen(file, raw)) Result.MIGRATED_FROM_LEGACY else Result.UNREADABLE
        }
        return Result.UNREADABLE
    }

    fun canOpen(file: File, key: ByteArray): Boolean = runCatching {
        SQLiteDatabase.openDatabase(file.path, key, null, SQLiteDatabase.OPEN_READONLY, null, null).use { db ->
            db.rawQuery("SELECT count(*) FROM sqlite_master").use { it.moveToFirst() }
        }
    }.getOrDefault(false)

    /** True when the file opens with none of the well-known weak keys: a check of the key, not just the header. */
    fun rejectsWeakKeys(file: File): Boolean =
        file.exists() && listOf(zeroPassphrase, rawKey(ByteArray(32)), ByteArray(0)).none { canOpen(file, it) }
}
