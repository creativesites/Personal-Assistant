import structlog
from bullmq import Worker, Queue
from ..database import get_pool
from ..queue import redis_conn_opts
from ..services.analyser import MessageAnalyser
from ..services.reply_gen import ReplyGenerator
from ..services.event_extractor import EventExtractor
from ..services.health import RelationshipHealthService
from ..services.orchestrator import route_message
from ..services.business_facts import BusinessFactService
from ..services.opportunities import OpportunityService
from ..services.connections import ConnectionService
from ..services.contact_products import ContactProductService
from ..services.action_bundles import ActionBundleService
from ..services.life_events import LifeEventService
from ..services.network_value import NetworkValueService
from ..services.lead_score import LeadScoreService
from ..memory.conversation_memory import update_conversation_memory
from ..neural.emotion import get_emotion_engine

log = structlog.get_logger()

_analyser = MessageAnalyser()
_emotion_engine = get_emotion_engine()
_reply_gen = ReplyGenerator()
_extractor = EventExtractor()
_health_svc = RelationshipHealthService()
_business_facts = BusinessFactService()
_opportunities = OpportunityService()
_connections = ConnectionService()
_contact_products = ContactProductService()
_action_bundles = ActionBundleService()
_life_events = LifeEventService()
_network_value = NetworkValueService()
_lead_score = LeadScoreService()
_msg_counter: dict[str, int] = {}

_profile_queue  = Queue('analysis.contact_profile', {'connection': redis_conn_opts()})
_voice_queue    = Queue('analysis.user_profile',    {'connection': redis_conn_opts()})
_agent_queue    = Queue('agent.handle_message',     {'connection': redis_conn_opts()})
_temporal_queue = Queue('temporal.clock_check',     {'connection': redis_conn_opts()})

_user_msg_counter: dict[str, int] = {}


async def _process(job, token: str):
    data = job.data
    message_id    = data.get('messageId')
    user_id       = data.get('userId')
    conversation_id = data.get('conversationId')
    contact_id    = data.get('contactId')
    sender_type   = data.get('senderType', 'contact')
    is_historical = data.get('isHistorical', False)

    log.info('processing_message', message_id=message_id, is_historical=is_historical)

    # Group chats are displayed but never analysed — no sentiment/embeddings,
    # no profile rebuilds, no auto-response, no token spend. See CLAUDE.md
    # "Groups". Messages are already persisted by the WhatsApp service
    # regardless of this check, so skipping here only affects AI processing.
    pool = await get_pool()
    async with pool.acquire() as conn:
        contact_row = await conn.fetchrow('SELECT is_group FROM contacts WHERE id = $1', contact_id)
    if contact_row and contact_row['is_group']:
        log.info('group_message_skipped', message_id=message_id, contact_id=contact_id)
        return {'ok': True, 'skipped': 'group_chat'}

    analysis = await _analyser.analyse(
        message_id=message_id,
        user_id=user_id,
        conversation_id=conversation_id,
        contact_id=contact_id,
    )

    await _extractor.extract_from_analysis(message_id, contact_id, user_id, analysis)

    # Business facts are mined from history too — unlike conversation memory,
    # this is durable knowledge, and a business's chat history is exactly
    # where its prices/policies were originally stated.
    if analysis.business_facts_mentioned:
        await _business_facts.record_candidates(
            user_id, message_id, analysis.business_facts_mentioned,
        )

    # Opportunities and Business Graph connections — same "one more
    # structured field on the existing per-message pass" pattern as
    # business_facts_mentioned above (see docs/RELATIONSHIP_OS_PLAN.md §5.7/§5.8).
    if analysis.opportunities_mentioned:
        await _opportunities.record_candidates(
            user_id, contact_id, message_id, analysis.opportunities_mentioned,
        )
    if analysis.connections_mentioned:
        await _connections.record_candidates(
            user_id, contact_id, message_id, analysis.connections_mentioned,
        )

    # Products purchased/interested/quoted, and major personal life events —
    # same one-more-structured-field pattern (see docs/RELATIONSHIP_OS_PLAN.md §5.6/§6.6).
    if analysis.products_mentioned:
        await _contact_products.record_mentions(
            user_id, contact_id, message_id, analysis.products_mentioned,
        )
    if analysis.life_events_mentioned:
        await _life_events.record_mentions(
            user_id, contact_id, message_id, analysis.life_events_mentioned,
        )

    # Zuri Neural Layer Phase 1 (docs/NEURAL_LAYER_PLAN.md §4.2) — platform-wide
    # emotional signal, reusing this same analysis's already-computed
    # emotions/sentiment. No new LLM call. Historical messages get this too —
    # emotional history matters for state-dependent retrieval regardless of
    # when the message was first sent.
    await _emotion_engine.record_from_message_analysis(user_id, contact_id, message_id, analysis)

    # Historical messages: skip reply generation, agent routing, and conversation
    # memory entirely — that memory represents "current" state, not backfill.
    if not is_historical:
        pool = await get_pool()
        async with pool.acquire() as conn:
            msg = await conn.fetchrow('SELECT body FROM messages WHERE id = $1', message_id)
        body = msg['body'] if msg else ''

        if body:
            await update_conversation_memory(
                conversation_id, sender_type=sender_type, body=body, analysis=analysis,
            )

        if sender_type == 'contact' and body:
            # Business OS Phase E (docs/BUSINESS_OS_PLAN.md §15) — a live
            # order request proposes a multi-action bundle for the Inbox,
            # independent of the reply-routing decision below. Skipped for
            # historical/backfill messages (the `not is_historical` guard
            # above) so an initial sync doesn't flood the user with stale
            # "detected an order" cards from old conversations.
            if analysis.order_intent_mentioned:
                await _action_bundles.detect_and_create(
                    user_id, contact_id, conversation_id, message_id, analysis.order_intent_mentioned,
                )

            # Orchestrator decides: route to an agent OR generate a suggestion for the user
            decision, agent_id = await route_message(
                message_id=message_id,
                conversation_id=conversation_id,
                contact_id=contact_id,
                user_id=user_id,
                requires_response=analysis.requires_response,
            )

            if decision == 'route_to_agent' and agent_id:
                await _agent_queue.add(
                    'agent.handle_message',
                    {
                        'conversationId': conversation_id,
                        'messageId': message_id,
                        'agentId': agent_id,
                        'userId': user_id,
                    },
                )
                log.info('message_routed_to_agent', agent_id=agent_id, message_id=message_id)

            elif decision == 'generate_suggestion':
                await _reply_gen.generate(
                    message_id=message_id,
                    user_id=user_id,
                    contact_id=contact_id,
                    conversation_id=conversation_id,
                    body=body,
                    analysis=analysis,
                )

    # ── Relationship maintenance (batched for historical) ───────────────────

    key = f'{user_id}:{contact_id}'
    count = _msg_counter.get(key, 0) + 1
    _msg_counter[key] = count

    # Recalculate health — for historical, run every 20 messages to avoid overload
    health_interval = 20 if is_historical else 5
    if count % health_interval == 0:
        await _health_svc.recalculate(contact_id, user_id)
        # Network/Connection Value (§5.1/§6.4) recomputed alongside health —
        # it draws on the same relationship-level signals (deals, revenue,
        # connections, message direction/sentiment), so there's no reason
        # for it to run on a different cadence.
        await _network_value.recompute(contact_id, user_id)
        # Lead score also gets a periodic refresh here (in addition to the
        # immediate recompute in opportunities.py) so it decays back down
        # once a buying-signal opportunity expires, not just when a new one appears.
        await _lead_score.recompute(contact_id, user_id)

    # Update cadence model — offloaded to the temporal worker instead of running
    # inline, so a burst of messages doesn't serialize behind extra DB round-trips.
    cadence_interval = 20 if is_historical else 5
    if count % cadence_interval == 0 or count == 1:
        await _temporal_queue.add('cadence', {'contactId': contact_id, 'userId': user_id})

    # Trigger contact profile rebuild — more aggressive for historical to populate product fast
    profile_interval = 25 if is_historical else 10
    if count == 1 or count % profile_interval == 0:
        await _profile_queue.add('profile', {'contactId': contact_id, 'userId': user_id})

    # Trigger user voice profile rebuild on outbound messages
    if sender_type == 'user':
        ucount = _user_msg_counter.get(user_id, 0) + 1
        _user_msg_counter[user_id] = ucount
        voice_interval = 50 if is_historical else 20
        if ucount == 1 or ucount % voice_interval == 0:
            await _voice_queue.add('voice', {'userId': user_id})

    log.info(
        'message_processed',
        message_id=message_id,
        requires_response=analysis.requires_response,
        is_historical=is_historical,
    )
    return {'ok': True}


def create_message_worker() -> Worker:
    return Worker('messages.incoming', _process, {'connection': redis_conn_opts()})
