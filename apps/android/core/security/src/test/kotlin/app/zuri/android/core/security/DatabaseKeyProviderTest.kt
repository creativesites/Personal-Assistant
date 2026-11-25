package app.zuri.android.core.security

import app.zuri.android.core.security.keys.DatabaseKeyProvider
import app.zuri.android.core.security.keys.KeyProtection
import app.zuri.android.core.security.keys.KeyUnavailableException
import app.zuri.android.core.security.keys.KeyWrapper
import com.google.common.truth.Truth.assertThat
import java.io.File
import java.nio.file.Files
import org.junit.Assert.assertThrows
import org.junit.Test

/** A stand-in for the Keystore wrapper: reversible, and fails like a lost hardware key when told to. */
private class FakeWrapper : KeyWrapper {
    var broken = false
    override fun wrap(plaintext: ByteArray) = byteArrayOf(0x5A) + plaintext.map { (it.toInt() xor 0x77).toByte() }
    override fun unwrap(blob: ByteArray): ByteArray {
        if (broken) throw KeyUnavailableException("gone")
        return blob.drop(1).map { (it.toInt() xor 0x77).toByte() }.toByteArray()
    }
    override val protection = KeyProtection.Software
}

class DatabaseKeyProviderTest {
    private val dir: File = Files.createTempDirectory("zuri-keys").toFile()
    private val file = File(dir, "keys/db.key.wrapped")

    @Test fun createsA256BitKeyAndReusesIt() {
        val provider = DatabaseKeyProvider(file, FakeWrapper())
        val first = provider.getOrCreate()
        assertThat(first).hasLength(32)
        assertThat(DatabaseKeyProvider(file, FakeWrapper()).getOrCreate()).isEqualTo(first)
    }

    @Test fun storesOnlyTheWrappedForm() {
        val key = DatabaseKeyProvider(file, FakeWrapper()).getOrCreate()
        assertThat(file.readBytes().toList()).doesNotContain(key.toList())
        assertThat(file.readBytes()).isNotEqualTo(key)
    }

    @Test fun refusesToReplaceAKeyItCannotUnwrap() {
        val wrapper = FakeWrapper()
        DatabaseKeyProvider(file, wrapper).getOrCreate()
        val before = file.readBytes()
        wrapper.broken = true
        assertThrows(KeyUnavailableException::class.java) { DatabaseKeyProvider(file, wrapper).getOrCreate() }
        assertThat(file.readBytes()).isEqualTo(before)
    }
}
