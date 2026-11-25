// The only module (with the future :data:remote) allowed to open network connections
// (architecture test). It downloads model files; it never sends personal content.
plugins {
    alias(libs.plugins.android.library)
    alias(libs.plugins.ksp)
    alias(libs.plugins.hilt)
}

android {
    namespace = "app.zuri.android.coreai.remote"
    compileSdk { version = release(providers.gradleProperty("zuri.compileSdk").get().toInt()) { minorApiLevel = providers.gradleProperty("zuri.compileSdkMinor").get().toInt() } }
    defaultConfig { minSdk = providers.gradleProperty("zuri.minSdk").get().toInt() }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation(project(":core-ai"))
    implementation(project(":core:common"))
    implementation(libs.okhttp)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.hilt.android)
    ksp(libs.hilt.compiler)

    testImplementation(libs.junit4)
    testImplementation(libs.truth)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.okhttp.mockwebserver)
}
