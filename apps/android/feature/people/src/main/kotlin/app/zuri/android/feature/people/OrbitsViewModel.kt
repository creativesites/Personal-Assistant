package app.zuri.android.feature.people

import android.graphics.BitmapFactory
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.zuri.android.core.ui.theme.HealthBand
import app.zuri.android.core.ui.theme.healthBand
import app.zuri.android.domain.cloud.CloudAvatars
import app.zuri.android.domain.context.ActiveContextProvider
import app.zuri.android.domain.inbox.ConversationId
import app.zuri.android.domain.people.Relationship
import app.zuri.android.domain.people.Relationships
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class OrbitsState(val loading: Boolean = true, val people: List<Relationship> = emptyList(), val filter: OrbitFilter = OrbitFilter.ALL) {
    val visible: List<Relationship> get() = when (filter) {
        OrbitFilter.ALL -> people
        OrbitFilter.ATTENTION -> people.filter { healthBand(it.score) == HealthBand.Drifting }
        OrbitFilter.DORMANT -> people.filter { healthBand(it.score) == HealthBand.Dormant }
    }
}

@HiltViewModel
class OrbitsViewModel @Inject constructor(
    context: ActiveContextProvider,
    private val relationships: Relationships,
    private val avatarSource: CloudAvatars,
) : ViewModel() {
    private val filter = MutableStateFlow(OrbitFilter.ALL)

    @OptIn(ExperimentalCoroutinesApi::class)
    val state: StateFlow<OrbitsState> = combine(
        context.active.flatMapLatest { ctx -> if (ctx == null) flowOf(emptyList()) else relationships.observe(ctx.ids.toList()) },
        filter,
    ) { people, f -> OrbitsState(loading = false, people = people, filter = f) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), OrbitsState())

    fun setFilter(f: OrbitFilter) { filter.value = f }
    fun refresh() = viewModelScope.launch { runCatching { relationships.refresh() } }
    fun setTier(id: ConversationId, tier: Int) = viewModelScope.launch { relationships.setTier(id, tier) }

    private val asked = mutableSetOf<String>()
    private val _avatars = MutableStateFlow<Map<String, ImageBitmap>>(emptyMap())
    val avatars: StateFlow<Map<String, ImageBitmap>> = _avatars

    fun needAvatar(conversationId: String) {
        if (!asked.add(conversationId)) return
        viewModelScope.launch {
            val bytes = runCatching { avatarSource.forConversation(conversationId) }.getOrNull() ?: return@launch
            val bmp = withContext(Dispatchers.Default) { BitmapFactory.decodeByteArray(bytes, 0, bytes.size) } ?: return@launch
            _avatars.value = _avatars.value + (conversationId to bmp.asImageBitmap())
        }
    }
}
