import structlog
import json
import re
from datetime import date
from ..ai.client import get_ai_client
from ..ai.embeddings import embed_text
from ..ai.prompts import ANALYSE_MESSAGE, UNIFIED_SINGLE_PASS_COGNITION
from ..config import settings
from ..database import get_pool
from ..models import MessageAnalysis
from ..memory import retrieval_service as memory

log = structlog.get_logger()

_VALID_SENTIMENTS = {'positive', 'negative', 'neutral', 'mixed'}
_VALID_URGENCIES = {'low', 'medium', 'high', 'urgent'}


class MessageAnalyser:
    def _parse_xml_tag(self, text: str, tag_name: str) -> str:
        pattern = f"<{tag_name}>(.*?)</{tag_name}>"
        match = re.search(pattern, text, re.DOTALL)
        return match.group(1).strip() if match else ""

    async def analyse(
        self,
        message_id: str,
        user_id: str,
        conversation_id: str,
        contact_id: str,
        generate_reply: bool = False,
    ) -> tuple[MessageAnalysis, dict | None]:
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

        # Factual query keywords
        _FACTUAL_MARKERS = (
            'what is', 'what are', 'who is', 'where is', 'when is',
            'how much', 'how many', 'price of', 'cost of', "what's the",
            'latest', 'current', 'today\'s', 'news about', 'score',
            'weather', 'stock price', 'crypto', 'bitcoin', 'rate',
        )
        def is_factual_query(text: str) -> bool:
            lower = text.lower()
            return any(m in lower for m in _FACTUAL_MARKERS)

        client = get_ai_client()

        reply_generation_section = ""
        response_tag_instruction = "Do NOT output a `<response>` tag, since no reply generation was requested."

        if generate_reply:
            try:
                # 1. User voice
                voice = await memory.get_user_voice(user_id)
                user_style = voice.get('writing_style', 'casual, friendly, concise')
                if isinstance(user_style, dict):
                    user_style = json.dumps(user_style)
                
                # 2. Contact summary
                contact_info = await memory.get_contact_summary(user_id, contact_id)
                contact_summary = ' '.join(
                    p for p in (contact_info.get('personality_summary') or '', contact_info.get('current_life_context') or '') if p
                ).strip() or f"A {relationship_type}"
                
                # 3. Conversation state / memory
                memory_context = ''
                convo_memory = await memory.get_conversation_state(conversation_id)
                memory_lines = []
                if convo_memory.get('current_topic'):
                    memory_lines.append(f"Current topic: {convo_memory['current_topic']}")
                if convo_memory.get('unanswered_questions'):
                    memory_lines.append(
                        f"Still-open questions from {contact_name}: "
                        + '; '.join(convo_memory['unanswered_questions'])
                    )
                if convo_memory.get('pending_promises'):
                    promises_text = '; '.join(
                        f"{p['made_by']} promised: {p['text']}" for p in convo_memory['pending_promises']
                    )
                    memory_lines.append(f'Outstanding promises: {promises_text}')
                if memory_lines:
                    memory_context = '\n\nConversation memory:\n' + '\n'.join(memory_lines)
                    
                # 4. Relationship memory
                relationship_context = ''
                try:
                    rel_mem = await memory.get_relationship_memory(user_id, contact_id)
                    rel_text = memory.format_relationship_memory(rel_mem)
                    if rel_text:
                        relationship_context = f'\n\nRelationship memory:\n{rel_text}'
                except Exception as exc:
                    log.warning('relationship_memory_retrieval_failed_in_single_pass', error=str(exc))
                    
                # 5. Live web search
                search_context = ''
                if (
                    sender_type == 'contact'
                    and is_factual_query(body)
                ):
                    try:
                        from .web_search import get_web_search
                        from ..ai.prompts import LIVE_SEARCH_CONTEXT
                        results = await get_web_search().search(body[:200], max_results=3)
                        if results:
                            results_text = '\n'.join(f"- {r.title}: {r.snippet}" for r in results)
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
                        log.warning('live_search_failed_in_single_pass', error=str(exc))
                        
                # 6. KB retrieval
                kb_context = ''
                try:
                    kb_chunks = await memory.get_kb_chunks(user_id, body[:500], agent_id=None, limit=3)
                    if kb_chunks:
                        kb_text = '\n'.join(f"- {c['content'][:400]}" for c in kb_chunks)
                        kb_context = f'\n\nRelevant knowledge base context:\n{kb_text}'
                except Exception as exc:
                    log.warning('kb_retrieval_failed_in_single_pass', error=str(exc))
                    
                # 7. Known business facts
                facts_context = ''
                try:
                    facts_text = memory.format_business_facts(await memory.get_business_facts(user_id))
                    if facts_text:
                        facts_context = f'\n\nKnown business facts:\n{facts_text}'
                except Exception as exc:
                    log.warning('business_facts_retrieval_failed_in_single_pass', error=str(exc))
                    
                # 8. Catalog Context
                catalog_context = ''
                try:
                    catalog_items = await memory.get_relevant_catalog(user_id, limit=30)
                    catalog_text = memory.format_catalog_items(catalog_items)
                    if catalog_text:
                        catalog_context = f'\n\nCatalog (Products & Services):\n{catalog_text}'
                    
                    mentioned = memory.find_mentioned_catalog_item(catalog_items, body)
                    if mentioned:
                        co_purchases = await memory.get_co_purchases(user_id, str(mentioned['id']))
                        if co_purchases:
                            names = ', '.join(c['product_name'] for c in co_purchases)
                            catalog_context += (
                                f"\n\nCustomers who buy {mentioned['name']} usually also buy: {names}. "
                                "Mention this as a suggestion only if it fits naturally."
                            )
                except Exception as exc:
                    log.warning('catalog_retrieval_failed_in_single_pass', error=str(exc))

                reply_generation_section = f"""\
=========================================
REPLY GENERATION REQUESTED
=========================================
You MUST generate 3 suggested replies for {user_name} to send to {contact_name}.

{user_name}'s communication style:
{user_style}

About {contact_name} ({relationship_type}):
{contact_summary}

{memory_context}
{relationship_context}
{search_context}
{kb_context}
{facts_context}
{catalog_context}
"""

                response_tag_instruction = """Put 3 reply suggestions in `<response>`...`</response>` tags as a JSON object matching this schema:
{{
  "suggestions": [
    {{"text": "reply text here", "tone": "warm|casual|professional|playful|empathetic", "reasoning": "why this fits"}}
  ]
}}"""
            except Exception as exc:
                log.error('failed_to_gather_contexts_for_reply_generation', error=str(exc))
                generate_reply = False
                reply_generation_section = ""
                response_tag_instruction = "Do NOT output a `<response>` tag, since no reply generation was requested."

        prompt = UNIFIED_SINGLE_PASS_COGNITION.format(
            today=date.today().isoformat(),
            sender_type=sender_type,
            sender_name=contact_name if sender_type == 'contact' else user_name,
            relationship_type=relationship_type,
            recent_context=recent_ctx,
            body=body,
            reply_generation_section=reply_generation_section,
            response_tag_instruction=response_tag_instruction,
            user_name=user_name,
            contact_name=contact_name,
        )

        try:
            raw_response = await client.complete_text(
                [{'role': 'user', 'content': prompt}],
                service='intelligence', feature='single_pass_cognition', user_id=user_id,
            )
        except Exception as exc:
            log.warning('single_pass_cognition_failed_or_timed_out', message_id=message_id, user_id=user_id, error=str(exc))
            raw_response = '<intelligence>{"sentiment":"neutral","sentiment_score":0.5,"emotions":{"joy":0,"sadness":0,"anger":0,"fear":0,"surprise":0},"intent":{"category":"general","confidence":0.5},"topics":[],"entities":[],"importance_score":0.5,"requires_response":false,"response_urgency":"low","promises_detected":[],"events_detected":[],"summary":"Analysis timed out or failed"}</intelligence>'

        intelligence_json = self._parse_xml_tag(raw_response, 'intelligence')
        if not intelligence_json:
            intelligence_json = raw_response

        if "```json" in intelligence_json:
            intelligence_json = intelligence_json.split("```json")[1].split("```")[0].strip()
        elif "```" in intelligence_json:
            intelligence_json = intelligence_json.split("```")[1].split("```")[0].strip()

        try:
            analysis_dict = json.loads(intelligence_json)
        except Exception as exc:
            log.error('failed_to_parse_intelligence_json', error=str(exc), raw_intelligence=intelligence_json)
            if "```json" in raw_response:
                raw_json = raw_response.split("```json")[1].split("```")[0].strip()
            elif "```" in raw_response:
                raw_json = raw_response.split("```")[1].split("```")[0].strip()
            else:
                raw_json = raw_response.strip()
            analysis_dict = json.loads(raw_json)

        analysis = MessageAnalysis(**analysis_dict)

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

        # ── Auto-Quote Detection Engine ──────────────────────────────────────────
        body_lower = body.lower()
        if sender_type == 'contact' and any(kw in body_lower for kw in ['quote', 'quotation', 'pricing', 'how much', 'price', 'cost']):
            try:
                from .document_generator import assign_document_number, compute_totals
                async with pool.acquire() as conn:
                    cat_items = await conn.fetch(
                        "SELECT id, name, description, price, selling_price, currency FROM products WHERE user_id = $1 AND status != 'deleted' ORDER BY updated_at DESC LIMIT 5",
                        user_id,
                    )
                    if cat_items:
                        items = [{
                            'productId': str(item['id']),
                            'description': item['name'] + (f" — {item['description']}" if item['description'] else ''),
                            'quantity': 1,
                            'unitPriceCents': round(float(item['selling_price'] or item['price'] or 0) * 100),
                            'discountPct': 0,
                            'taxPct': 0,
                        } for item in cat_items[:3]]
                        
                        comp_items, subtotal_c, disc_c, tax_c, total_c = compute_totals(items)
                        doc_num = await assign_document_number(user_id, 'quotation')
                        doc_title = f"Quotation {doc_num}"
                        struct_data = {
                            'items': comp_items,
                            'sections': [],
                            'notes': 'Prepared automatically from your product catalog.',
                            'terms': 'Standard terms apply.',
                            'validUntil': None,
                            'dueDate': None,
                        }
                        
                        doc_row = await conn.fetchrow(
                            """INSERT INTO documents
                                 (user_id, contact_id, document_type, document_category, document_number, title,
                                  status, structured_data, subtotal_cents, discount_cents, tax_cents, total_cents,
                                  requested_by, ai_generated, ai_reasoning)
                               VALUES ($1,$2,'quotation','sales',$3,$4,'draft',$5,$6,$7,$8,$9,'ai',true,'Auto-detected quotation request in WhatsApp message')
                               RETURNING id""",
                            user_id, contact_id, doc_num, doc_title, json.dumps(struct_data),
                            subtotal_c, disc_c, tax_c, total_c,
                        )
                        
                        await conn.execute(
                            """INSERT INTO proactive_queue
                                 (user_id, contact_id, suggestion_type, priority, suggested_action, rationale, status, metadata)
                               VALUES ($1, $2, 'quote_draft_ready', 1, $3, $4, 'pending', $5::jsonb)""",
                            user_id, contact_id,
                            f"Approve & Send Quotation {doc_num}",
                            f"Contact requested pricing. Auto-prepared quote from catalog.",
                            json.dumps({'documentId': str(doc_row['id']), 'documentNumber': doc_num, 'totalCents': total_c}),
                        )
            except Exception as exc:
                log.warning('auto_quote_generation_failed', error=str(exc))

        suggestions_dict = None
        if generate_reply:
            response_json = self._parse_xml_tag(raw_response, 'response')
            if response_json:
                if "```json" in response_json:
                    response_json = response_json.split("```json")[1].split("```")[0].strip()
                elif "```" in response_json:
                    response_json = response_json.split("```")[1].split("```")[0].strip()
                try:
                    suggestions_dict = json.loads(response_json)
                except Exception as exc:
                    log.warning('failed_to_parse_response_suggestions_json', error=str(exc), raw_response_tag=response_json)

        return analysis, suggestions_dict
