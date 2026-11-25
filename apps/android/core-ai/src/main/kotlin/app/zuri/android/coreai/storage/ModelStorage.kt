package app.zuri.android.coreai.storage

import app.zuri.android.domain.ai.ModelSpec
import java.io.File

/**
 * Where models live: `noBackupFilesDir/models/<id>/`, private to the app and never backed up.
 * A model counts as installed only when its file has the catalog size and a marker records the
 * verified checksum. A partial download is `<file>.part` and is never loaded.
 */
class ModelStorage(private val root: File) {
    fun dir(spec: ModelSpec) = File(root, spec.id)
    fun file(spec: ModelSpec) = File(dir(spec), spec.fileName)
    fun partial(spec: ModelSpec) = File(dir(spec), spec.fileName + ".part")
    private fun marker(spec: ModelSpec) = File(dir(spec), ".verified")

    fun isInstalled(spec: ModelSpec): Boolean {
        val f = file(spec)
        val m = marker(spec)
        return f.isFile && f.length() == spec.sizeBytes && m.isFile && m.readText().trim() == spec.sha256
    }

    fun partialBytes(spec: ModelSpec): Long = partial(spec).takeIf { it.isFile }?.length() ?: 0L

    fun markInstalled(spec: ModelSpec) {
        marker(spec).writeText(spec.sha256)
    }

    fun delete(spec: ModelSpec): Boolean = dir(spec).deleteRecursively()

    fun installedPath(spec: ModelSpec): String? = file(spec).takeIf { isInstalled(spec) }?.absolutePath
}
