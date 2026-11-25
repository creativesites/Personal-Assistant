package app.zuri.android.core.security

import app.zuri.android.core.security.secrets.AeadSecretStore
import app.zuri.android.core.security.secrets.CiphertextStorage
import com.google.common.truth.Truth.assertThat
import com.google.crypto.tink.Aead
import java.security.GeneralSecurityException
import org.junit.Assert.assertThrows
import org.junit.Test

/** Toy AEAD binding associated data, enough to test the store's contract without Android Keystore. */
private class ToyAead : Aead {
    override fun encrypt(plaintext: ByteArray, associatedData: ByteArray): ByteArray =
        associatedData.size.toByte().let { byteArrayOf(it) } + associatedData + plaintext.map { (it.toInt() xor 0x3C).toByte() }
    override fun decrypt(ciphertext: ByteArray, associatedData: ByteArray): ByteArray {
        val n = ciphertext[0].toInt()
        if (!ciphertext.copyOfRange(1, 1 + n).contentEquals(associatedData)) throw GeneralSecurityException("ad mismatch")
        return ciphertext.copyOfRange(1 + n, ciphertext.size).map { (it.toInt() xor 0x3C).toByte() }.toByteArray()
    }
}

private class MapStorage : CiphertextStorage {
    val map = mutableMapOf<String, String>()
    override fun write(name: String, value: String) { map[name] = value }
    override fun read(name: String) = map[name]
    override fun delete(name: String) { map.remove(name) }
    override fun deleteAll() = map.clear()
}

class AeadSecretStoreTest {
    private val storage = MapStorage()
    private val store = AeadSecretStore(ToyAead(), storage)

    @Test fun roundTripsWithoutStoringPlaintext() {
        store.put("zuri_jwt", "secret-token-value")
        assertThat(store.get("zuri_jwt")).isEqualTo("secret-token-value")
        assertThat(storage.map.values.single()).doesNotContain("secret-token-value")
    }

    @Test fun ciphertextCannotBeMovedToAnotherName() {
        store.put("a", "value")
        storage.map["b"] = storage.map.getValue("a")
        assertThrows(GeneralSecurityException::class.java) { store.get("b") }
    }

    @Test fun missingIsNull() {
        assertThat(store.get("nothing")).isNull()
    }
}
