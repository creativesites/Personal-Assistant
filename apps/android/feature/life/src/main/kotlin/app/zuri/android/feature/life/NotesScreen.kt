package app.zuri.android.feature.life

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.PushPin
import androidx.compose.material.icons.rounded.StickyNote2
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.zuri.android.core.ui.components.EmptyState
import app.zuri.android.core.ui.theme.Zuri
import app.zuri.android.core.ui.universe.LaunchButton
import app.zuri.android.core.ui.universe.glass
import app.zuri.android.core.ui.universe.rise
import app.zuri.android.core.ui.universe.tiltClickable
import app.zuri.android.domain.people.Note

/** Notes (Knowledge, M6): the owner's own notes, kept on the phone. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotesRoute(onBack: () -> Unit, viewModel: NotesViewModel = hiltViewModel()) {
    val notes by viewModel.list.collectAsStateWithLifecycle()
    var editing by remember { mutableStateOf<Note?>(null) }
    var creating by remember { mutableStateOf(false) }
    NotesContent(notes, onBack, onNew = { creating = true }, onOpen = { editing = it })
    if (creating || editing != null) ModalBottomSheet(onDismissRequest = { creating = false; editing = null }) {
        NoteEditor(editing, onSave = { t, b, p -> viewModel.save(editing?.id, t, b, p); creating = false; editing = null },
            onDelete = editing?.let { n -> { viewModel.delete(n.id); editing = null } })
    }
}

@Composable
fun NotesContent(notes: List<Note>?, onBack: () -> Unit, onNew: () -> Unit = {}, onOpen: (Note) -> Unit = {}) {
    val u = Zuri.universe
    Column(Modifier.fillMaxSize()) {
        LifeHeader(stringResource(R.string.notes_eyebrow), stringResource(R.string.notes_title), onBack)
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
            item("new") { LaunchButton(stringResource(R.string.notes_new), onNew, Modifier.padding(horizontal = 16.dp, vertical = 8.dp), height = 50.dp) }
            if (notes != null && notes.isEmpty()) item("empty") {
                EmptyState(Icons.Rounded.StickyNote2, stringResource(R.string.notes_empty_t), stringResource(R.string.notes_empty_b), Modifier.padding(top = 8.dp))
            }
            itemsIndexed(notes.orEmpty(), key = { _, n -> n.id }) { i, n ->
                Column(
                    Modifier.fillMaxWidth().rise(i).padding(horizontal = 14.dp, vertical = 4.dp).glass(RoundedCornerShape(20.dp))
                        .tiltClickable { onOpen(n) }.heightIn(min = 64.dp).padding(14.dp),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(n.title, style = MaterialTheme.typography.titleMedium, color = u.ink, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                        if (n.pinned) Icon(Icons.Rounded.PushPin, null, tint = u.star)
                    }
                    if (n.body.isNotBlank() && n.body.trim() != n.title) Text(n.body, style = MaterialTheme.typography.bodySmall, color = u.inkSoft, maxLines = 3, overflow = TextOverflow.Ellipsis)
                }
            }
        }
    }
}

@Composable
private fun NoteEditor(note: Note?, onSave: (String, String, Boolean) -> Unit, onDelete: (() -> Unit)?) {
    var title by remember(note?.id) { mutableStateOf(note?.title.orEmpty()) }
    var body by remember(note?.id) { mutableStateOf(note?.body.orEmpty()) }
    var pinned by remember(note?.id) { mutableStateOf(note?.pinned ?: false) }
    Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(bottom = 28.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        OutlinedTextField(title, { title = it }, label = { Text(stringResource(R.string.note_title)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(body, { body = it }, label = { Text(stringResource(R.string.note_body)) }, minLines = 6, modifier = Modifier.fillMaxWidth())
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = { pinned = !pinned }) { Icon(Icons.Rounded.PushPin, stringResource(R.string.note_pin), tint = if (pinned) Zuri.universe.star else Zuri.universe.inkMuted) }
            if (onDelete != null) TextButton(onClick = onDelete) { Text(stringResource(R.string.life_delete), color = MaterialTheme.colorScheme.error) }
            Row(Modifier.weight(1f), horizontalArrangement = Arrangement.End) {
                LaunchButton(stringResource(R.string.note_save), { onSave(title, body, pinned) }, Modifier.fillMaxWidth(0.6f), height = 48.dp, enabled = title.isNotBlank() || body.isNotBlank())
            }
        }
    }
}
