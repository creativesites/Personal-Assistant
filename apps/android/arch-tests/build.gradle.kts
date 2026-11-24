// Architecture rules enforced in CI with Konsist (ARCHITECTURE.md §3.1, SECURITY_AND_PRIVACY.md §4).
plugins { alias(libs.plugins.kotlin.jvm) }

java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}
kotlin { compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) } }

dependencies {
    testImplementation(libs.konsist)
    testImplementation(libs.junit4)
    testImplementation(libs.truth)
}

tasks.test {
    // Konsist reads source files relative to the project root.
    workingDir = rootProject.projectDir
}
