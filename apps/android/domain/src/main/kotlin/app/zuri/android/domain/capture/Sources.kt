package app.zuri.android.domain.capture

/**
 * What a source app's notifications can actually give Zuri (ANDROID_FEASIBILITY.md §2). The
 * Sources screen shows these honestly, so nobody expects more than a notification carries.
 */
data class SourceCapabilities(
    /** Group chats are recognisable as groups, with the sender of each message. */
    val groups: Boolean,
    /** Photos, voice notes and files appear only as labels ("Photo"), never the media itself. */
    val mediaAsLabelsOnly: Boolean = true,
    /** The app often hides message text (an in-app privacy setting or its default). */
    val contentOftenHidden: Boolean = false,
    /** Android may hide one-time codes in this app's notifications (Android 15+). */
    val otpRedaction: Boolean = false,
    /** Only some messages notify (mentions, direct messages, or unmuted chats). */
    val partialByDesign: Boolean = false,
)

/**
 * The sources Zuri has an adapter for (ARCHITECTURE.md §5.2). Each one is off until the user turns
 * it on; packages that aren't listed here are never read. Display names live in string resources.
 */
enum class SourceKind(val packages: Set<String>, val capabilities: SourceCapabilities) {
    WHATSAPP(setOf("com.whatsapp"), SourceCapabilities(groups = true)),
    WHATSAPP_BUSINESS(setOf("com.whatsapp.w4b"), SourceCapabilities(groups = true)),
    TELEGRAM(
        setOf("org.telegram.messenger", "org.telegram.messenger.web", "org.thunderdog.challegram"),
        SourceCapabilities(groups = true, partialByDesign = true),
    ),
    SIGNAL(setOf("org.thoughtcrime.securesms"), SourceCapabilities(groups = true, contentOftenHidden = true)),
    MESSENGER(setOf("com.facebook.orca"), SourceCapabilities(groups = true)),
    SLACK(setOf("com.Slack"), SourceCapabilities(groups = true, partialByDesign = true)),
    GMAIL(setOf("com.google.android.gm"), SourceCapabilities(groups = false, partialByDesign = true)),
    GOOGLE_MESSAGES(setOf("com.google.android.apps.messaging"), SourceCapabilities(groups = true, otpRedaction = true)),
    SAMSUNG_MESSAGES(setOf("com.samsung.android.messaging"), SourceCapabilities(groups = true, otpRedaction = true)),
    ;

    companion object {
        private val byPackage: Map<String, SourceKind> = entries.flatMap { k -> k.packages.map { it to k } }.toMap()
        fun forPackage(pkg: String): SourceKind? = byPackage[pkg]
        val allPackages: Set<String> get() = byPackage.keys
    }
}

/** The user's choices for one source. */
data class SourceSetting(
    val kind: SourceKind,
    val enabled: Boolean = false,
    /** Kept and shown, but never analysed (ARCHITECTURE.md §5.4). Analysis arrives in M4. */
    val storeOnly: Boolean = false,
    /** Messages older than this are deleted; null keeps them until the user deletes them. */
    val retentionDays: Int? = null,
)

/** Retention choices offered in the UI. */
object RetentionOptions {
    val days: List<Int?> = listOf(30, 90, 365, null)
}
