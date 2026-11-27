// The Zuri cloud API (M7–M9): sign-in via Clerk, the sync feed and media downloads.
// With core-ai/remote, the only module allowed to open network connections (architecture test).
plugins {
    alias(libs.plugins.android.library)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
    alias(libs.plugins.hilt)
}

android {
    namespace = "app.zuri.android.data.remote"
    compileSdk { version = release(providers.gradleProperty("zuri.compileSdk").get().toInt()) { minorApiLevel = providers.gradleProperty("zuri.compileSdkMinor").get().toInt() } }
    defaultConfig {
        minSdk = providers.gradleProperty("zuri.minSdk").get().toInt()
        buildConfigField("String", "API_BASE_URL", "\"${providers.gradleProperty("zuri.apiBaseUrl").get()}\"")
        buildConfigField("String", "CLERK_PUBLISHABLE_KEY", "\"${providers.gradleProperty("zuri.clerkPublishableKey").get()}\"")
    }
    buildFeatures { buildConfig = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation(project(":domain"))
    implementation(project(":core:common"))
    implementation(project(":core:security"))
    implementation(libs.okhttp)
    implementation(libs.clerk.android.api)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.hilt.android)
    ksp(libs.hilt.compiler)

    testImplementation(libs.junit4)
    testImplementation(libs.truth)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.okhttp.mockwebserver)
}
