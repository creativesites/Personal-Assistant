import * as fs from 'fs'
import * as path from 'path'
import type { Pool } from 'pg'
import { ensureMessageMedia } from './message-media'

const MEDIA_DIR = process.env.MEDIA_DIR ?? '/app/media'
/** Older code stored this when transcription failed; treat it as "not transcribed". */
const FAILED_PLACEHOLDER = '[Audio voice message]'

export async function transcribeAudioMessage(
  db: Pool,
  messageId: string
): Promise<string> {
  // 1. Fetch message from DB
  const { rows } = await db.query(
    `SELECT id, media_url, media_mime_type, transcription FROM messages WHERE id = $1`,
    [messageId]
  )

  if (rows.length === 0) {
    throw new Error('Message not found')
  }

  const msg = rows[0]
  if (msg.transcription && msg.transcription.trim().length > 0 && msg.transcription !== FAILED_PLACEHOLDER) {
    return msg.transcription
  }

  if (!msg.media_url) {
    throw new Error('Message has no associated audio file URL')
  }

  // 2. Resolve audio file buffer
  let audioBuffer: Buffer | null = null
  let mimeType = msg.media_mime_type || 'audio/ogg'

  // If local media path
  const filename = path.basename(msg.media_url.split('?')[0])
  const localPath = path.join(MEDIA_DIR, filename)

  if (msg.media_url.startsWith('/api/messages/')) {
    // WhatsApp media stored per message (downloaded on demand).
    const { rows: [owner] } = await db.query<{ user_id: string }>(
      `SELECT c.user_id FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE m.id = $1`,
      [messageId],
    )
    if (owner) {
      const media = await ensureMessageMedia(owner.user_id, messageId)
      audioBuffer = fs.readFileSync(media.path)
      mimeType = media.mimeType
    }
  } else if (fs.existsSync(localPath)) {
    audioBuffer = fs.readFileSync(localPath)
  } else if (/^https?:\/\//i.test(msg.media_url)) {
    // Remote media fetch
    const res = await fetch(msg.media_url)
    if (res.ok) {
      const arrayBuf = await res.arrayBuffer()
      audioBuffer = Buffer.from(arrayBuf)
    }
  }

  if (!audioBuffer) {
    throw new Error('Audio file content could not be retrieved')
  }

  let transcript = ''
  const failures: string[] = []

  // 3. Try Gemini Multimodal Audio Transcription
  const googleKey = process.env.GOOGLE_AI_API_KEY
  const openaiKey = process.env.OPENAI_API_KEY

  if (googleKey) {
    try {
      const base64Audio = audioBuffer.toString('base64')
      // Audio needs a Gemini model; DEFAULT_AI_MODEL is usually Claude now.
      const geminiModel = [process.env.TRANSCRIPTION_MODEL, process.env.FALLBACK_AI_MODEL, process.env.DEFAULT_AI_MODEL]
        .find((m) => m?.startsWith('gemini/'))?.replace('gemini/', '') || 'gemini-3.5-flash'

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${googleKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    inline_data: {
                      mime_type: mimeType.split(';')[0],
                      data: base64Audio,
                    },
                  },
                  {
                    text: 'Transcribe this voice message verbatim in its original spoken language. Output ONLY the raw transcript text with no explanations, titles, or quotes.',
                  },
                ],
              },
            ],
          }),
        }
      )

      if (response.ok) {
        const data = (await response.json()) as any
        transcript = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
      } else {
        failures.push(`Gemini ${response.status}`)
        console.warn('Gemini audio transcription failed:', response.status, (await response.text()).slice(0, 300))
      }
    } catch (err) {
      console.warn('Gemini audio transcription failed:', err)
    }
  }

  // 4. Fallback to OpenAI Whisper if Gemini skipped/failed
  if (!transcript && openaiKey) {
    try {
      const formData = new FormData()
      const blob = new Blob([audioBuffer], { type: mimeType.split(';')[0] })
      formData.append('file', blob, 'audio.ogg')
      formData.append('model', 'whisper-1')

      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openaiKey}`,
        },
        body: formData,
      })

      if (response.ok) {
        const data = (await response.json()) as any
        transcript = data.text?.trim() || ''
      } else {
        failures.push(`Whisper ${response.status}`)
      }
    } catch (err) {
      console.warn('OpenAI Whisper audio transcription failed:', err)
    }
  }

  if (!transcript) {
    // Don't cache a failure — a later retry (e.g. after a key fix) should work.
    if (!googleKey && !openaiKey) throw new Error('Transcription is not configured (no Gemini or OpenAI key)')
    throw new Error(`Transcription failed${failures.length ? ` (${failures.join(', ')})` : ''}`)
  }

  // 5. Update DB
  await db.query(
    `UPDATE messages SET transcription = $1 WHERE id = $2`,
    [transcript, messageId]
  )

  return transcript
}
