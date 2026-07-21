"""Advisor Companion Plan Phase 1/2/3/4 — Companion Brain Foundation +
Relationship Analysis Experience + Action Protocol And Approval + Watch
Replies And Narration (docs/ADVISOR_COMPANION_PLAN.md §6.1).

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
(routes/advisor.ts) to persist as `advisor_action_requests`. Phase 4
(`find_active_watch`/`generate_reply_narration`) narrates an incoming
reply plus suggested next responses when the user is watching a
conversation — called from `workers/message_worker.py` right after the
existing per-message analysis, reusing the same `advisor_action_requests`
table's already-unused `watch_conversation` action type rather than a new
table. The Studio advisor keeps its own separate flow in
routes/conversation.py — its context shape (catalog/rules/suppliers) is
unrelated to either of these.
"""
import json
import random
import structlog

from ..ai.client import get_ai_client
from ..ai.prompts import CLASSIFY_ADVISOR_TURN, RELATIONSHIP_ADVICE_POLICY, ANALYZE_CHAT_TURN, CONVERSATION_TURN, NARRATE_REPLY
from ..database import get_pool
from ..memory import retrieval_service as memory
from ..neural.emotion import get_emotion_engine, emotional_congruence
from .scoped_automation import get_scoped_automation
from .curiosity_engine import get_curiosity_engine
from .business_context_service import get_business_context_service

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

# Zuri Curiosity Layer — the inline, "global" half; the proactive random-
# ask half lives in curiosity_engine.py's own cron. Kept low so it reads
# as occasional curiosity, not a recurring interrogation.
_CURIOSITY_ASK_PROBABILITY = 0.2

_DEFAULT_PROFILE = {
    'display_persona': {}, 'tone_preferences': {}, 'boundaries': {},
    'companion_features_paused': False, 'personal_mode_enabled': False, 'spiritual_preferences': {},
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
        turn = await self._classify_turn(question, user_id=user_id)
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
        if intent == 'spiritual' and (profile.get('spiritual_preferences') or {}).get('tradition'):
            # §3.9/§6.11 Phase 4.5 — "pray with me" is a normal turn, not a
            # separate action type; only reachable once a tradition is set.
            companion_mode = 'spiritual_companion'
        if intent == 'career_advice':
            # Career & Growth Engine Phase 5 (§11) — same auto-switch
            # reasoning as gossip/spiritual_companion above.
            companion_mode = 'career_coach'
        contacts_context = await self._get_contact_context(user_id, emotional_state)
        curiosity_line = await self._curiosity_context_line(user_id, question, session_id)
        if companion_mode == 'career_coach':
            curiosity_line += await self._career_context_line(user_id)

        system_prompt = self._build_system_prompt(profile, memories, emotional_state, companion_mode, contacts_context, curiosity_line)

        chat_history = await self._get_session_history(session_id) if session_id else []
        prompt_messages = [{'role': 'system', 'content': system_prompt}]
        prompt_messages.extend(chat_history)
        prompt_messages.append({'role': 'user', 'content': question})

        ai = get_ai_client()
        answer = await ai.complete_text(
            prompt_messages, service='advisor', feature='advisor_chat', user_id=user_id,
        )

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

        turn = await self._classify_turn(question, user_id=user_id)
        intent = turn.get('intent', 'unknown')

        if intent == 'activate_personal_mode':
            await self._set_personal_mode(user_id, True)
            return self._response(_PERSONAL_MODE_ON_REPLY, intent, mood='neutral', confidence=0.95)
        if intent == 'deactivate_personal_mode':
            await self._set_personal_mode(user_id, False)
            return self._response(_PERSONAL_MODE_OFF_REPLY, intent, mood='neutral', confidence=0.95)

        # Advisor Companion Plan Phase 4 (§3.5/§5.4/§9) — "watch this chat
        # and tell me when they reply" as a natural-language path onto the
        # same advisor_action_requests-backed watch, alongside the
        # dedicated POST/DELETE /api/advisor/watch endpoints the frontend
        # toggle uses.
        if intent == 'watch_replies':
            if not (contact_id and session_id):
                return self._response(
                    "I need an open conversation to watch — open a specific chat first.",
                    intent, mood='neutral', confidence=0.6,
                )
            existing_watch = await self.find_active_watch(conversation_id)
            if existing_watch:
                reply = f"I'm already watching this conversation with {contact_name} — I'll let you know as soon as they reply."
            else:
                await self._create_watch(user_id, session_id, conversation_id, contact_id)
                reply = f"Got it — I'm watching this conversation now. I'll let you know as soon as {contact_name} replies, plus a few suggested responses."
            return self._response(reply, intent, mood='neutral', confidence=0.9)

        # Advisor Companion Plan Phase 6 (§3.5/§9) — "handle this
        # conversation for 10 minutes, auto-send only logistical
        # confirmations." Scope description is the user's literal
        # message; duration defaults to 30 minutes per the plan's own
        # worked example. Revocation is REST-only (no chat-intent
        # counterpart), same asymmetry Phase 4's watch already has.
        if intent == 'scoped_automation':
            if not (contact_id and session_id):
                return self._response(
                    "I need an open conversation to scope this to — open a specific chat first.",
                    intent, mood='neutral', confidence=0.6,
                )
            grant = await get_scoped_automation().create_grant(user_id, session_id, conversation_id, question)
            reply = (
                f"Got it — for the next 30 minutes, I'll auto-send replies to {contact_name} that clearly match "
                f"what you described (\"{question}\"), and leave anything else for you to review. "
                "You can revoke this any time from the conversation panel."
            )
            return self._response(reply, intent, mood='neutral', confidence=0.85)

        emotional_state = await get_emotion_engine().get_current_emotional_state(user_id)
        profile = await self._get_profile(user_id)
        companion_mode = await self._get_session_companion_mode(session_id) if session_id else 'balanced'
        if intent == 'gossip':
            # §3.7/§6.9 Phase 2 scope: reachability via the orchestrator's
            # own judgment, not just the explicit chip/phrase — the full
            # Gossip Worthiness Detector cron is Phase 4.5.
            companion_mode = 'gossip'
        if intent == 'spiritual' and (profile.get('spiritual_preferences') or {}).get('tradition'):
            companion_mode = 'spiritual_companion'  # §3.9/§6.11 Phase 4.5 — "pray with me"
        if intent == 'career_advice':
            companion_mode = 'career_coach'  # Career & Growth Engine Phase 5 (§11)

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
            # Platform Polish Phase 4 (§6.3) — analysis-flavored intents fold
            # in the same business-entity context BusinessContextService
            # centrally assembles for Studio, rather than this service
            # re-deriving its own opportunities/projects/invoices query.
            # Skipped for non-analysis intents so a routine chit-chat turn
            # doesn't pay for context it won't use.
            if intent in _ANALYSIS_INTENTS:
                business_context = await get_business_context_service().get_context_block(user_id, contact_id=contact_id)
                if business_context:
                    contact_context += '\n\nBusiness context for this contact:\n' + business_context

        emotional_context_line = ''
        if emotional_state.get('valence', 0.0) < _LOW_VALENCE_THRESHOLD and emotional_state.get('arousal', 0.0) > _HIGH_AROUSAL_THRESHOLD:
            emotional_context_line = "\nThe user seems to be in a tense or anxious mood right now — acknowledge that briefly if it's relevant, without making a big deal of it."
        emotional_context_line += self._spiritual_verse_line(profile, emotional_state)
        emotional_context_line += await self._curiosity_context_line(user_id, question, session_id)
        if companion_mode == 'career_coach':
            emotional_context_line += await self._career_context_line(user_id)

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
                result = await ai.complete_json(
                    [{'role': 'user', 'content': prompt}],
                    service='advisor', feature='advisor_analysis', user_id=user_id,
                )
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
            answer = await ai.complete_text(
                prompt_messages, service='advisor', feature='advisor_chat', user_id=user_id,
            )

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
            # Platform Polish Phase 2 §4.3 — extend Advisor's own send-flow
            # with the exact override reply_gen.py's background suggestion
            # pipeline already earns from a scoped-automation grant: only
            # when the user has already granted this specific conversation
            # scoped automation, and only when this exact drafted reply is
            # judged in-scope + not high-risk, does it skip the click.
            # Outside an active grant, or at any risk level the Boundary
            # Keeper doesn't clear, the approval step stays mandatory.
            auto_send = False
            if risk_level != 'high':
                grant = await get_scoped_automation().find_active_grant(conversation_id)
                if grant:
                    in_scope, _reason = await get_scoped_automation().check_reply_in_scope(
                        grant, question, answer.strip(),
                    )
                    auto_send = in_scope
            proposed_action = {
                'actionType': 'send_whatsapp_message',
                'payload': {'conversationId': conversation_id, 'contactId': contact_id, 'text': answer.strip()},
                'riskLevel': risk_level,
                'autoSend': auto_send,
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

    async def _classify_turn(self, question: str, user_id: str | None = None) -> dict:
        ai = get_ai_client()
        try:
            return await ai.complete_json([
                {'role': 'user', 'content': CLASSIFY_ADVISOR_TURN.format(text=question)},
            ], service='advisor', feature='advisor_intent_classification', user_id=user_id)
        except Exception as exc:
            log.warning('advisor_turn_classification_failed', error=str(exc))
            return {'intent': 'unknown', 'needs_clarification': False, 'memory_suggestion': None}

    async def _get_profile(self, user_id: str) -> dict:
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """SELECT display_persona, tone_preferences, boundaries,
                          companion_features_paused, personal_mode_enabled, spiritual_preferences
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

        if isinstance(emotional_state, str):
            try:
                import json
                emotional_state = json.loads(emotional_state)
                while isinstance(emotional_state, str):
                    emotional_state = json.loads(emotional_state)
            except Exception:
                emotional_state = {}
        if not isinstance(emotional_state, dict):
            emotional_state = {}

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

    async def _career_context_line(self, user_id: str) -> str:
        """Career & Growth Engine Phase 5 (§11) — folded in only when
        companion_mode is 'career_coach', the same "don't pay for context
        the turn doesn't need" discipline as the rest of this file. Reads
        career_profiles' own goals text, active (non-terminal)
        career_opportunities, and the most recent career_interviews rounds —
        no new detection pass, purely a read of what Phases 1/4 already
        store."""
        pool = await get_pool()
        async with pool.acquire() as conn:
            profile = await conn.fetchrow(
                'SELECT career_goals_text, target_roles FROM career_profiles WHERE user_id = $1', user_id,
            )
            opportunities = await conn.fetch(
                """SELECT title, company_or_org, status FROM career_opportunities
                   WHERE user_id = $1 AND status NOT IN ('rejected', 'withdrawn', 'archived')
                   ORDER BY updated_at DESC LIMIT 8""",
                user_id,
            )
            interviews = await conn.fetch(
                """SELECT ci.interview_type, ci.outcome, ci.scheduled_at, co.title, co.company_or_org
                   FROM career_interviews ci JOIN career_opportunities co ON co.id = ci.career_opportunity_id
                   WHERE ci.user_id = $1 ORDER BY ci.created_at DESC LIMIT 5""",
                user_id,
            )

        if not profile and not opportunities and not interviews:
            return "\n\nThe user hasn't set up a career profile yet — if relevant, suggest they visit /career to add their skills, target roles, and goals so advice can be more specific."

        lines = ['\n\nCareer context:']
        if profile and profile['career_goals_text']:
            lines.append(f"Stated career goals: {profile['career_goals_text']}")
        if profile and profile['target_roles']:
            lines.append(f"Target roles: {', '.join(profile['target_roles'])}")
        if opportunities:
            opp_lines = '\n'.join(
                f"- {o['title']}" + (f" at {o['company_or_org']}" if o['company_or_org'] else '') + f" ({o['status']})"
                for o in opportunities
            )
            lines.append(f"Active opportunities:\n{opp_lines}")
        if interviews:
            iv_lines = '\n'.join(
                f"- {i['interview_type'].replace('_', ' ')} for {i['title']}"
                + (f" at {i['company_or_org']}" if i['company_or_org'] else '') + f" — outcome: {i['outcome']}"
                for i in interviews
            )
            lines.append(f"Recent interview rounds:\n{iv_lines}")
        return '\n'.join(lines)

    def _build_system_prompt(self, profile: dict, memories: list[dict], emotional_state: dict,
                              companion_mode: str, contacts_context: str, curiosity_line: str = '') -> str:
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
        spiritual_line = self._spiritual_verse_line(profile, emotional_state)

        mode_instruction = _COMPANION_MODE_INSTRUCTIONS.get(companion_mode, _COMPANION_MODE_INSTRUCTIONS['balanced'])

        return (
            'You are Zuri, an AI relationship intelligence assistant and companion. '
            'You have deep knowledge of the user\'s WhatsApp contacts and conversations. '
            f'{mode_instruction}'
            f'{persona_line}{boundaries_line}{memories_line}{mood_line}{spiritual_line}{curiosity_line}\n\n'
            'Answer questions concisely and be specific. Reference contacts by name. '
            'When drafting a message, write it naturally as a WhatsApp message — '
            'no formal salutations, no quotation marks. Return only the draft text when asked to draft.\n'
            + ZURI_ACTION_INSTRUCTIONS
            + f'\n\nRecent contacts context:\n{contacts_context}'
        )

    def _spiritual_verse_line(self, profile: dict, emotional_state: dict) -> str:
        """Advisor Companion Plan Phase 4.5 (§3.9/§6.11/§9) — context-
        sensitive verse offering. A real-time companion behavior folded
        inline here (not a cron): only ever active if the user has
        explicitly set a spiritual tradition (never inferred, never a
        default), and only suggested — not forced — when the same low-
        valence/high-arousal state Phase 2's emotional_context_line
        already checks for is present."""
        tradition = (profile.get('spiritual_preferences') or {}).get('tradition')
        if not tradition:
            return ''
        if emotional_state.get('valence', 0.0) >= _LOW_VALENCE_THRESHOLD or emotional_state.get('arousal', 0.0) <= _HIGH_AROUSAL_THRESHOLD:
            return ''
        return (
            f"\nThe user has opted into {tradition} spiritual companionship and seems to be carrying a lot "
            "right now — you may briefly offer a relevant, properly-attributed verse and a short word of "
            "comfort if it feels natural, but never force it or bring up faith unprompted otherwise."
        )

    async def _curiosity_context_line(self, user_id: str, question: str, session_id: str | None) -> str:
        """Zuri Curiosity Layer — the "global" always-on half (the other
        half is the proactive cron in curiosity_engine.py). First checks
        whether this message actually answers a curiosity question asked
        in the last 3 days (writes the structured field if so, and folds
        a brief acknowledgment instruction into the prompt); otherwise,
        with a 20% chance per turn, suggests one new gap-filling question
        the model MAY weave in naturally — never forced, never every turn."""
        engine = get_curiosity_engine()
        answered = await engine.check_pending_answer(user_id, question)
        if answered:
            return (
                f"\nThe user just told you something you'd asked about ({answered['gapDescription']}): "
                f"\"{answered['extractedValue']}\" — acknowledge this warmly and briefly before continuing."
            )

        if random.random() >= _CURIOSITY_ASK_PROBABILITY:
            return ''
        gap = await engine.pick_next_gap(user_id)
        if not gap:
            return ''
        asked = await engine.ask_gap(user_id, gap, delivery='inline', session_id=session_id)
        if not asked:
            return ''
        return (
            f"\nYou're curious about something you don't know yet — if it feels natural given the conversation, "
            f"you may also ask: \"{asked['question']}\" — but only if it doesn't feel forced or out of place; "
            "otherwise skip it silently and just answer normally."
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

    async def find_active_watch(self, conversation_id: str) -> dict | None:
        """Advisor Companion Plan Phase 4 (§5.4/§9) — is anyone watching
        this conversation right now? Reuses advisor_action_requests'
        already-unused 'watch_conversation' action type (auto-approved at
        creation — a passive watch request needs no separate approval
        step) instead of a dedicated table."""
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """SELECT id, user_id, session_id, payload
                   FROM advisor_action_requests
                   WHERE action_type = 'watch_conversation' AND status = 'approved'
                     AND payload->>'conversationId' = $1
                     AND (expires_at IS NULL OR expires_at > NOW())
                   ORDER BY created_at DESC LIMIT 1""",
                conversation_id,
            )
        return dict(row) if row else None

    async def _create_watch(self, user_id: str, session_id: str, conversation_id: str,
                             contact_id: str, minutes: int = 60) -> None:
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO advisor_action_requests
                     (user_id, session_id, action_type, status, payload, risk_level, approved_at, expires_at)
                   VALUES ($1, $2, 'watch_conversation', 'approved', $3::jsonb, 'low', NOW(), NOW() + make_interval(mins => $4))""",
                user_id, session_id, {'conversationId': conversation_id, 'contactId': contact_id}, minutes,
            )

    async def generate_reply_narration(self, user_id: str, conversation_id: str, contact_id: str,
                                        new_message: str) -> dict:
        """Phase 4 (§3.5/§3.6/§9) — narrate an incoming reply plus 2-3
        suggested next responses in one structured call. Deliberately its
        own lightweight prompt rather than reply_gen.py's heavier pipeline,
        which has its own DB-write and auto-response side effects that
        don't belong to a watched-conversation narration."""
        messages = await memory.get_recent_messages(conversation_id, limit=15)
        contact_name = 'Contact'
        transcript = ''
        if messages:
            contact_name = messages[0].get('custom_name') or messages[0].get('display_name') or 'Contact'
            transcript = memory.format_transcript(messages, contact_name)

        trend_context = await self._get_reply_trend_context(user_id, contact_id)

        contact_context = ''
        contact_summary = await memory.get_contact_summary(user_id, contact_id)
        if contact_summary.get('personality_summary'):
            contact_context = f"\n\nWhat you know about {contact_name}: {contact_summary['personality_summary']}"

        prompt = NARRATE_REPLY.format(
            contact_name=contact_name, new_message=new_message, transcript=transcript,
            trend_context=trend_context, contact_context=contact_context,
        )
        ai = get_ai_client()
        try:
            result = await ai.complete_json(
                [{'role': 'user', 'content': prompt}],
                service='advisor', feature='advisor_narration', user_id=user_id,
            )
            narration = result.get('narration') or f'{contact_name} replied.'
            suggested_replies = result.get('suggested_replies') or []
        except Exception as exc:
            log.warning('advisor_narration_failed', error=str(exc))
            narration = f'{contact_name} replied: "{new_message[:120]}"'
            suggested_replies = []

        return {'narration': narration, 'suggestedReplies': suggested_replies, 'contactName': contact_name}

    async def _get_reply_trend_context(self, user_id: str, contact_id: str) -> str:
        """Cheap signal behind the narration's "warmer than last week"
        read — trailing-7-day vs prior-7-day average valence from
        emotional_signals, plus the relationship's own health_trend. Both
        already-computed signals, not a new detection pass."""
        pool = await get_pool()
        async with pool.acquire() as conn:
            valence_row = await conn.fetchrow(
                """SELECT
                     AVG(valence) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') AS recent_valence,
                     AVG(valence) FILTER (WHERE created_at <= NOW() - INTERVAL '7 days'
                                            AND created_at > NOW() - INTERVAL '14 days') AS prior_valence
                   FROM emotional_signals WHERE user_id = $1 AND contact_id = $2""",
                user_id, contact_id,
            )
            health_row = await conn.fetchrow(
                'SELECT health_trend FROM relationships WHERE user_id = $1 AND contact_id = $2',
                user_id, contact_id,
            )
        lines = []
        if valence_row and valence_row['recent_valence'] is not None and valence_row['prior_valence'] is not None:
            delta = float(valence_row['recent_valence']) - float(valence_row['prior_valence'])
            if delta > 0.15:
                lines.append('Their tone has been noticeably warmer this past week than the week before.')
            elif delta < -0.15:
                lines.append('Their tone has been noticeably cooler this past week than the week before.')
        if health_row and health_row['health_trend'] in ('improving', 'declining'):
            lines.append(f"Overall relationship health trend: {health_row['health_trend']}.")
        return f"\nTrend signals: {' '.join(lines)}" if lines else ''

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
    'career_coach': "Be a sharp, encouraging career coach — concrete and action-oriented about the user's job search, applications, interviews, and professional growth. Ground every suggestion in their actual career profile/opportunities/interview history below, never generic career-blog advice.",
}


_service: AdvisorCompanionService | None = None


def get_advisor_companion_service() -> AdvisorCompanionService:
    global _service
    if _service is None:
        _service = AdvisorCompanionService()
    return _service
