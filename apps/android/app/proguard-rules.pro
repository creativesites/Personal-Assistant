# SQLCipher loads native code through JNI and reflection.
-keep class net.zetetic.database.** { *; }
-keep class net.zetetic.database.sqlcipher.** { *; }
# Strip verbose/debug logging calls from release builds (SECURITY_AND_PRIVACY.md §3.6).
-assumenosideeffects class android.util.Log {
    public static int v(...);
    public static int d(...);
}
