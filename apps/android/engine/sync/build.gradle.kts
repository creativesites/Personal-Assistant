// Cloud sync engine (M7–M9, D-21): applies the server's change feed to the phone's database,
// pages older history, caches media encrypted, and owns the cloud account binding.
plugins {
    alias(libs.plugins.android.library)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
    alias(libs.plugins.hilt)
}

android {
    namespace = "app.zuri.android.engine.sync"
    compileSdk { version = release(providers.gradleProperty("zuri.compileSdk").get().toInt()) { minorApiLevel = providers.gradleProperty("zuri.compileSdkMinor").get().toInt() } }
    defaultConfig { minSdk = providers.gradleProperty("zuri.minSdk").get().toInt() }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    testOptions { unitTests { isIncludeAndroidResources = true; all { it.maxHeapSize = "2g" } } }
}

dependencies {
    implementation(project(":domain"))
    implementation(project(":core:common"))
    implementation(project(":core:security"))
    implementation(project(":data:local"))
    implementation(project(":data:remote"))
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.room.runtime)
    implementation(libs.androidx.room.ktx)
    implementation(libs.androidx.work.runtime)
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.androidx.lifecycle.process)
    implementation(libs.tink.android)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.hilt.android)
    ksp(libs.hilt.compiler)

    testImplementation(libs.junit4)
    testImplementation(libs.truth)
    testImplementation(libs.robolectric)
    testImplementation(libs.androidx.test.core)
    testImplementation(libs.kotlinx.coroutines.test)
}
