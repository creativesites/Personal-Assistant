import structlog
from ..ai.client import get_ai_client
from ..ai.prompts import GENERATE_REPLIES
from ..database import get_pool
from ..models import MessageAnalysis, ReplySuggestions

log = structlog.get_logger()


class ReplyGenerator:
    async def generate(
        self,
        message_id: str,
        user_id: str,
        contact_id: str,
        conversation_id: str,
        body: str,
        analysis: MessageAnalysis,
    ) -> list[dict]:
        pool = await get_pool()
        async with pool.acquire() as conn:
            user = await conn.fetchrow(
                "SELECT COALESCE(full_name, email) AS name FROM users WHERE id = $1",
                user_id,
            )
            contact = await conn.fetchrow(
                "SELECT COALESCE(custom_name, display_name, phone_number, 'Unknown') AS name"
                ' FROM contacts WHERE id = $1',
                contact_id,
            )
            rel = await conn.fetchrow(
                'SELECT relationship_type FROM relationships WHERE user_id = $1 AND contact_id = $2',
                user_id,
                contact_id,
            )
            comm_profile = await conn.fetchrow(
                'SELECT writing_style, common_phrases, formality_score'
                ' FROM user_communication_profiles WHERE user_id = $1',
                user_id,
            )
            contact_profile = await conn.fetchrow(
                'SELECT personality_summary, current_life_context'
                ' FROM contact_profiles WHERE contact_id = $1 AND user_id = $2',
                contact_id,
                user_id,
            )
            recent = await conn.fetch(
                """
                SELECT sender_type, body FROM messages
                WHERE conversation_id = $1 AND body IS NOT NULL
                ORDER BY whatsapp_timestamp DESC LIMIT 10
                """,
                conversation_id,
            )

        user_name = user['name'] if user else 'User'
        contact_name = contact['name'] if contact else 'Contact'
        relationship_type = rel['relationship_type'] if rel else 'acquaintance'

        user_style: str
        if comm_profile and comm_profile['writing_style']:
            import json
            style_data = comm_profile['writing_style']
            user_style = json.dumps(style_data) if isinstance(style_data, dict) else str(style_data)
        else:
            user_style = 'casual, friendly, concise'

        contact_summary = ''
        if contact_profile:
            parts = [
                contact_profile['personality_summary'] or '',
                contact_profile['current_life_context'] or '',
            ]
            contact_summary = ' '.join(p for p in parts if p).strip()
        if not contact_summary:
            contact_summary = f'A {relationship_type}'

        context = '\n'.join(
            f"[{r['sender_type']}]: {r['body']}" for r in reversed(list(recent))
        ) or '(no prior context)'

        prompt = GENERATE_REPLIES.format(
            user_name=user_name,
            contact_name=contact_name,
            user_style=user_style,
            contact_summary=contact_summary,
            relationship_type=relationship_type,
            context=context,
            body=body,
            sentiment=analysis.sentiment,
            intent=analysis.intent.primary,
        )

        client = get_ai_client()
        raw = await client.complete_json([{'role': 'user', 'content': prompt}])
        suggestions_model = ReplySuggestions(**raw)

        pool = await get_pool()
        async with pool.acquire() as conn:
            for s in suggestions_model.suggestions:
                await conn.execute(
                    'INSERT INTO suggested_replies (message_id, suggestion_text, tone, reasoning)'
                    ' VALUES ($1, $2, $3, $4)',
                    message_id,
                    s.text,
                    s.tone,
                    s.reasoning,
                )

        log.info('replies_generated', message_id=message_id, count=len(suggestions_model.suggestions))
        return [s.model_dump() for s in suggestions_model.suggestions]
