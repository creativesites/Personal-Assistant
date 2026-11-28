package app.zuri.android.platform

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.provider.CalendarContract
import app.zuri.android.domain.people.DeviceCalendar
import app.zuri.android.domain.people.Encounter
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * The phone's own calendar, read-only (M6). Read only after the owner grants Calendar access from
 * the Calendar screen, where Zuri explains what it reads; nothing is copied into Zuri's database
 * and nothing leaves the phone.
 */
class AndroidDeviceCalendar(private val context: Context) : DeviceCalendar {
    override fun hasAccess(): Boolean =
        context.checkSelfPermission(Manifest.permission.READ_CALENDAR) == PackageManager.PERMISSION_GRANTED

    override suspend fun events(fromMillis: Long, toMillis: Long): List<Encounter.Device> = withContext(Dispatchers.IO) {
        if (!hasAccess()) return@withContext emptyList()
        val uri = CalendarContract.Instances.CONTENT_URI.buildUpon().also {
            android.content.ContentUris.appendId(it, fromMillis); android.content.ContentUris.appendId(it, toMillis)
        }.build()
        val cols = arrayOf(
            CalendarContract.Instances.BEGIN, CalendarContract.Instances.TITLE, CalendarContract.Instances.ALL_DAY,
            CalendarContract.Instances.EVENT_LOCATION, CalendarContract.Instances.CALENDAR_DISPLAY_NAME,
        )
        context.contentResolver.query(uri, cols, null, null, "${CalendarContract.Instances.BEGIN} ASC")?.use { c ->
            buildList {
                while (c.moveToNext() && size < 200) {
                    add(Encounter.Device(c.getLong(0), c.getString(1) ?: "(No title)", c.getInt(2) == 1, c.getString(3)?.ifBlank { null }, c.getString(4)))
                }
            }
        } ?: emptyList()
    }
}
