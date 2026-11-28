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
    ":data:remote",
    ":engine:sync",
    ":engine:ingest",
    ":engine:perception",
    ":engine:retrieval",
    ":core-ai",
    ":core-ai:remote",
    ":feature:onboarding",
    ":feature:today",
    ":feature:settings",
    ":feature:sources",
    ":feature:inbox",
    ":feature:people",
    ":feature:models",
    ":feature:memory",
    ":feature:ask",
    ":arch-tests",
)
