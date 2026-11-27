plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
    alias(libs.plugins.hilt)
    alias(libs.plugins.roborazzi)
}

android {
    // The M4 extraction fixtures are shared with the on-device model eval.
    sourceSets { getByName("androidTest").assets.directories.add("../engine/perception/src/test/resources") }
    namespace = "app.zuri.android"
    compileSdk { version = release(providers.gradleProperty("zuri.compileSdk").get().toInt()) { minorApiLevel = providers.gradleProperty("zuri.compileSdkMinor").get().toInt() } }

    defaultConfig {
        // Placeholder identity until the product name is final (RISKS_AND_OPEN_QUESTIONS.md Q-11).
        applicationId = "app.zuri.android"
        minSdk = providers.gradleProperty("zuri.minSdk").get().toInt()
        targetSdk = providers.gradleProperty("zuri.targetSdk").get().toInt()
        versionCode = 5
        versionName = "0.5.0-m5"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        // On-device evals run against the installed app and its downloaded model only when asked for.
        // arm64 only (DECISIONS.md D-15): on-device models need it, and it keeps the APK small.
        ndk { abiFilters += listOf("arm64-v8a") }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
    testOptions {
        unitTests {
            isIncludeAndroidResources = true
            all { it.maxHeapSize = "2g" }
        }
    }
}

dependencies {
    implementation(project(":domain"))
    implementation(project(":core:common"))
    implementation(project(":core:ui"))
    implementation(project(":core:security"))
    implementation(project(":data:local"))
    implementation(project(":data:remote"))
    implementation(project(":engine:sync"))
    implementation(project(":feature:onboarding"))
    implementation(project(":feature:today"))
    implementation(project(":feature:settings"))
    implementation(project(":feature:sources"))
    implementation(project(":feature:inbox"))
    implementation(project(":engine:ingest"))
    implementation(project(":feature:models"))
    androidTestImplementation(libs.androidx.test.runner)
    androidTestImplementation(libs.androidx.test.ext.junit)
    androidTestImplementation(libs.truth)
    androidTestImplementation(libs.kotlinx.coroutines.test)
    implementation(project(":feature:memory"))
    implementation(project(":feature:ask"))
    implementation(project(":engine:perception"))
    implementation(project(":engine:retrieval"))
    implementation(project(":core-ai"))
    implementation(project(":core-ai:remote"))

    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.core.splashscreen)
    implementation(libs.androidx.fragment)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.process)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.compose.material3.navsuite)
    implementation(libs.androidx.hilt.lifecycle.viewmodel.compose)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.hilt.android)
    ksp(libs.hilt.compiler)

    testImplementation(libs.junit4)
    testImplementation(libs.truth)
    testImplementation(libs.robolectric)
    testImplementation(libs.androidx.test.core)
}
