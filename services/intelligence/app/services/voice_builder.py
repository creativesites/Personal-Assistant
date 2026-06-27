import json
import structlog
from ..ai.client import get_ai_client
from ..ai.prompts import BUILD_USER_VOICE_PROFILE
from ..database import get_pool

log = structlog.get_logger()

_MAX_MESSAGES = 200
_PROMPT_CHAR_LIMIT = 10000


class UserVoiceBuilder:
    async def build(self, user_id: str) -> None:
        pool = await get_pool()
        async with pool.acquire() as conn:
            user = await conn.fetchrow(
                "SELECT COALESCE(full_name, email) AS name FROM users WHERE id = $1",
                user_id,
            )
            messages = await conn.fetch(
                """
                SELECT m.body, m.whatsapp_timestamp
                FROM messages m
                JOIN conversations c ON c.id = m.conversation_id
                WHERE c.user_id = $1 AND m.sender_type = 'user' AND m.body IS NOT NULL
                ORDER BY m.whatsapp_timestamp DESC
                LIMIT $2
                """,
                user_id,
                _MAX_MESSAGES,
            )

        if len(messages) < 10:
            log.info('insufficient_messages_for_voice', user_id=user_id, count=len(messages))
            return

        user_name = user['name'] if user else 'User'
        messages_text = '\n'.join(f'- {m["body"]}' for m in messages)[:_PROMPT_CHAR_LIMIT]
        dates = [m['whatsapp_timestamp'] for m in messages if m['whatsapp_timestamp']]
        date_range = 'unknown'
        if dates:
            date_range = f'{min(dates).date()} to {max(dates).date()}'

        client = get_ai_client()
        raw = await client.complete_json(
            [{'role': 'user', 'content': BUILD_USER_VOICE_PROFILE.format(
                user_name=user_name,
                messages_text=messages_text,
                message_count=len(messages),
                date_range=date_range,
            )}]
        )

        formality_map = {
            'very_formal': 0.9,
            'formal': 0.7,
            'neutral': 0.5,
            'casual': 0.3,
            'very_casual': 0.1,
        }
        formality_score = formality_map.get(raw.get('formality_level', 'neutral'), 0.5)

        writing_style = {
            'vocabulary_style': raw.get('vocabulary_style', ''),
            'sentence_structure': raw.get('sentence_structure', ''),
            'punctuation_habits': raw.get('punctuation_habits', ''),
            'humor_style': raw.get('humor_style', 'none'),
            'communication_pace': raw.get('communication_pace', 'measured'),
            'voice_summary': raw.get('voice_summary', ''),
        }

        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO user_communication_profiles
                    (user_id, writing_style, common_phrases, formality_score, last_analyzed_at, updated_at)
                VALUES ($1, $2, $3, $4, NOW(), NOW())
                ON CONFLICT (user_id) DO UPDATE SET
                    writing_style = EXCLUDED.writing_style,
                    common_phrases = EXCLUDED.common_phrases,
                    formality_score = EXCLUDED.formality_score,
                    last_analyzed_at = NOW(),
                    updated_at = NOW()
                """,
                user_id,
                json.dumps(writing_style),
                json.dumps({
                    'greeting_patterns': raw.get('greeting_patterns', []),
                    'closing_patterns': raw.get('closing_patterns', []),
                    'characteristic_phrases': raw.get('characteristic_phrases', []),
                    'emoji_usage': raw.get('emoji_usage', 'none'),
                }),
                formality_score,
            )

        log.info('voice_profile_built', user_id=user_id, messages_analyzed=len(messages))
