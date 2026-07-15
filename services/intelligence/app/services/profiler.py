import structlog
from ..ai.client import get_ai_client
from ..ai.prompts import EXTRACT_CONTACT_INSIGHTS, BUILD_CONTACT_PROFILE
from ..database import get_pool
from ..models import ContactInsights, ContactProfileUpdate

log = structlog.get_logger()

_MAX_MESSAGES = 100
_PROMPT_CHAR_LIMIT = 8000


class ContactProfiler:
    async def profile(self, contact_id: str, user_id: str) -> None:
        pool = await get_pool()
        async with pool.acquire() as conn:
            contact = await conn.fetchrow(
                "SELECT COALESCE(custom_name, display_name, phone_number, 'Unknown') AS name"
                ' FROM contacts WHERE id = $1',
                contact_id,
            )
            user = await conn.fetchrow(
                "SELECT COALESCE(full_name, email) AS name FROM users WHERE id = $1",
                user_id,
            )
            messages = await conn.fetch(
                """
                SELECT m.sender_type, m.body, m.whatsapp_timestamp
                FROM messages m
                JOIN conversations c ON c.id = m.conversation_id
                WHERE c.contact_id = $1 AND c.user_id = $2 AND m.body IS NOT NULL
                ORDER BY m.whatsapp_timestamp DESC
                LIMIT $3
                """,
                contact_id,
                user_id,
                _MAX_MESSAGES,
            )
            existing_insights = await conn.fetch(
                'SELECT id, insight_key, insight_value, evidence_count FROM contact_insights'
                ' WHERE contact_id = $1 AND user_id = $2 AND is_active = TRUE',
                contact_id,
                user_id,
            )

        if not messages:
            log.info('no_messages_to_profile', contact_id=contact_id)
            return

        contact_name = contact['name'] if contact else 'Contact'
        user_name = user['name'] if user else 'User'

        messages_text = '\n'.join(
            f"[{m['sender_type']}]: {m['body']}" for m in messages
        )[:_PROMPT_CHAR_LIMIT]

        dates = [m['whatsapp_timestamp'] for m in messages if m['whatsapp_timestamp']]
        date_range = 'unknown'
        if dates:
            date_range = f'{min(dates).date()} to {max(dates).date()}'

        client = get_ai_client()

        # Extract atomic insights
        insights_raw = await client.complete_json([{
            'role': 'user',
            'content': EXTRACT_CONTACT_INSIGHTS.format(
                contact_name=contact_name,
                user_name=user_name,
                messages_text=messages_text,
            ),
        }], service='intelligence', feature='contact_profiling', user_id=user_id)
        insights_model = ContactInsights(**insights_raw)

        # Build synthesised profile
        existing_summary = '; '.join(
            f"{r['insight_key']}: {r['insight_value']}" for r in existing_insights
        ) or 'none'

        sample = '\n'.join(
            f"[{m['sender_type']}]: {m['body']}" for m in messages[:20]
        )

        profile_raw = await client.complete_json([{
            'role': 'user',
            'content': BUILD_CONTACT_PROFILE.format(
                contact_name=contact_name,
                user_name=user_name,
                message_count=len(messages),
                date_range=date_range,
                existing_insights=existing_summary,
                sample_messages=sample,
            ),
        }], service='intelligence', feature='contact_profiling', user_id=user_id)
        profile_model = ContactProfileUpdate(**profile_raw)

        # Only merge structured_attributes fields the model actually had evidence
        # for — an empty string/list here means "no signal this run", not "clear it".
        structured_delta = {
            k: v for k, v in profile_model.structured_attributes.model_dump().items() if v
        }

        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO contact_profiles (
                    contact_id, user_id, personality_summary, communication_style,
                    emotional_patterns, known_triggers, current_life_context,
                    mood_baseline, buying_behaviour, pain_points, goals,
                    preferences, relationship_stage, structured_attributes, last_analyzed_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
                ON CONFLICT (contact_id) DO UPDATE SET
                    personality_summary  = CASE
                        WHEN 'personality_summary' = ANY(contact_profiles.locked_fields) THEN contact_profiles.personality_summary
                        ELSE EXCLUDED.personality_summary
                    END,
                    communication_style  = CASE
                        WHEN 'communication_style' = ANY(contact_profiles.locked_fields) THEN contact_profiles.communication_style
                        ELSE EXCLUDED.communication_style
                    END,
                    emotional_patterns   = EXCLUDED.emotional_patterns,
                    known_triggers       = EXCLUDED.known_triggers,
                    current_life_context = CASE
                        WHEN 'current_life_context' = ANY(contact_profiles.locked_fields) THEN contact_profiles.current_life_context
                        ELSE EXCLUDED.current_life_context
                    END,
                    mood_baseline        = CASE
                        WHEN 'mood_baseline' = ANY(contact_profiles.locked_fields) THEN contact_profiles.mood_baseline
                        ELSE EXCLUDED.mood_baseline
                    END,
                    buying_behaviour     = CASE
                        WHEN 'buying_behaviour' = ANY(contact_profiles.locked_fields) THEN contact_profiles.buying_behaviour
                        WHEN $9 != '' THEN EXCLUDED.buying_behaviour
                        ELSE contact_profiles.buying_behaviour
                    END,
                    pain_points          = CASE
                        WHEN 'pain_points' = ANY(contact_profiles.locked_fields) THEN contact_profiles.pain_points
                        WHEN $10 != '' THEN EXCLUDED.pain_points
                        ELSE contact_profiles.pain_points
                    END,
                    goals                = CASE
                        WHEN 'goals' = ANY(contact_profiles.locked_fields) THEN contact_profiles.goals
                        WHEN $11 != '' THEN EXCLUDED.goals
                        ELSE contact_profiles.goals
                    END,
                    preferences          = CASE
                        WHEN 'preferences' = ANY(contact_profiles.locked_fields) THEN contact_profiles.preferences
                        WHEN $12 != '' THEN EXCLUDED.preferences
                        ELSE contact_profiles.preferences
                    END,
                    relationship_stage   = CASE
                        WHEN 'relationship_stage' = ANY(contact_profiles.locked_fields) THEN contact_profiles.relationship_stage
                        WHEN $13 != '' THEN EXCLUDED.relationship_stage
                        ELSE contact_profiles.relationship_stage
                    END,
                    structured_attributes = COALESCE(contact_profiles.structured_attributes, '{}'::jsonb)
                                             || EXCLUDED.structured_attributes,
                    last_analyzed_at     = NOW(),
                    updated_at           = NOW()
                """,
                contact_id,
                user_id,
                profile_model.personality_summary,
                profile_model.communication_style,
                profile_model.emotional_patterns,
                profile_model.known_triggers,
                profile_model.current_life_context,
                profile_model.mood_baseline,
                profile_model.buying_behaviour or '',
                profile_model.pain_points or '',
                profile_model.goals or '',
                profile_model.preferences or '',
                profile_model.relationship_stage or '',
                structured_delta,
            )

            # Retire old insights, write fresh batch — preserve evidence/provenance
            # trail via superseded_by rather than dropping it on the floor.
            existing_by_key = {r['insight_key']: r for r in existing_insights}
            await conn.execute(
                'UPDATE contact_insights SET is_active = FALSE'
                ' WHERE contact_id = $1 AND user_id = $2',
                contact_id,
                user_id,
            )
            for insight in insights_model.insights:
                prior = existing_by_key.get(insight.key)
                evidence_count = 1
                if prior and prior['insight_value'] == insight.value:
                    evidence_count = (prior['evidence_count'] or 1) + 1

                new_id = await conn.fetchval(
                    'INSERT INTO contact_insights'
                    ' (contact_id, user_id, insight_key, insight_value, confidence,'
                    '  supporting_text, evidence_count)'
                    ' VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
                    contact_id,
                    user_id,
                    insight.key,
                    insight.value,
                    insight.confidence,
                    insight.supporting_text or None,
                    evidence_count,
                )
                if prior:
                    await conn.execute(
                        'UPDATE contact_insights SET superseded_by = $1 WHERE id = $2',
                        new_id,
                        prior['id'],
                    )

        log.info('contact_profiled', contact_id=contact_id, insights=len(insights_model.insights))
