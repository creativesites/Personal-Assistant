"""BusinessContextService (Platform Polish Phase 4, docs/PLATFORM_POLISH_PLAN.md
§6) — the "one intelligence, many surfaces" foundation: a single place that
assembles "what does Zuri already know about this business" from the
business-entity fetchers in memory/retrieval_service.py, so a new surface
asking a business question doesn't re-derive its own opportunities/
projects/invoices/deals query from scratch.

`answer()` is the full one-call entrypoint (context assembly + one LLM
call) for surfaces that just want a plain-text answer — Studio's advisor
chat (`studio_ask`) is the first, and so far only, caller of this path.
`get_context_block()` is exposed separately for surfaces whose call shape
doesn't fit a single generic completion (Advisor's `handle_conversation_turn`
already builds a structured, multi-signal prompt of its own — see
docs/PLATFORM_POLISH_PLAN.md §6.3) but that still want the same
centrally-assembled business-entity text folded into their own prompt
rather than duplicating the retrieval logic.

`surface` changes only which policy fragments/base instructions get
folded in — the context-assembly step underneath never changes shape.
"""
import structlog

from ..ai.client import get_ai_client
from ..memory import retrieval_service as memory

log = structlog.get_logger()

_STUDIO_BASE_INSTRUCTIONS = (
    'You are the Zuri AI Business Advisor, a specialist in helping small business owners '
    'manage their operations efficiently. Answer questions concisely. Give actionable, specific advice. '
    'When asked about stock, pricing, or availability — use the exact numbers from the catalog. '
    'When citing a price or stock level, be precise. '
    'Format responses with clear headings and bullet points when helpful.'
)

_SURFACE_BASE_INSTRUCTIONS = {
    'studio': _STUDIO_BASE_INSTRUCTIONS,
}


class BusinessContextService:
    async def get_context_block(self, user_id: str, contact_id: str | None = None) -> str:
        """Assembles the shared business-entity text block — open
        opportunities, active project status, outstanding invoice aging,
        and (when not scoped to one contact) the deal pipeline summary.
        Returns '' when there's nothing to show, so callers can fold this
        in unconditionally without an empty-section check of their own."""
        opportunities = await memory.get_open_opportunities(user_id, contact_id=contact_id, limit=10)
        projects = await memory.get_project_status(user_id, contact_id=contact_id)
        invoices = await memory.get_invoice_aging(user_id, contact_id=contact_id)

        parts = []
        if opportunities:
            lines = [f"- {o['title']} ({o['opportunity_type']}, {o['contact_name']})" for o in opportunities]
            parts.append('Open opportunities:\n' + '\n'.join(lines))
        if projects:
            lines = [
                f"- {p['title']} ({p['contact_name']}): {p['done_task_count']}/{p['task_count']} tasks done"
                for p in projects
            ]
            parts.append('Active projects:\n' + '\n'.join(lines))
        if invoices:
            lines = [
                f"- {i['document_number']} ({i['contact_name']}): {i['total_cents'] / 100:.2f} {i['currency']}, "
                f"outstanding {i['days_outstanding'] if i['days_outstanding'] is not None else '?'} day(s)"
                for i in invoices
            ]
            parts.append('Outstanding invoices:\n' + '\n'.join(lines))

        if contact_id is None:
            pipeline = await memory.get_deal_pipeline_summary(user_id)
            if pipeline:
                lines = [f"- {p['stage']}: {p['deal_count']} deal(s), {p['total_value_cents'] / 100:.2f}" for p in pipeline]
                parts.append('Deal pipeline:\n' + '\n'.join(lines))

        return '\n\n'.join(parts)

    async def answer(
        self, surface: str, user_id: str, question: str,
        scope: dict | None = None, chat_history: list[dict] | None = None,
        extra_context_blocks: list[tuple[str, str]] | None = None, system_suffix: str = '',
    ) -> str:
        """extra_context_blocks/system_suffix let a surface fold in its own
        additional context (e.g. Studio's supplier list, recent-contacts
        block, and its `[ACTION: ...]` tag instructions) without those
        surface-specific pieces leaking into the shared context-assembly
        logic every other caller of this method also goes through."""
        scope = scope or {}
        contact_id = scope.get('contact_id')

        catalog_items = await memory.get_relevant_catalog(user_id, limit=50)
        business_facts = await memory.get_business_facts(user_id, limit=30)
        catalog_text = memory.format_catalog_items(catalog_items)
        facts_text = memory.format_business_facts(business_facts)
        context_block = await self.get_context_block(user_id, contact_id=contact_id)

        base_instructions = _SURFACE_BASE_INSTRUCTIONS.get(surface, _STUDIO_BASE_INSTRUCTIONS)
        system_prompt = (
            base_instructions
            + f'\n\nCATALOG (Products & Services):\n{catalog_text or "No catalog items found."}\n\n'
            + f'BUSINESS RULES & FACTS:\n{facts_text or "No business facts configured."}\n\n'
            + (f'{context_block}\n\n' if context_block else '')
        )
        for label, text in (extra_context_blocks or []):
            system_prompt += f'{label}:\n{text}\n\n'
        system_prompt += system_suffix

        prompt_messages = [{'role': 'system', 'content': system_prompt}]
        prompt_messages.extend(chat_history or [])
        prompt_messages.append({'role': 'user', 'content': question})

        ai = get_ai_client()
        return await ai.complete_text(
            prompt_messages, service='intelligence', feature=f'business_context_{surface}', user_id=user_id,
        )


_business_context_service = BusinessContextService()


def get_business_context_service() -> BusinessContextService:
    return _business_context_service
