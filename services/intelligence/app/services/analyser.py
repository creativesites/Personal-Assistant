import structlog
from ..ai.client import get_ai_client
from ..ai.embeddings import embed_text
from ..ai.prompts import ANALYSE_MESSAGE
from ..config import settings
from ..database import get_pool
from ..models import MessageAnalysis

log = structlog.get_logger()

_VALID_SENTIMENTS = {'positive', 'negative', 'neutral', 'mixed'}
_VALID_URGENCIES = {'low', 'medium', 'high', 'urgent'}


class MessageAnalyser:
    async def analyse(
        self,
        message_id: str,
        user_id: str,
        conversation_id: str,
        contact_id: str,
    ) -> MessageAnalysis:
        pool = await get_pool()
        async with pool.acquire() as conn:
            message = await conn.fetchrow(
                'SELECT body, sender_type FROM messages WHERE id = $1',
                message_id,
            )
            if not message:
                raise ValueError(f'Message not found: {message_id}')

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
            user = await conn.fetchrow(
                "SELECT COALESCE(full_name, email) AS name FROM users WHERE id = $1",
                user_id,
            )
            recent = await conn.fetch(
                """
                SELECT sender_type, body FROM messages
                WHERE conversation_id = $1 AND id != $2 AND body IS NOT NULL
                ORDER BY whatsapp_timestamp DESC LIMIT 5
                """,
                conversation_id,
                message_id,
            )

        body = message['body'] or ''
        sender_type = message['sender_type']
        contact_name = contact['name'] if contact else 'Unknown'
        relationship_type = rel['relationship_type'] if rel else 'acquaintance'
        user_name = user['name'] if user else 'User'

        recent_ctx = '\n'.join(
            f"[{r['sender_type']}]: {r['body']}" for r in reversed(list(recent))
        ) or '(no prior context)'

        prompt = ANALYSE_MESSAGE.format(
            sender_type=sender_type,
            sender_name=contact_name if sender_type == 'contact' else user_name,
            relationship_type=relationship_type,
            recent_context=recent_ctx,
            body=body,
        )

        client = get_ai_client()
        raw = await client.complete_json([{'role': 'user', 'content': prompt}])
        analysis = MessageAnalysis(**raw)

        sentiment = analysis.sentiment if analysis.sentiment in _VALID_SENTIMENTS else 'neutral'
        urgency = analysis.response_urgency if analysis.response_urgency in _VALID_URGENCIES else 'low'

        embedding = await embed_text(body)

        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO message_analyses (
                    message_id, sentiment, sentiment_score, emotions, intent,
                    topics, entities, importance_score, requires_response,
                    response_urgency, promises_detected, events_detected,
                    embedding, analysis_model
                ) VALUES (
                    $1, $2::sentiment_type, $3, $4, $5,
                    $6, $7, $8, $9,
                    $10::urgency_level, $11, $12, $13, $14
                )
                ON CONFLICT (message_id) DO UPDATE SET
                    sentiment = EXCLUDED.sentiment,
                    sentiment_score = EXCLUDED.sentiment_score,
                    emotions = EXCLUDED.emotions,
                    intent = EXCLUDED.intent,
                    topics = EXCLUDED.topics,
                    entities = EXCLUDED.entities,
                    importance_score = EXCLUDED.importance_score,
                    requires_response = EXCLUDED.requires_response,
                    response_urgency = EXCLUDED.response_urgency,
                    promises_detected = EXCLUDED.promises_detected,
                    events_detected = EXCLUDED.events_detected,
                    embedding = EXCLUDED.embedding,
                    analysis_model = EXCLUDED.analysis_model,
                    analyzed_at = NOW()
                """,
                message_id,
                sentiment,
                analysis.sentiment_score,
                analysis.emotions.model_dump(),
                analysis.intent.model_dump(),
                analysis.topics,
                [e.model_dump() for e in analysis.entities],
                analysis.importance_score,
                analysis.requires_response,
                urgency,
                [p.model_dump() for p in analysis.promises_detected],
                [e.model_dump() for e in analysis.events_detected],
                embedding,
                settings.default_ai_model,
            )

        log.info('message_analysed', message_id=message_id, sentiment=sentiment)
        return analysis
