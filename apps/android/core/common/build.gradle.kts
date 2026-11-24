// Platform-light shared utilities: ids, clock, dispatchers, redacting logger.
plugins { alias(libs.plugins.android.library) }

android {
    namespace = "app.zuri.android.core.common"
    compileSdk { version = release(providers.gradleProperty("zuri.compileSdk").get().toInt()) }
    defaultConfig {
        minSdk = providers.gradleProperty("zuri.minSdk").get().toInt()
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures { compose = false }
    testOptions {
        unitTests {
            isIncludeAndroidResources = true
            all { it.maxHeapSize = "2g" }
        }
    }
}

dependencies {
    api(libs.kotlinx.coroutines.android)
    testImplementation(libs.junit4)
    testImplementation(libs.truth)
}
