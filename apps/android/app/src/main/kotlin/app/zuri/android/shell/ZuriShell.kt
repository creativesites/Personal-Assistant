package app.zuri.android.shell

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Apps
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.Forum
import androidx.compose.material.icons.rounded.Group
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.Today
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.adaptive.navigationsuite.NavigationSuiteScaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.navigation.NavDestination.Companion.hasRoute
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import app.zuri.android.AppState
import app.zuri.android.R
import app.zuri.android.core.ui.components.RootTopBar
import app.zuri.android.domain.workspace.WorkspaceAccent
import app.zuri.android.domain.workspace.WorkspaceId
import app.zuri.android.feature.models.ModelsRoute
import app.zuri.android.feature.settings.LedgerRoute
import app.zuri.android.feature.settings.PrivacyCenterRoute
import app.zuri.android.feature.settings.SecurityRoute
import app.zuri.android.feature.settings.SettingsRoute
import app.zuri.android.feature.inbox.ConversationRoute
import app.zuri.android.feature.inbox.InboxRoute
import app.zuri.android.feature.sources.SourcesRoute
import app.zuri.android.feature.today.TodayRoute
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlin.reflect.KClass
import kotlinx.serialization.Serializable

@Serializable data object TodayDest
@Serializable data object InboxDest
@Serializable data object PeopleDest
@Serializable data object AskDest
@Serializable data object MoreDest
@Serializable data object SettingsDest
@Serializable data object SecurityDest
@Serializable data object PrivacyDest
@Serializable data object SourcesDest
@Serializable data class ConversationDest(val id: String)
@Serializable data object ModelsDest
@Serializable data object LedgerDest

private data class Tab(val route: Any, val type: KClass<*>, val icon: ImageVector, val label: Int)

private val tabs = listOf(
    Tab(TodayDest, TodayDest::class, Icons.Rounded.Today, R.string.nav_today),
    Tab(InboxDest, InboxDest::class, Icons.Rounded.Forum, R.string.nav_inbox),
    Tab(PeopleDest, PeopleDest::class, Icons.Rounded.Group, R.string.nav_people),
    Tab(AskDest, AskDest::class, Icons.Rounded.AutoAwesome, R.string.nav_ask),
    Tab(MoreDest, MoreDest::class, Icons.Rounded.Apps, R.string.nav_more),
)

/**
 * The app shell (ARCHITECTURE.md §2). Root tabs share the context-tinted top bar and an adaptive
 * navigation suite (bottom bar on phones, rail on larger windows); detail screens are full screen.
 * Business navigation (Studio, Documents) arrives with Business Studio (M10).
 */
@Composable
fun ZuriShell(
    state: AppState.Ready,
    versionName: String,
    onSwitchWorkspace: (WorkspaceId) -> Unit,
    onCreateBusiness: (String, WorkspaceAccent) -> Unit,
) {
    val nav = rememberNavController()
    var switcherOpen by rememberSaveable { mutableStateOf(false) }

    NavHost(nav, startDestination = TodayDest) {
        composable<TodayDest> {
            RootFrame(nav, state, { switcherOpen = true }) {
                TodayRoute(onOpenPrivacy = { nav.navigate(PrivacyDest) }, onOpenSources = { nav.navigate(SourcesDest) })
            }
        }
        composable<InboxDest> {
            RootFrame(nav, state, { switcherOpen = true }) {
                InboxRoute(onOpenConversation = { nav.navigate(ConversationDest(it.value)) }, onOpenSources = { nav.navigate(SourcesDest) })
            }
        }
        composable<ConversationDest> { Detail { ConversationRoute(onBack = { nav.popBackStack() }) } }
        composable<PeopleDest> { RootFrame(nav, state, { switcherOpen = true }) { PeopleTab() } }
        composable<AskDest> { RootFrame(nav, state, { switcherOpen = true }) { AskTab() } }
        composable<MoreDest> {
            RootFrame(nav, state, { switcherOpen = true }) {
                MoreTab(onSettings = { nav.navigate(SettingsDest) }, onPrivacy = { nav.navigate(PrivacyDest) }, onSecurity = { nav.navigate(SecurityDest) }, onModels = { nav.navigate(ModelsDest) })
            }
        }
        composable<SettingsDest> {
            Detail {
                SettingsRoute(
                    versionName = versionName, onBack = { nav.popBackStack() },
                    onOpenSecurity = { nav.navigate(SecurityDest) }, onOpenPrivacy = { nav.navigate(PrivacyDest) },
                    onOpenSources = { nav.navigate(SourcesDest) },
                )
            }
        }
        composable<SecurityDest> { Detail { SecurityRoute(onBack = { nav.popBackStack() }) } }
        composable<PrivacyDest> { Detail { PrivacyCenterRoute(onBack = { nav.popBackStack() }, onOpenLedger = { nav.navigate(LedgerDest) }) } }
        composable<ModelsDest> { Detail { ModelsRoute(onBack = { nav.popBackStack() }, onOpenLedger = { nav.navigate(LedgerDest) }) } }
        composable<LedgerDest> { Detail { LedgerRoute(onBack = { nav.popBackStack() }) } }
        composable<SourcesDest> { Detail { SourcesRoute(onBack = { nav.popBackStack() }) } }
    }

    if (switcherOpen) {
        ContextSwitcherSheet(
            workspaces = state.workspaces, active = state.active.id,
            onSelect = onSwitchWorkspace, onCreate = onCreateBusiness, onDismiss = { switcherOpen = false },
        )
    }
}

@Composable
private fun Detail(content: @Composable () -> Unit) {
    Box(Modifier.fillMaxSize().navigationBarsPadding()) { content() }
}

@Composable
private fun RootFrame(nav: NavHostController, state: AppState.Ready, onOpenSwitcher: () -> Unit, content: @Composable () -> Unit) {
    val entry by nav.currentBackStackEntryAsState()
    val capture: CaptureIndicatorViewModel = hiltViewModel()
    val captureState by capture.state.collectAsStateWithLifecycle()
    NavigationSuiteScaffold(
        navigationSuiteItems = {
            tabs.forEach { tab ->
                val selected = entry?.destination?.hasRoute(tab.type) == true
                item(
                    selected = selected,
                    onClick = {
                        if (!selected) nav.navigate(tab.route) {
                            popUpTo(TodayDest) { saveState = true }
                            launchSingleTop = true
                            restoreState = true
                        }
                    },
                    icon = { Icon(tab.icon, contentDescription = null) },
                    label = { Text(stringResource(tab.label)) },
                )
            }
        },
    ) {
        Column(Modifier.fillMaxSize()) {
            RootTopBar(
                contextLabel = state.active.name,
                contextIcon = iconFor(state.active),
                captureState = captureState,
                onContextClick = onOpenSwitcher,
                onCaptureClick = { nav.navigate(SourcesDest) },
                actions = {
                    IconButton(onClick = { nav.navigate(SettingsDest) }) { Icon(Icons.Rounded.Settings, stringResource(R.string.settings)) }
                },
            )
            Box(Modifier.weight(1f)) { content() }
        }
    }
}
