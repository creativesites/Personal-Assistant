import json
import structlog
from ..ai.client import get_ai_client
from ..ai.prompts import GENERATE_REPLIES, LIVE_SEARCH_CONTEXT
from ..config import settings
from ..database import get_pool
from ..models import MessageAnalysis, ReplySuggestions
from ..queue import publish_event
from ..memory.conversation_memory import get_conversation_memory
from .web_search import get_web_search
from .knowledge_retriever import retrieve_relevant_chunks

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

        client = get_ai_client()

        # Conversation memory — rolling short-term state (topic, open questions,
        # pending promises, recent decisions), cheaper and more current than
        # re-deriving all of this from raw messages on every call.
        memory_context = ''
        convo_memory = await get_conversation_memory(conversation_id)
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
                    }])
                    if summary:
                        search_context = f'\n\nLive search answer for contact\'s question:\n{summary}'
                except Exception as exc:
                    log.warning('live_search_context_failed', error=str(exc))

        # Knowledge base retrieval — inject business-specific knowledge
        kb_context = ''
        try:
            kb_chunks = await retrieve_relevant_chunks(
                user_id=user_id,
                agent_id=None,
                query=body[:500],
                limit=3,
            )
            if kb_chunks:
                kb_text = '\n'.join(f"- {c['content'][:400]}" for c in kb_chunks)
                kb_context = f'\n\nRelevant knowledge base context:\n{kb_text}'
        except Exception as exc:
            log.warning('kb_retrieval_failed_in_reply_gen', error=str(exc))

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
        ) + memory_context + search_context + kb_context

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
