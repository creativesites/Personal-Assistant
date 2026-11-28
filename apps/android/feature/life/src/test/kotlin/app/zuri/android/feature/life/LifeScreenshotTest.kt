package app.zuri.android.feature.life

import androidx.compose.runtime.Composable
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import app.zuri.android.core.ui.theme.ZuriTheme
import app.zuri.android.core.ui.universe.SpaceBackground
import app.zuri.android.domain.inbox.ConversationId
import app.zuri.android.domain.people.Encounter
import app.zuri.android.domain.people.Goal
import app.zuri.android.domain.people.GoalPerson
import app.zuri.android.domain.people.GoalStatus
import app.zuri.android.domain.people.Note
import app.zuri.android.domain.people.TimelineEntry
import app.zuri.android.domain.people.TimelineKind
import app.zuri.android.domain.workspace.WorkspaceId
import com.github.takahirom.roborazzi.captureRoboImage
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** Trajectory, Goals, Life Timeline and Notes in both skies. Invented data. */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w411dp-h891dp-xxhdpi")
class LifeScreenshotTest {
    @get:Rule val compose = createComposeRule()
    private fun shot(name: String, dark: Boolean, content: @Composable () -> Unit) {
        compose.setContent { ZuriTheme(darkTheme = dark) { SpaceBackground { content() } } }
        compose.onRoot().captureRoboImage("src/test/screenshots/$name.png")
    }

    private val now = System.currentTimeMillis()
    private val encounters = listOf(
        Encounter.Event(now + 3_600_000, "Lunch at Mum's", "Mum", true, ConversationId("m")),
        Encounter.PromiseDue(now + 5_000_000, "Send the revised quote", "Chanda Mwila", ConversationId("c")),
        Encounter.CheckIn(now + 86_400_000, "Bwalya", ConversationId("b")),
        Encounter.Device(now + 2 * 86_400_000, "Dentist", false, "Cairo Road", "Personal"),
    )
    private val goals = listOf(
        Goal("g1", WorkspaceId("ws"), "Call Mum every Sunday", "Stay close while she recovers", null, 60, GoalStatus.ACTIVE,
            listOf(GoalPerson(ConversationId("m"), "Mum")), now),
        Goal("g2", WorkspaceId("ws"), "Land three new irrigation clients", null, null, 100, GoalStatus.ACHIEVED, emptyList(), now),
    )
    private val timeline = listOf(
        TimelineEntry(TimelineKind.WARMER, "Natasha", "62 → 81", now - 3_600_000, ConversationId("n")),
        TimelineEntry(TimelineKind.PROMISE_KEPT, "Send the photos", "Mum", now - 86_400_000, ConversationId("m")),
        TimelineEntry(TimelineKind.GOAL_ACHIEVED, "Land three new irrigation clients", null, now - 9 * 86_400_000, null),
    )

    @Test fun trajectoryDark() = shot("trajectory_dark", true) { TrajectoryContent(encounters, calendarAccess = false, onBack = {}) }
    @Test fun trajectoryLight() = shot("trajectory_light", false) { TrajectoryContent(encounters, calendarAccess = true, onBack = {}) }
    @Test fun goalsDark() = shot("goals_dark", true) { GoalsContent(goals, onBack = {}) }
    @Test fun timelineDark() = shot("timeline_dark", true) { TimelineContent(timeline, onBack = {}) }
    @Test fun notesLight() = shot("notes_light", false) { NotesContent(listOf(Note("n1", WorkspaceId("ws"), "Gift ideas for Mum", "Shawl, the blue one from Arcades", true, now)), onBack = {}) }
}
