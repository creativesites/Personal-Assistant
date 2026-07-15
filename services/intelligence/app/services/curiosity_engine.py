"""Zuri Curiosity Layer — a cross-cutting engine that notices gaps in
what Zuri knows (about a contact, or about the user themselves) and asks
about them, either woven naturally into a normal Advisor turn (inline) or
delivered proactively out of the blue (proactive). See CLAUDE.md
"Curiosity Layer" for the full design and scope notes.

Deliberately NOT part of the Personal Mode Suite (docs/ADVISOR_COMPANION_
PLAN.md §1.2) — filling in a contact's job title or the user's interests
is a general product-quality improvement useful in business mode too, not
a personality/companion feature, so it isn't gated on
`personal_mode_enabled`. The proactive nudge still respects
`companion_features_paused` (§7.8's honest kill switch), same as every
other unsolicited Advisor message.
"""
import json
import random
import structlog
from ..ai.client import get_ai_client
from ..ai.prompts import GENERATE_CURIOSITY_QUESTION, CLASSIFY_CURIOSITY_ANSWER
from ..database import get_pool
from .companion_delivery import deliver_initiated_message

log = structlog.get_logger()

_GAP_COOLDOWN_DAYS = 14
_PENDING_ANSWER_WINDOW_HOURS = 72
_INLINE_ASK_PROBABILITY = 0.2
_PROACTIVE_FIRE_PROBABILITY = 0.25
_MIN_MESSAGES_FOR_RELATIONSHIP_TYPE_GAP = 15

_GAP_DESCRIPTIONS = {
    'job_title': 'what {name} does for work',
    'company': 'where {name} works',
    'relationship_type': 'how the user would actually describe their relationship with {name} (it\'s still set to the default "acquaintance")',
    'interests_contact': 'what {name} is into / cares about',
    'interests_user': 'what the user themselves is into these days',
    'motivational_style': 'what actually motivates the user to get moving on something',
}


class CuriosityEngine:
    # ── Gap detection ────────────────────────────────────────────────────

    async def _find_contact_gaps(self, user_id: str) -> list[dict]:
        pool = await get_pool()
        gaps: list[dict] = []
        async with pool.acquire() as conn:
            missing_job = await conn.fetch(
                """SELECT c.id AS contact_id, COALESCE(c.custom_name, c.display_name, c.phone_number) AS contact_name
                   FROM contacts c
                   JOIN relationships r ON r.contact_id = c.id AND r.user_id = $1
                   WHERE c.user_id = $1 AND c.is_group = false AND c.job_title IS NULL
                     AND r.importance_tier IN (1, 2)
                   LIMIT 10""",
                user_id,
            )
            gaps.extend({'target_type': 'contact', 'gap_type': 'job_title', 'contact_id': str(r['contact_id']), 'contact_name': r['contact_name']} for r in missing_job)

            missing_company = await conn.fetch(
                """SELECT c.id AS contact_id, COALESCE(c.custom_name, c.display_name, c.phone_number) AS contact_name
                   FROM contacts c
                   JOIN relationships r ON r.contact_id = c.id AND r.user_id = $1
                   WHERE c.user_id = $1 AND c.is_group = false AND c.company IS NULL
                     AND r.importance_tier IN (1, 2)
                   LIMIT 10""",
                user_id,
            )
            gaps.extend({'target_type': 'contact', 'gap_type': 'company', 'contact_id': str(r['contact_id']), 'contact_name': r['contact_name']} for r in missing_company)

            missing_relationship_type = await conn.fetch(
                """SELECT c.id AS contact_id, COALESCE(c.custom_name, c.display_name, c.phone_number) AS contact_name
                   FROM contacts c
                   JOIN relationships r ON r.contact_id = c.id AND r.user_id = $1
                   WHERE c.user_id = $1 AND c.is_group = false AND r.relationship_type = 'acquaintance'
                     AND (SELECT COUNT(*) FROM messages m JOIN conversations conv ON conv.id = m.conversation_id
                          WHERE conv.contact_id = c.id AND conv.user_id = $1) >= $2
                   LIMIT 10""",
                user_id, _MIN_MESSAGES_FOR_RELATIONSHIP_TYPE_GAP,
            )
            gaps.extend({'target_type': 'contact', 'gap_type': 'relationship_type', 'contact_id': str(r['contact_id']), 'contact_name': r['contact_name']} for r in missing_relationship_type)

            missing_interests = await conn.fetch(
                """SELECT c.id AS contact_id, COALESCE(c.custom_name, c.display_name, c.phone_number) AS contact_name
                   FROM contacts c
                   JOIN relationships r ON r.contact_id = c.id AND r.user_id = $1
                   WHERE c.user_id = $1 AND c.is_group = false AND r.importance_tier IN (1, 2)
                     AND NOT EXISTS (
                       SELECT 1 FROM contact_insights ci
                       WHERE ci.contact_id = c.id AND ci.user_id = $1 AND ci.is_active = true
                         AND ci.insight_key IN ('interests', 'hobbies')
                     )
                   LIMIT 10""",
                user_id,
            )
            gaps.extend({'target_type': 'contact', 'gap_type': 'interests', 'contact_id': str(r['contact_id']), 'contact_name': r['contact_name']} for r in missing_interests)
        return gaps

    async def _find_user_gaps(self, user_id: str) -> list[dict]:
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT interests, motivational_style FROM advisor_user_profiles WHERE user_id = $1",
                user_id,
            )
        gaps: list[dict] = []
        interests = row['interests'] if row else None
        motivational_style = row['motivational_style'] if row else None
        if not interests:
            gaps.append({'target_type': 'user', 'gap_type': 'interests', 'contact_id': None, 'contact_name': None})
        if not motivational_style:
            gaps.append({'target_type': 'user', 'gap_type': 'motivational_style', 'contact_id': None, 'contact_name': None})
        return gaps

    async def _filter_cooldown(self, user_id: str, gaps: list[dict]) -> list[dict]:
        if not gaps:
            return []
        pool = await get_pool()
        async with pool.acquire() as conn:
            recent = await conn.fetch(
                """SELECT target_type, target_contact_id, gap_type FROM advisor_curiosity_prompts
                   WHERE user_id = $1 AND asked_at > NOW() - make_interval(days => $2)""",
                user_id, _GAP_COOLDOWN_DAYS,
            )
        recently_asked = {(r['target_type'], str(r['target_contact_id']) if r['target_contact_id'] else None, r['gap_type']) for r in recent}
        return [g for g in gaps if (g['target_type'], g['contact_id'], g['gap_type']) not in recently_asked]

    def _gap_description(self, gap: dict) -> str:
        if gap['gap_type'] == 'interests' and gap['target_type'] == 'contact':
            template = _GAP_DESCRIPTIONS['interests_contact']
        elif gap['gap_type'] == 'interests':
            template = _GAP_DESCRIPTIONS['interests_user']
        else:
            template = _GAP_DESCRIPTIONS[gap['gap_type']]
        return template.format(name=gap.get('contact_name') or '')

    async def pick_next_gap(self, user_id: str) -> dict | None:
        """Combines contact + user gaps, filters anything asked in the
        last 14 days for that exact (target, gap_type), and picks one at
        random from what's left — contact gaps (close-circle relationship
        quality) are weighted slightly ahead of user-profile gaps since
        they compound into more of Zuri's existing intelligence (health
        scores, gossip, network value)."""
        contact_gaps = await self._find_contact_gaps(user_id)
        user_gaps = await self._find_user_gaps(user_id)
        eligible = await self._filter_cooldown(user_id, contact_gaps + user_gaps)
        if not eligible:
            return None
        weighted = [g for g in eligible if g['target_type'] == 'contact'] * 2 + [g for g in eligible if g['target_type'] == 'user']
        return random.choice(weighted)

    # ── Asking ───────────────────────────────────────────────────────────

    async def ask_gap(self, user_id: str, gap: dict, delivery: str, session_id: str | None = None) -> dict | None:
        """Generates a natural question for this gap and records the
        pending-answer row. Returns {question, promptId} or None on a
        generation failure (fails soft — a skipped curiosity question is
        never worth surfacing an error for)."""
        ai = get_ai_client()
        gap_description = self._gap_description(gap)
        try:
            result = await ai.complete_json([{
                'role': 'user',
                'content': GENERATE_CURIOSITY_QUESTION.format(gap_description=gap_description),
            }])
        except Exception as exc:
            log.warning('curiosity_question_generation_failed', gap_type=gap['gap_type'], error=str(exc))
            return None
        question = result.get('question')
        if not question:
            return None

        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """INSERT INTO advisor_curiosity_prompts
                     (user_id, session_id, target_type, target_contact_id, gap_type, question_text, delivery)
                   VALUES ($1, $2, $3, $4, $5, $6, $7)
                   RETURNING id""",
                user_id, session_id, gap['target_type'], gap['contact_id'], gap['gap_type'], question, delivery,
            )
        return {'question': question, 'promptId': str(row['id'])}

    # ── Answer capture ───────────────────────────────────────────────────

    async def check_pending_answer(self, user_id: str, message: str) -> dict | None:
        """Called on every Advisor turn (both handle_turn and
        handle_conversation_turn) before building the prompt — is the
        user's message actually answering a curiosity question asked in
        the last 3 days? Applies the write and returns
        {gapDescription, extractedValue} for a brief in-context
        acknowledgment, or None if nothing pending / nothing matched."""
        pool = await get_pool()
        async with pool.acquire() as conn:
            pending = await conn.fetchrow(
                """SELECT * FROM advisor_curiosity_prompts
                   WHERE user_id = $1 AND status = 'asked'
                     AND asked_at > NOW() - make_interval(hours => $2)
                   ORDER BY asked_at DESC LIMIT 1""",
                user_id, _PENDING_ANSWER_WINDOW_HOURS,
            )
        if not pending:
            return None

        gap = {
            'target_type': pending['target_type'], 'gap_type': pending['gap_type'],
            'contact_id': str(pending['target_contact_id']) if pending['target_contact_id'] else None,
            'contact_name': None,
        }
        if gap['contact_id']:
            async with pool.acquire() as conn:
                contact = await conn.fetchrow(
                    "SELECT COALESCE(custom_name, display_name, phone_number) AS name FROM contacts WHERE id = $1",
                    gap['contact_id'],
                )
            gap['contact_name'] = contact['name'] if contact else None
        gap_description = self._gap_description(gap)

        ai = get_ai_client()
        try:
            result = await ai.complete_json([{
                'role': 'user',
                'content': CLASSIFY_CURIOSITY_ANSWER.format(
                    question=pending['question_text'], gap_description=gap_description, message=message,
                ),
            }])
        except Exception as exc:
            log.warning('curiosity_answer_classification_failed', error=str(exc))
            return None

        if not result.get('answers_question'):
            return None
        extracted_value = result.get('extracted_value')
        confidence = float(result.get('confidence') or 0)
        if not extracted_value or confidence < 0.6:
            return None

        await self._apply_answer(user_id, dict(pending), extracted_value)
        return {'gapDescription': gap_description, 'extractedValue': extracted_value}

    async def _apply_answer(self, user_id: str, prompt: dict, value: str) -> None:
        gap_type = prompt['gap_type']
        target_type = prompt['target_type']
        contact_id = prompt['target_contact_id']
        pool = await get_pool()
        async with pool.acquire() as conn:
            if target_type == 'contact' and gap_type == 'job_title':
                await conn.execute('UPDATE contacts SET job_title = $1 WHERE id = $2', value, contact_id)
            elif target_type == 'contact' and gap_type == 'company':
                await conn.execute('UPDATE contacts SET company = $1 WHERE id = $2', value, contact_id)
            elif target_type == 'contact' and gap_type == 'relationship_type':
                await conn.execute(
                    'UPDATE relationships SET relationship_type = $1 WHERE contact_id = $2 AND user_id = $3',
                    value, contact_id, user_id,
                )
            elif target_type == 'contact' and gap_type == 'interests':
                await conn.execute(
                    """INSERT INTO contact_insights (contact_id, user_id, insight_key, insight_value, confidence)
                       VALUES ($1, $2, 'interests', $3, 0.9)""",
                    contact_id, user_id, value,
                )
            elif target_type == 'user' and gap_type == 'interests':
                await conn.execute(
                    """INSERT INTO advisor_user_profiles (user_id, interests) VALUES ($1, $2::jsonb)
                       ON CONFLICT (user_id) DO UPDATE
                         SET interests = advisor_user_profiles.interests || $2::jsonb, updated_at = NOW()""",
                    user_id, json.dumps([value]),
                )
            elif target_type == 'user' and gap_type == 'motivational_style':
                await conn.execute(
                    """INSERT INTO advisor_user_profiles (user_id, motivational_style) VALUES ($1, $2::jsonb)
                       ON CONFLICT (user_id) DO UPDATE
                         SET motivational_style = advisor_user_profiles.motivational_style || $2::jsonb, updated_at = NOW()""",
                    user_id, json.dumps({'summary': value}),
                )

            await conn.execute(
                """UPDATE advisor_curiosity_prompts
                   SET status = 'answered', answer_value = $1, answered_at = NOW()
                   WHERE id = $2""",
                value, prompt['id'],
            )

    # ── Proactive delivery ───────────────────────────────────────────────

    async def run_proactive_for_all_users(self) -> int:
        pool = await get_pool()
        async with pool.acquire() as conn:
            users = await conn.fetch(
                """SELECT DISTINCT u.id FROM users u
                   LEFT JOIN advisor_user_profiles p ON p.user_id = u.id
                   WHERE COALESCE(p.companion_features_paused, false) = false""",
            )
        delivered = 0
        for u in users:
            if random.random() >= _PROACTIVE_FIRE_PROBABILITY:
                continue
            if await self._deliver_proactive(str(u['id'])):
                delivered += 1
        return delivered

    async def _deliver_proactive(self, user_id: str) -> bool:
        gap = await self.pick_next_gap(user_id)
        if not gap:
            return False
        asked = await self.ask_gap(user_id, gap, delivery='proactive')
        if not asked:
            return False
        await deliver_initiated_message(
            user_id, asked['question'],
            {'type': 'curiosity_question', 'promptId': asked['promptId'], 'gapType': gap['gap_type']},
        )
        return True


_instance: CuriosityEngine | None = None


def get_curiosity_engine() -> CuriosityEngine:
    global _instance
    if _instance is None:
        _instance = CuriosityEngine()
    return _instance
