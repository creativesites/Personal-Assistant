// On-device AI (ARCHITECTURE.md §7): model catalog, storage, verified install, device profile.
// Copied and refactored from MeetingMind (see core-ai/PROVENANCE.md). No network code here:
// downloads go through the ModelDownloader interface, implemented in :core-ai:remote.
plugins {
    alias(libs.plugins.android.library)
    alias(libs.plugins.ksp)
    alias(libs.plugins.hilt)
}

android {
    namespace = "app.zuri.android.coreai"
    compileSdk { version = release(providers.gradleProperty("zuri.compileSdk").get().toInt()) { minorApiLevel = providers.gradleProperty("zuri.compileSdkMinor").get().toInt() } }
    defaultConfig { minSdk = providers.gradleProperty("zuri.minSdk").get().toInt() }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    testOptions { unitTests { isIncludeAndroidResources = true; all { it.maxHeapSize = "2g" } } }
}

dependencies {
    api(project(":domain"))
    implementation(project(":core:common"))
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.work.runtime)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.hilt.android)
    ksp(libs.hilt.compiler)

    testImplementation(libs.junit4)
    testImplementation(libs.truth)
    testImplementation(libs.kotlinx.coroutines.test)
}
