import json
import structlog
from ..ai.client import get_ai_client
from ..ai.prompts import GENERATE_REPLIES, LIVE_SEARCH_CONTEXT
from ..config import settings
from ..database import get_pool
from ..models import MessageAnalysis, ReplySuggestions
from ..queue import publish_event
from ..memory import retrieval_service as memory
from .auto_response import AutoResponseService
from .scoped_automation import get_scoped_automation
from .web_search import get_web_search

log = structlog.get_logger()


class ReplyGenerator:
    def __init__(self) -> None:
        self._auto_response = AutoResponseService()

    async def save_and_process_suggestions(
        self,
        message_id: str,
        user_id: str,
        contact_id: str,
        conversation_id: str,
        body: str,
        suggestions: dict,
    ) -> list[dict]:
        from ..models import ReplySuggestions
        suggestions_model = ReplySuggestions(**suggestions)

        pool = await get_pool()
        inserted_suggestions = []
        async with pool.acquire() as conn:
            for s in suggestions_model.suggestions:
                suggestion_id = await conn.fetchval(
                    'INSERT INTO suggested_replies (message_id, suggestion_text, tone, reasoning)'
                    ' VALUES ($1, $2, $3, $4) RETURNING id',
                    message_id,
                    s.text,
                    s.tone,
                    s.reasoning,
                )
                inserted_suggestions.append({
                    'id': str(suggestion_id),
                    'text': s.text,
                    'tone': s.tone,
                    'reasoning': s.reasoning,
                })

        log.info('replies_saved_from_single_pass', message_id=message_id, count=len(suggestions_model.suggestions))

        if inserted_suggestions:
            eligibility = await self._auto_response.check_eligibility(
                user_id=user_id,
                conversation_id=conversation_id,
                contact_id=contact_id,
                message_body=body,
            )

            selected = inserted_suggestions[0]
            should_auto_send = False
            grant = None
            scope_reason = None
            if eligibility.should_send:
                if eligibility.approval_mode == 'auto':
                    should_auto_send = True
                else:
                    grant = await get_scoped_automation().find_active_grant(conversation_id)
                    if grant:
                        in_scope, scope_reason = await get_scoped_automation().check_reply_in_scope(
                            grant, body, selected['text'],
                        )
                        should_auto_send = in_scope

            if should_auto_send and eligibility.recipient_jid:
                async with pool.acquire() as conn:
                    await conn.execute(
                        """
                        UPDATE suggested_replies
                        SET status = CASE
                              WHEN id = $2::uuid THEN 'approved'::reply_status
                              ELSE 'dismissed'::reply_status
                            END,
                            updated_at = NOW()
                        WHERE message_id = $1 AND status = 'pending'
                        """,
                        message_id,
                        selected['id'],
                    )

                await self._auto_response.enqueue_send(
                    user_id=user_id,
                    message_id=message_id,
                    suggested_reply_id=selected['id'],
                    recipient_jid=eligibility.recipient_jid,
                    text=selected['text'],
                    delay_seconds=eligibility.delay_seconds,
                )
                log.info(
                    'auto_response_send_enqueued',
                    message_id=message_id,
                    suggestion_id=selected['id'],
                    delay_seconds=eligibility.delay_seconds,
                    via_scoped_grant=bool(grant),
                )
                if grant:
                    await get_scoped_automation().log_audit(
                        grant['id'], user_id, conversation_id, message_id,
                        'auto_sent', scope_reason or 'in_scope', selected['text'],
                    )
            else:
                log.info(
                    'auto_response_not_sent',
                    message_id=message_id,
                    reason=eligibility.reason,
                    approval_mode=eligibility.approval_mode,
                )
                if grant and scope_reason:
                    await get_scoped_automation().log_audit(
                        grant['id'], user_id, conversation_id, message_id,
                        'skipped_high_risk' if scope_reason == 'high_risk' else 'skipped_out_of_scope',
                        scope_reason,
                    )

        await publish_event(
            f'suggestion:ready:{user_id}',
            json.dumps({'messageId': message_id, 'count': len(suggestions_model.suggestions)}),
        )

        return inserted_suggestions

    async def generate(
        self,
        message_id: str,
        user_id: str,
        contact_id: str,
        conversation_id: str,
        body: str,
        analysis: MessageAnalysis,
    ) -> list[dict]:
        voice = await memory.get_user_voice(user_id)
        contact = await memory.get_contact_summary(user_id, contact_id)

        pool = await get_pool()
        async with pool.acquire() as conn:
            recent = await conn.fetch(
                """
                SELECT sender_type, body FROM messages
                WHERE conversation_id = $1 AND body IS NOT NULL
                ORDER BY whatsapp_timestamp DESC LIMIT 10
                """,
                conversation_id,
            )

        user_name = voice['user_name']
        contact_name = contact['contact_name']
        relationship_type = contact['relationship_type']

        if voice['writing_style']:
            style_data = voice['writing_style']
            user_style = json.dumps(style_data) if isinstance(style_data, dict) else str(style_data)
        else:
            user_style = 'casual, friendly, concise'

        contact_summary = ' '.join(
            p for p in (contact['personality_summary'] or '', contact['current_life_context'] or '') if p
        ).strip() or f'A {relationship_type}'

        context = '\n'.join(
            f"[{r['sender_type']}]: {r['body']}" for r in reversed(list(recent))
        ) or '(no prior context)'

        client = get_ai_client()

        # Conversation memory — rolling short-term state (topic, open questions,
        # pending promises, recent decisions), cheaper and more current than
        # re-deriving all of this from raw messages on every call.
        memory_context = ''
        convo_memory = await memory.get_conversation_state(conversation_id)
        memory_lines = []
        if convo_memory.get('current_topic'):
            memory_lines.append(f"Current topic: {convo_memory['current_topic']}")
        if convo_memory.get('unanswered_questions'):
            memory_lines.append(
                'Still-open questions from ' + contact_name + ': '
                + '; '.join(convo_memory['unanswered_questions'])
            )
        if convo_memory.get('pending_promises'):
            promises_text = '; '.join(
                f"{p['made_by']} promised: {p['text']}" for p in convo_memory['pending_promises']
            )
            memory_lines.append(f'Outstanding promises: {promises_text}')
        if memory_lines:
            memory_context = '\n\nConversation memory:\n' + '\n'.join(memory_lines)

        # Relationship memory — longer-horizon than conversation memory above
        # (outstanding promises spanning the whole relationship, recurring
        # themes, important dates), aggregated purely from past messages.
        relationship_context = ''
        try:
            rel_mem = await memory.get_relationship_memory(user_id, contact_id)
            rel_text = memory.format_relationship_memory(rel_mem)
            if rel_text:
                relationship_context = f'\n\nRelationship memory:\n{rel_text}'
        except Exception as exc:
            log.warning('relationship_memory_retrieval_failed_in_reply_gen', error=str(exc))

        # Live web search for factual questions
        search_context = ''
        if (
            analysis.intent.primary == 'question'
            and (settings.tavily_api_key or settings.serp_api_key)
            and _is_factual_query(body)
        ):
            results = await get_web_search().search(body[:200], max_results=3)
            if results:
                results_text = '\n'.join(f"- {r.title}: {r.snippet}" for r in results)
                try:
                    summary = await client.complete_text([{
                        'role': 'user',
                        'content': LIVE_SEARCH_CONTEXT.format(
                            question=body[:300],
                            search_results=results_text,
                        ),
                    }], service='intelligence', feature='conversation_summary', user_id=user_id)
                    if summary:
                        search_context = f'\n\nLive search answer for contact\'s question:\n{summary}'
                except Exception as exc:
                    log.warning('live_search_context_failed', error=str(exc))

        # Knowledge base retrieval — inject business-specific knowledge
        kb_context = ''
        try:
            kb_chunks = await memory.get_kb_chunks(user_id, body[:500], agent_id=None, limit=3)
            if kb_chunks:
                kb_text = '\n'.join(f"- {c['content'][:400]}" for c in kb_chunks)
                kb_context = f'\n\nRelevant knowledge base context:\n{kb_text}'
        except Exception as exc:
            log.warning('kb_retrieval_failed_in_reply_gen', error=str(exc))

        # Business Memory — approved, auto-learned + human-curated facts
        # (pricing, policies, hours, etc.), independent of the per-contact KB above.
        facts_context = ''
        try:
            facts_text = memory.format_business_facts(await memory.get_business_facts(user_id))
            if facts_text:
                facts_context = f'\n\nKnown business facts:\n{facts_text}'
        except Exception as exc:
            log.warning('business_facts_retrieval_failed_in_reply_gen', error=str(exc))

        # Catalog context — inject active products/services so the AI can answer
        # pricing, stock, and availability questions correctly.
        catalog_context = ''
        try:
            catalog_items = await memory.get_relevant_catalog(user_id, limit=30)
            catalog_text = memory.format_catalog_items(catalog_items)
            if catalog_text:
                catalog_context = f'\n\nCatalog (Products & Services):\n{catalog_text}'

            # Business OS Phase D (docs/BUSINESS_OS_PLAN.md §9) — if the
            # message is about a specific catalog item, tell the model what
            # other customers who bought it usually buy too, e.g. "Peter
            # requests brake pads" -> mention Engine Oil/Oil Filter.
            mentioned = memory.find_mentioned_catalog_item(catalog_items, body)
            if mentioned:
                co_purchases = await memory.get_co_purchases(user_id, str(mentioned['id']))
                if co_purchases:
                    names = ', '.join(c['product_name'] for c in co_purchases)
                    catalog_context += (
                        f"\n\nCustomers who buy {mentioned['name']} usually also buy: {names}. "
                        "Mention this as a suggestion only if it fits naturally — don't force it."
                    )
        except Exception as exc:
            log.warning('catalog_retrieval_failed_in_reply_gen', error=str(exc))

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
        ) + memory_context + relationship_context + search_context + kb_context + facts_context + catalog_context

        raw = await client.complete_json(
            [{'role': 'user', 'content': prompt}],
            service='intelligence', feature='reply_generation', user_id=user_id,
        )
        suggestions_model = ReplySuggestions(**raw)

        pool = await get_pool()
        inserted_suggestions = []
        async with pool.acquire() as conn:
            for s in suggestions_model.suggestions:
                suggestion_id = await conn.fetchval(
                    'INSERT INTO suggested_replies (message_id, suggestion_text, tone, reasoning)'
                    ' VALUES ($1, $2, $3, $4) RETURNING id',
                    message_id,
                    s.text,
                    s.tone,
                    s.reasoning,
                )
                inserted_suggestions.append({
                    'id': str(suggestion_id),
                    'text': s.text,
                    'tone': s.tone,
                    'reasoning': s.reasoning,
                })

        log.info('replies_generated', message_id=message_id, count=len(suggestions_model.suggestions))

        if inserted_suggestions:
            # check_eligibility (not evaluate) so a scoped-automation grant
            # can override just the approval_mode gate below while every
            # other safety check (business hours, exclusions, escalation
            # keywords, group/broadcast skipping) still applies exactly as
            # it would for a normal auto-response.
            eligibility = await self._auto_response.check_eligibility(
                user_id=user_id,
                conversation_id=conversation_id,
                contact_id=contact_id,
                message_body=body,
            )

            selected = inserted_suggestions[0]
            should_auto_send = False
            grant = None
            scope_reason = None
            if eligibility.should_send:
                if eligibility.approval_mode == 'auto':
                    should_auto_send = True
                else:
                    # Advisor Companion Plan Phase 6 (§3.5/§9) — Safe Scoped
                    # Automation: a time-limited, conversation-specific
                    # grant can auto-send even when the account's global
                    # approval_mode requires review, but only for a reply
                    # judged in-scope and low-risk for THIS exchange.
                    grant = await get_scoped_automation().find_active_grant(conversation_id)
                    if grant:
                        in_scope, scope_reason = await get_scoped_automation().check_reply_in_scope(
                            grant, body, selected['text'],
                        )
                        should_auto_send = in_scope

            if should_auto_send and eligibility.recipient_jid:
                async with pool.acquire() as conn:
                    await conn.execute(
                        """
                        UPDATE suggested_replies
                        SET status = CASE
                              WHEN id = $2::uuid THEN 'approved'::reply_status
                              ELSE 'dismissed'::reply_status
                            END,
                            updated_at = NOW()
                        WHERE message_id = $1 AND status = 'pending'
                        """,
                        message_id,
                        selected['id'],
                    )

                await self._auto_response.enqueue_send(
                    user_id=user_id,
                    message_id=message_id,
                    suggested_reply_id=selected['id'],
                    recipient_jid=eligibility.recipient_jid,
                    text=selected['text'],
                    delay_seconds=eligibility.delay_seconds,
                )
                log.info(
                    'auto_response_send_enqueued',
                    message_id=message_id,
                    suggestion_id=selected['id'],
                    delay_seconds=eligibility.delay_seconds,
                    via_scoped_grant=bool(grant),
                )
                if grant:
                    await get_scoped_automation().log_audit(
                        grant['id'], user_id, conversation_id, message_id,
                        'auto_sent', scope_reason or 'in_scope', selected['text'],
                    )
            else:
                log.info(
                    'auto_response_not_sent',
                    message_id=message_id,
                    reason=eligibility.reason,
                    approval_mode=eligibility.approval_mode,
                )
                if grant and scope_reason:
                    await get_scoped_automation().log_audit(
                        grant['id'], user_id, conversation_id, message_id,
                        'skipped_high_risk' if scope_reason == 'high_risk' else 'skipped_out_of_scope',
                        scope_reason,
                    )

        await publish_event(
            f'suggestion:ready:{user_id}',
            json.dumps({'messageId': message_id, 'count': len(suggestions_model.suggestions)}),
        )

        return [s.model_dump() for s in suggestions_model.suggestions]


_FACTUAL_MARKERS = (
    'what is', 'what are', 'who is', 'where is', 'when is',
    'how much', 'how many', 'price of', 'cost of', 'what\'s the',
    'latest', 'current', 'today\'s', 'news about', 'score',
    'weather', 'stock price', 'crypto', 'bitcoin', 'rate',
)


def _is_factual_query(text: str) -> bool:
    lower = text.lower()
    return any(m in lower for m in _FACTUAL_MARKERS)
