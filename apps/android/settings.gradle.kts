pluginManagement {
    repositories {
        google {
            content {
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "ZuriAndroid"

include(
    ":app",
    ":domain",
    ":core:common",
    ":core:ui",
    ":core:security",
    ":data:local",
    ":engine:ingest",
    ":feature:onboarding",
    ":feature:today",
    ":feature:settings",
    ":feature:sources",
    ":feature:inbox",
    ":arch-tests",
)
