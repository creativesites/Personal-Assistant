package app.zuri.android.engine.perception.eval

import app.zuri.android.domain.memory.MemoryKind
import app.zuri.android.engine.perception.extract.ChatBatch
import app.zuri.android.engine.perception.extract.ChatLine
import java.time.LocalDateTime
import java.time.ZoneId
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/** The labelled fixtures, shared with the on-device model eval (app androidTest, ModelEvalTest). */
object EvalFixtures {
    @Serializable data class Line(val me: Boolean, val text: String)
    @Serializable data class Chat(val title: String, val group: Boolean, val lines: List<Line>, val expected: List<List<String>>)
    @Serializable data class File(val anchor: String, val chats: List<Chat>)

    fun load(json: String): Pair<List<ChatBatch>, List<Set<Pair<MemoryKind, Int>>>> {
        val f = Json { ignoreUnknownKeys = true; isLenient = true }.decodeFromString<File>(json)
        val zone = ZoneId.of("Africa/Lusaka")
        val start = LocalDateTime.parse(f.anchor).atZone(zone).toInstant().toEpochMilli()
        val batches = f.chats.mapIndexed { ci, c ->
            ChatBatch(c.title, c.group, emptyList(), c.lines.mapIndexed { i, l ->
                ChatLine("c$ci-m$i", l.me, if (l.me) "Me" else c.title, l.text, start + i * 60_000L)
            })
        }
        val expected = f.chats.map { c -> c.expected.map { MemoryKind.valueOf(it[0]) to it[1].toInt() }.toSet() }
        return batches to expected
    }

    data class Score(val tp: Int, val fp: Int, val fn: Int) {
        val precision get() = if (tp + fp == 0) 1.0 else tp.toDouble() / (tp + fp)
        val recall get() = if (tp + fn == 0) 1.0 else tp.toDouble() / (tp + fn)
        operator fun plus(o: Score) = Score(tp + o.tp, fp + o.fp, fn + o.fn)
    }

    fun score(found: Set<Pair<MemoryKind, Int>>, expected: Set<Pair<MemoryKind, Int>>, kinds: Set<MemoryKind>): Score {
        val f = found.filter { it.first in kinds }.toSet()
        val e = expected.filter { it.first in kinds }.toSet()
        return Score((f intersect e).size, (f - e).size, (e - f).size)
    }

    val COMMITMENTS = setOf(MemoryKind.MY_PROMISE, MemoryKind.THEIR_PROMISE, MemoryKind.REQUEST_TO_ME)
}

