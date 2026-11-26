package app.zuri.android.coreai.ipc

import android.app.Service
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.Message
import android.os.Messenger
import android.os.Process
import app.zuri.android.coreai.ipc.LlmProtocol.K_ERROR
import app.zuri.android.coreai.ipc.LlmProtocol.K_MAX_TOKENS
import app.zuri.android.coreai.ipc.LlmProtocol.K_PATH
import app.zuri.android.coreai.ipc.LlmProtocol.K_PROMPT
import app.zuri.android.coreai.ipc.LlmProtocol.K_SCHEMA
import app.zuri.android.coreai.ipc.LlmProtocol.K_SYSTEM
import app.zuri.android.coreai.ipc.LlmProtocol.K_TEXT
import app.zuri.android.coreai.runtime.LiteRtEngineManager
import app.zuri.android.coreai.runtime.answer
import app.zuri.android.coreai.runtime.answerJson
import app.zuri.android.coreai.runtime.measureBenchmark
import app.zuri.android.domain.ai.GenerationRequest
import java.io.File
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking

/**
 * Hosts the LiteRT-LM engine in the `:llm` process. No Hilt and no database here: the process only
 * ever sees a model path and the text of one request, and keeps nothing after answering.
 * When the app unbinds (idle), the process ends, so the model's memory is returned to the system.
 */
class LlmService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private lateinit var engines: LiteRtEngineManager
    private lateinit var embedders: app.zuri.android.coreai.runtime.LiteRtEmbeddingManager
    private lateinit var thread: HandlerThread
    private lateinit var messenger: Messenger

    override fun onCreate() {
        super.onCreate()
        engines = LiteRtEngineManager(File(cacheDir, "litertlm"))
        embedders = app.zuri.android.coreai.runtime.LiteRtEmbeddingManager(File(cacheDir, "litertlm-embed"))
        thread = HandlerThread("llm-ipc").apply { start() }
        messenger = Messenger(Handler(thread.looper) { msg -> receive(msg); true })
    }

    override fun onBind(intent: Intent): IBinder = messenger.binder

    private fun receive(msg: Message) {
        // A Message is recycled once this returns: copy everything needed first.
        val replyTo = msg.replyTo ?: return
        val op = msg.what
        val id = msg.arg1
        val args = Bundle(msg.data)
        scope.launch {
            val out = runCatching { handle(op, args) }.getOrElse { e ->
                Bundle().apply { putString(K_ERROR, "${e.javaClass.simpleName}: ${e.message.orEmpty()}".take(300)) }
            }
            runCatching { replyTo.send(Message.obtain(null, op, id, 0).apply { data = out }) }
        }
    }

    private suspend fun handle(op: Int, args: Bundle): Bundle = when (op) {
        LlmProtocol.OP_GENERATE -> {
            val path = requireNotNull(args.getString(K_PATH))
            val prompt = requireNotNull(args.getString(K_PROMPT))
            val system = args.getString(K_SYSTEM)
            val max = args.getInt(K_MAX_TOKENS, 512)
            val schema = args.getString(K_SCHEMA)
            val text = engines.withEngine(path) { engine ->
                if (schema != null) engine.answerJson(prompt, schema, system, max)
                else engine.answer(GenerationRequest(prompt = prompt, system = system, maxOutputTokens = max)).first
            }
            Bundle().apply { putString(K_TEXT, text) }
        }
        LlmProtocol.OP_BENCHMARK -> measureBenchmark(engines, requireNotNull(args.getString(K_PATH)))
        LlmProtocol.OP_EMBED -> {
            val path = requireNotNull(args.getString(K_PATH))
            val texts = requireNotNull(args.getStringArrayList(LlmProtocol.K_TEXTS))
            val vectors = embedders.embed(path, texts, args.getInt(LlmProtocol.K_DIM, 256))
            val dim = vectors.firstOrNull()?.size ?: 0
            val flat = FloatArray(dim * vectors.size)
            vectors.forEachIndexed { i, v -> require(v.size == dim) { "uneven vectors" }; v.copyInto(flat, i * dim) }
            Bundle().apply { putInt(LlmProtocol.K_DIM, dim); putFloatArray(LlmProtocol.K_VECTORS, flat) }
        }
        LlmProtocol.OP_RELEASE -> { engines.release(); embedders.release(); Bundle() }
        else -> error("Unknown operation $op")
    }

    override fun onDestroy() {
        runBlocking { runCatching { engines.release() }; runCatching { embedders.release() } }
        scope.cancel()
        thread.quitSafely()
        super.onDestroy()
        // End the process: native allocators rarely hand freed model memory back to the system.
        Process.killProcess(Process.myPid())
    }
}
