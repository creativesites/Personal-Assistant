import * as fs from 'fs'
import * as path from 'path'
import type { Pool } from 'pg'

const MEDIA_DIR = process.env.MEDIA_DIR ?? '/app/media'

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
  if (msg.transcription && msg.transcription.trim().length > 0) {
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

  if (fs.existsSync(localPath)) {
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

  // 3. Try Gemini Multimodal Audio Transcription
  const googleKey = process.env.GOOGLE_AI_API_KEY
  const openaiKey = process.env.OPENAI_API_KEY

  if (googleKey) {
    try {
      const base64Audio = audioBuffer.toString('base64')
      const geminiModel = process.env.DEFAULT_AI_MODEL?.replace('gemini/', '') || 'gemini-2.0-flash'

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
      }
    } catch (err) {
      console.warn('OpenAI Whisper audio transcription failed:', err)
    }
  }

  if (!transcript) {
    transcript = '[Audio voice message]'
  }

  // 5. Update DB
  await db.query(
    `UPDATE messages SET transcription = $1 WHERE id = $2`,
    [transcript, messageId]
  )

  return transcript
}
