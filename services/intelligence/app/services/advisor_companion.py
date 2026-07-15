"""Advisor Companion Plan Phase 1/2/3 — Companion Brain Foundation +
Relationship Analysis Experience + Action Protocol And Approval
(docs/ADVISOR_COMPANION_PLAN.md §6.1).

Phase 1 (`handle_turn`) orchestrates a global-advisor turn: classify
intent, retrieve profile/memories/emotional state/contact context,
assemble a dynamic system prompt, call the model, propose a memory
update. Phase 2 (`handle_conversation_turn`) does the same for a turn
scoped to one specific WhatsApp conversation/contact — deeper retrieval
(relationship memory, contact profile, the contact's own emotional
signal), the relationship-advice policy, and the evidence/my-read/
alternative-read/what-I'd-do structured response for analysis-flavored
intents. Phase 3 completes the Boundary Keeper risk check (§3.11/§6.13)
on any proposed send and returns a fully-formed action proposal for Node
(routes/advisor.ts) to persist as `advisor_action_requests`. The Studio
advisor keeps its own separate flow in routes/conversation.py — its
context shape (catalog/rules/suppliers) is unrelated to either of these.
"""
import json
import structlog

from ..ai.client import get_ai_client
from ..ai.prompts import CLASSIFY_ADVISOR_TURN, RELATIONSHIP_ADVICE_POLICY, ANALYZE_CHAT_TURN, CONVERSATION_TURN
from ..database import get_pool
from ..memory import retrieval_service as memory
from ..neural.emotion import get_emotion_engine, emotional_congruence

log = structlog.get_logger()

_ANALYSIS_INTENTS = {'chat_analysis', 'relationship_advice', 'emotional_support'}

# Advisor Companion Plan Phase 2 (§3.6) — a low-valence/high-arousal user
# state gets a brief acknowledgment folded into the prompt, mirroring the
# plan's own worked example ("you asked about this when you were feeling
# anxious; here's my read with that in mind"). Phase 3's Boundary Keeper
# (§3.11/§6.13) reuses the same arousal threshold as one of its 3 factors.
_LOW_VALENCE_THRESHOLD = -0.2
_HIGH_AROUSAL_THRESHOLD = 0.6
_RECENT_CONTACT_SIGNAL_DAYS = 14

_DEFAULT_PROFILE = {
    'display_persona': {}, 'tone_preferences': {}, 'boundaries': {},
    'companion_features_paused': False, 'personal_mode_enabled': False,
}

ZURI_ACTION_INSTRUCTIONS = """
You can embed interactive CRM action tags in your response when directly relevant. Use only IDs explicitly provided in context. Available tags:

[ACTION: lead_score | <0-100> | <contact_id>]
[ACTION: pipeline_stage | <lead|prospect|qualified|proposal|negotiation|closed_won|closed_lost> | <contact_id>]
[ACTION: reply_draft | <contact_id> | <draft_message_text>]
[ACTION: reminder | <title> | <YYYY-MM-DD>]
[ACTION: generate_document | <quotation|invoice|proposal|contract> | <contact_id> | <one-line brief>]

Rules:
- Only suggest one or two actions per response — don't overload.
- Always write clean Markdown: use **bold**, bullet lists (- item), and headers (## Header) when helpful.
- Never leave raw asterisks, loose formatting, or broken brackets.
- When drafting a WhatsApp message, write it naturally — no formal salutations, no quotation marks around the text.
- Only suggest generate_document when the user explicitly asks to create/draft a quotation, invoice, proposal, or contract, and only with a contact_id already given in context — never invent one.
"""

_PERSONAL_MODE_ON_REPLY = (
    "Personal mode is on. I'll bring up gossip, your interests, and check-ins more freely from now on — "
    "say \"turn off personal mode\" any time to go back to normal."
)
_PERSONAL_MODE_OFF_REPLY = (
    "Personal mode is off. I'll go back to only bringing things up once you've shown you want them — "
    "say \"activate personal mode\" to turn the full experience back on."
)


class AdvisorCompanionService:
    async def handle_turn(self, user_id: str, question: str, session_id: str | None) -> dict:
        turn = await self._classify_turn(question)
        intent = turn.get('intent', 'unknown')

        if intent == 'activate_personal_mode':
            await self._set_personal_mode(user_id, True)
            return self._response(_PERSONAL_MODE_ON_REPLY, intent, mood='neutral', confidence=0.95)
        if intent == 'deactivate_personal_mode':
            await self._set_personal_mode(user_id, False)
            return self._response(_PERSONAL_MODE_OFF_REPLY, intent, mood='neutral', confidence=0.95)

        profile = await self._get_profile(user_id)
        memories = await self._get_recent_memories(user_id, limit=5)
        emotional_state = await get_emotion_engine().get_current_emotional_state(user_id)
        companion_mode = await self._get_session_companion_mode(session_id) if session_id else 'balanced'
        if intent == 'gossip':
            companion_mode = 'gossip'  # §3.7 Phase 2 — orchestrator's own judgment, not just the chip
        contacts_context = await self._get_contact_context(user_id, emotional_state)

        system_prompt = self._build_system_prompt(profile, memories, emotional_state, companion_mode, contacts_context)

        chat_history = await self._get_session_history(session_id) if session_id else []
        prompt_messages = [{'role': 'system', 'content': system_prompt}]
        prompt_messages.extend(chat_history)
        prompt_messages.append({'role': 'user', 'content': question})

        ai = get_ai_client()
        answer = await ai.complete_text(prompt_messages)

        await get_emotion_engine().record_advisor_turn(user_id, session_id, question)

        memory_suggestion = turn.get('memory_suggestion')
        if memory_suggestion:
            await self._save_memory_suggestion(user_id, session_id, memory_suggestion)

        if session_id:
            await self._update_session_state(session_id, companion_mode, emotional_state.get('dominantEmotion'), intent)

        return self._response(
            answer, intent,
            mood=emotional_state.get('dominantEmotion', 'neutral'),
            confidence=0.7,
            needs_clarification=bool(turn.get('needs_clarification')),
            companion_mode=companion_mode,
            memory_suggestion=memory_suggestion,
        )

    async def handle_conversation_turn(self, user_id: str, conversation_id: str, question: str,
                                        session_id: str | None) -> dict:
        """Advisor Companion Plan Phase 2 (§9) — deep, scoped analysis of
        one WhatsApp conversation. Folds in relationship memory, the
        contact's profile, and both parties' emotional signal, and — for
        analysis-flavored intents only — returns the evidence/my-read/
        alternative-read/what-I'd-do structure instead of a plain answer."""
        pool = await get_pool()
        messages = await memory.get_recent_messages(conversation_id, limit=30)
        if not messages:
            return self._response("I don't have any messages in this conversation yet.", 'unknown', mood='neutral', confidence=0.3)

        contact_name = messages[0].get('custom_name') or messages[0].get('display_name') or 'Contact'
        transcript = memory.format_transcript(messages, contact_name)

        async with pool.acquire() as conn:
            contact_row = await conn.fetchrow(
                '''SELECT co.id AS contact_id, co.lead_score, co.pipeline_stage, co.customer_status
                   FROM conversations c JOIN contacts co ON co.id = c.contact_id
                   WHERE c.id = $1''',
                conversation_id,
            )
        contact_id = str(contact_row['contact_id']) if contact_row else None

        turn = await self._classify_turn(question)
        intent = turn.get('intent', 'unknown')

        if intent == 'activate_personal_mode':
            await self._set_personal_mode(user_id, True)
            return self._response(_PERSONAL_MODE_ON_REPLY, intent, mood='neutral', confidence=0.95)
        if intent == 'deactivate_personal_mode':
            await self._set_personal_mode(user_id, False)
            return self._response(_PERSONAL_MODE_OFF_REPLY, intent, mood='neutral', confidence=0.95)

        emotional_state = await get_emotion_engine().get_current_emotional_state(user_id)
        companion_mode = await self._get_session_companion_mode(session_id) if session_id else 'balanced'
        if intent == 'gossip':
            # §3.7/§6.9 Phase 2 scope: reachability via the orchestrator's
            # own judgment, not just the explicit chip/phrase — the full
            # Gossip Worthiness Detector cron is Phase 4.5.
            companion_mode = 'gossip'

        contact_context = ''
        if contact_id:
            contact_summary = await memory.get_contact_summary(user_id, contact_id)
            rel_mem = await memory.get_relationship_memory(user_id, contact_id)
            rel_mem_text = memory.format_relationship_memory(rel_mem)
            parts = [
                f"Relationship type: {contact_summary.get('relationship_type', 'acquaintance')}",
            ]
            if contact_summary.get('personality_summary'):
                parts.append(f"Personality: {contact_summary['personality_summary']}")
            if rel_mem_text:
                parts.append(rel_mem_text)
            contact_context = '\n\nWhat you know about this contact:\n' + '\n'.join(parts)
            contact_context += (
                f"\n\nContact CRM: contact_id={contact_id}, "
                f"lead_score={contact_row.get('lead_score', 0)}, "
                f"pipeline_stage={contact_row.get('pipeline_stage') or 'unknown'}, "
                f"status={contact_row.get('customer_status') or 'contact'}"
            )

        emotional_context_line = ''
        if emotional_state.get('valence', 0.0) < _LOW_VALENCE_THRESHOLD and emotional_state.get('arousal', 0.0) > _HIGH_AROUSAL_THRESHOLD:
            emotional_context_line = "\nThe user seems to be in a tense or anxious mood right now — acknowledge that briefly if it's relevant, without making a big deal of it."

        is_analysis = intent in _ANALYSIS_INTENTS
        ai = get_ai_client()
        evidence = None
        my_read = None
        alternative_read = None
        what_i_would_do = None
        is_high_risk_draft = False

        if is_analysis:
            prompt = ANALYZE_CHAT_TURN.format(
                contact_name=contact_name, policy=RELATIONSHIP_ADVICE_POLICY,
                emotional_context_line=emotional_context_line, transcript=transcript,
                contact_context=contact_context, question=question,
            )
            try:
                result = await ai.complete_json([{'role': 'user', 'content': prompt}])
                answer = result.get('reply_markdown', '')
                evidence = result.get('evidence') or []
                my_read = result.get('my_read')
                alternative_read = result.get('alternative_read')
                what_i_would_do = result.get('what_i_would_do')
                is_high_risk_draft = bool(result.get('is_high_risk_draft'))
            except Exception as exc:
                log.warning('advisor_analysis_failed', error=str(exc))
                answer = "I had trouble putting together a full analysis just now — could you ask again?"
        else:
            prompt = CONVERSATION_TURN.format(
                contact_name=contact_name, policy=RELATIONSHIP_ADVICE_POLICY,
                emotional_context_line=emotional_context_line, transcript=transcript,
                contact_context=contact_context,
            ) + ZURI_ACTION_INSTRUCTIONS

            chat_history = await self._get_session_history(session_id) if session_id else []
            prompt_messages = [{'role': 'system', 'content': prompt}]
            prompt_messages.extend(chat_history)
            prompt_messages.append({'role': 'user', 'content': question})
            answer = await ai.complete_text(prompt_messages)

        await get_emotion_engine().record_advisor_turn(user_id, session_id, question, contact_id=contact_id)

        memory_suggestion = turn.get('memory_suggestion')
        if memory_suggestion:
            await self._save_memory_suggestion(user_id, session_id, memory_suggestion)

        if session_id:
            await self._update_session_state(session_id, companion_mode, emotional_state.get('dominantEmotion'), intent)

        analysis = None
        if is_analysis:
            analysis = {
                'evidence': evidence, 'myRead': my_read,
                'alternativeRead': alternative_read, 'whatIWouldDo': what_i_would_do,
            }

        # Advisor Companion Plan Phase 3 (§3.5/§6.1) — a drafted WhatsApp
        # message this turn becomes a proposed action Node persists as
        # advisor_action_requests once it has the assistant message_id;
        # the Boundary Keeper risk check (§3.11/§6.13) rides along on the
        # same proposal rather than a second pass.
        proposed_action = None
        if intent in ('draft_reply', 'send_message') and contact_id and answer.strip():
            risk_level = await self._assess_boundary_risk(user_id, contact_id, emotional_state, is_high_risk_draft)
            proposed_action = {
                'actionType': 'send_whatsapp_message',
                'payload': {'conversationId': conversation_id, 'contactId': contact_id, 'text': answer.strip()},
                'riskLevel': risk_level,
            }

        return self._response(
            answer, intent,
            mood=emotional_state.get('dominantEmotion', 'neutral'),
            confidence=0.7,
            needs_clarification=bool(turn.get('needs_clarification')),
            companion_mode=companion_mode,
            memory_suggestion=memory_suggestion,
            analysis=analysis,
            proposed_action=proposed_action,
        )

    def _response(self, answer: str, intent: str, *, mood: str, confidence: float,
                  needs_clarification: bool = False, companion_mode: str = 'balanced',
                  memory_suggestion: dict | None = None, analysis: dict | None = None,
                  proposed_action: dict | None = None) -> dict:
        return {
            'answer': answer,
            'assistantState': {
                'mood': mood,
                'companionMode': companion_mode,
                'confidence': confidence,
                'needsClarification': needs_clarification,
                'intent': intent,
            },
            'memorySuggestion': memory_suggestion,
            'analysis': analysis,
            'proposedAction': proposed_action,
        }

    async def _classify_turn(self, question: str) -> dict:
        ai = get_ai_client()
        try:
            return await ai.complete_json([
                {'role': 'user', 'content': CLASSIFY_ADVISOR_TURN.format(text=question)},
            ])
        except Exception as exc:
            log.warning('advisor_turn_classification_failed', error=str(exc))
            return {'intent': 'unknown', 'needs_clarification': False, 'memory_suggestion': None}

    async def _get_profile(self, user_id: str) -> dict:
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """SELECT display_persona, tone_preferences, boundaries,
                          companion_features_paused, personal_mode_enabled
                   FROM advisor_user_profiles WHERE user_id = $1""",
                user_id,
            )
        return dict(row) if row else dict(_DEFAULT_PROFILE)

    async def _set_personal_mode(self, user_id: str, enabled: bool) -> None:
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO advisor_user_profiles (user_id, personal_mode_enabled, personal_mode_enabled_at)
                   VALUES ($1, $2, CASE WHEN $2 THEN NOW() ELSE NULL END)
                   ON CONFLICT (user_id) DO UPDATE
                     SET personal_mode_enabled = $2,
                         personal_mode_enabled_at = CASE WHEN $2 THEN NOW() ELSE NULL END,
                         updated_at = NOW()""",
                user_id, enabled,
            )

    async def _get_recent_memories(self, user_id: str, limit: int = 5) -> list[dict]:
        pool = await get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """SELECT memory_type, memory_key, memory_value, confidence
                   FROM advisor_memories
                   WHERE user_id = $1 AND is_active = true
                   ORDER BY evidence_count DESC, last_seen_at DESC
                   LIMIT $2""",
                user_id, limit,
            )
        return [dict(r) for r in rows]

    async def _get_session_companion_mode(self, session_id: str) -> str:
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow('SELECT companion_mode FROM advisor_sessions WHERE id = $1', session_id)
        return row['companion_mode'] if row and row['companion_mode'] else 'balanced'

    async def _get_session_history(self, session_id: str) -> list[dict]:
        pool = await get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """SELECT role, content FROM advisor_messages
                   WHERE session_id = $1 ORDER BY created_at ASC LIMIT 10""",
                session_id,
            )
        return [{'role': 'user' if r['role'] == 'user' else 'assistant', 'content': r['content']} for r in rows]

    async def _get_contact_context(self, user_id: str, emotional_state: dict) -> str:
        """Same recency + emotional-congruence reranking Neural Layer/
        Advisor Phase 0 introduced for the global advisor's contact list —
        moved here from routes/conversation.py now that this service owns
        the global-advisor turn end to end."""
        pool = await get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                '''SELECT co.id AS contact_id,
                          COALESCE(co.custom_name, co.display_name, co.phone_number) AS contact_name,
                          c.last_message_preview, c.unread_count,
                          COALESCE(r.health_score, 50) AS health_score,
                          co.lead_score, co.pipeline_stage,
                          c.last_message_at
                   FROM conversations c
                   JOIN contacts co ON co.id = c.contact_id
                   LEFT JOIN relationships r ON r.contact_id = co.id AND r.user_id = c.user_id
                   WHERE c.user_id = $1 AND c.is_archived = false
                   ORDER BY c.last_message_at DESC NULLS LAST
                   LIMIT 20''',
                user_id,
            )
        if not rows:
            return 'No recent conversations found.'

        contact_ids = [row['contact_id'] for row in rows]
        async with pool.acquire() as conn:
            signal_rows = await conn.fetch(
                '''SELECT contact_id, AVG(valence) AS avg_valence, AVG(arousal) AS avg_arousal
                   FROM emotional_signals
                   WHERE user_id = $1 AND contact_id = ANY($2::uuid[])
                     AND created_at > NOW() - INTERVAL '14 days'
                   GROUP BY contact_id''',
                user_id, contact_ids,
            )
        congruence_by_contact = {str(r['contact_id']): (float(r['avg_valence']), float(r['avg_arousal'])) for r in signal_rows}

        current_valence = emotional_state.get('valence', 0.0)
        current_arousal = emotional_state.get('arousal', 0.3)
        n = len(rows)
        scored = []
        for i, row in enumerate(rows):
            recency_rank = 1.0 - (i / n)
            pair = congruence_by_contact.get(str(row['contact_id']))
            congruence = emotional_congruence(current_valence, current_arousal, *pair) if pair else 0.5
            scored.append((0.7 * recency_rank + 0.3 * congruence, row))
        scored.sort(key=lambda pair: pair[0], reverse=True)

        context_lines = []
        for _, row in scored:
            preview = (row['last_message_preview'] or '')[:100]
            context_lines.append(
                f"- {row['contact_name']} (ID: {row['contact_id']}): "
                f"health={row['health_score']}%, lead_score={row.get('lead_score') or 0}, "
                f"stage={row.get('pipeline_stage') or 'unknown'}, "
                f"unread={row['unread_count']}, last: \"{preview}\""
            )
        return '\n'.join(context_lines)

    def _build_system_prompt(self, profile: dict, memories: list[dict], emotional_state: dict,
                              companion_mode: str, contacts_context: str) -> str:
        persona_line = ''
        tone_prefs = profile.get('tone_preferences') or {}
        if tone_prefs:
            persona_line = f"\nThe user's known tone preferences: {json.dumps(tone_prefs)}."

        boundaries = profile.get('boundaries') or {}
        boundaries_line = f"\nRespect these stated boundaries: {json.dumps(boundaries)}." if boundaries else ''

        memories_line = ''
        if memories:
            memory_lines = '\n'.join(f"- ({m['memory_type']}) {m['memory_value']}" for m in memories)
            memories_line = f"\nWhat you already remember about this user:\n{memory_lines}"

        mood = emotional_state.get('dominantEmotion', 'neutral')
        mood_line = f"\nThe user's current apparent mood, from recent interactions: {mood}. Calibrate your tone accordingly — don't name this explicitly unless it's relevant."

        mode_instruction = _COMPANION_MODE_INSTRUCTIONS.get(companion_mode, _COMPANION_MODE_INSTRUCTIONS['balanced'])

        return (
            'You are Zuri, an AI relationship intelligence assistant and companion. '
            'You have deep knowledge of the user\'s WhatsApp contacts and conversations. '
            f'{mode_instruction}'
            f'{persona_line}{boundaries_line}{memories_line}{mood_line}\n\n'
            'Answer questions concisely and be specific. Reference contacts by name. '
            'When drafting a message, write it naturally as a WhatsApp message — '
            'no formal salutations, no quotation marks. Return only the draft text when asked to draft.\n'
            + ZURI_ACTION_INSTRUCTIONS
            + f'\n\nRecent contacts context:\n{contacts_context}'
        )

    async def _assess_boundary_risk(self, user_id: str, contact_id: str, emotional_state: dict,
                                     is_high_risk_draft: bool) -> str:
        """Advisor Companion Plan §3.11/§6.13 — the Boundary Keeper. Not a
        standalone service, an inline check on the approval path: is the
        drafted text itself high-valence-negative (already self-assessed
        by the model above), is the user's current arousal elevated, has
        this specific contact had a recent negative interaction? Two or
        more true -> 'high' (the "want to sleep on it?" prompt); one ->
        'medium'; zero -> 'low'. Never blocks — risk_level only changes
        what the approval card shows, approval is always required either way."""
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """SELECT AVG(valence) AS avg_valence FROM emotional_signals
                   WHERE user_id = $1 AND contact_id = $2
                     AND created_at > NOW() - make_interval(days => $3)""",
                user_id, contact_id, _RECENT_CONTACT_SIGNAL_DAYS,
            )
        recent_negative_interaction = bool(row and row['avg_valence'] is not None and float(row['avg_valence']) < _LOW_VALENCE_THRESHOLD)
        elevated_arousal = emotional_state.get('arousal', 0.0) > _HIGH_AROUSAL_THRESHOLD

        factors = sum([is_high_risk_draft, elevated_arousal, recent_negative_interaction])
        if factors >= 2:
            return 'high'
        if factors == 1:
            return 'medium'
        return 'low'

    async def _save_memory_suggestion(self, user_id: str, session_id: str | None, suggestion: dict) -> None:
        memory_type = suggestion.get('type')
        key = suggestion.get('key')
        value = suggestion.get('value')
        confidence = suggestion.get('confidence', 0.5)
        if not memory_type or not key or not value:
            return
        pool = await get_pool()
        async with pool.acquire() as conn:
            existing = await conn.fetchrow(
                """SELECT id, evidence_count FROM advisor_memories
                   WHERE user_id = $1 AND memory_key = $2 AND is_active = true""",
                user_id, key,
            )
            if existing:
                await conn.execute(
                    """UPDATE advisor_memories
                       SET memory_value = $1, evidence_count = evidence_count + 1,
                           last_seen_at = NOW(), confidence = LEAST(0.95, confidence + 0.1)
                       WHERE id = $2""",
                    value, existing['id'],
                )
            else:
                await conn.execute(
                    """INSERT INTO advisor_memories
                         (user_id, session_id, memory_type, memory_key, memory_value, confidence)
                       VALUES ($1, $2, $3, $4, $5, $6)""",
                    user_id, session_id, memory_type, key, value, confidence,
                )

    async def _update_session_state(self, session_id: str, companion_mode: str, emotional_mode: str | None, intent: str) -> None:
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """UPDATE advisor_sessions
                   SET companion_mode = $1, emotional_mode = $2, last_intent = $3, updated_at = NOW()
                   WHERE id = $4""",
                companion_mode, emotional_mode, intent, session_id,
            )


_COMPANION_MODE_INSTRUCTIONS = {
    'balanced': 'Be warm, direct, and helpful — a capable friend, not a stiff assistant.',
    'best_friend': "Talk like the user's close best friend — casual, warm, opinionated, a little playful.",
    'coach': 'Be encouraging and action-oriented, like a coach pushing the user toward their next step.',
    'therapist_like': 'Be gentle, reflective, and supportive. Ask thoughtful follow-up questions. Never call this "therapy" — refer to it as gentle support if asked.',
    'business_partner': 'Be sharp, pragmatic, and business-minded — like a co-founder thinking through the numbers with the user.',
    'dating_advisor': 'Focus on dating/relationship nuance — read tone carefully, never claim certainty about someone else\'s feelings.',
    'analyst': 'Be precise and evidence-first — lead with what you can actually observe before offering an interpretation.',
    'gossip': "Be playful, chatty, and opinionated about the user's contacts — but only ever state things you can actually back up from real signals; never invent drama.",
    'spiritual_companion': 'Be a quiet, non-denominational, non-proselytising source of comfort and reflection when asked — always respectful of the user\'s own stated tradition.',
}


_service: AdvisorCompanionService | None = None


def get_advisor_companion_service() -> AdvisorCompanionService:
    global _service
    if _service is None:
        _service = AdvisorCompanionService()
    return _service
