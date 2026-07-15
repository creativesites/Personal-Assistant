"""Plain-English auto-reply exclusion parsing (docs/AUTO_REPLY_AGENTS_PLAN.md
§4). Resolves an instruction ("exclude my relatives", "leave out my wife")
into either a rule (matched against relationship_type/tag/customer_status)
or a specific contact — never invents a contact, same discipline as
Business Workspace document generation's contact resolution. The caller
shows the parsed result back to the user for confirmation before saving
anything (routes/settings.ts's POST exclusion endpoints are the save step;
this only previews)."""
import structlog

from ..ai.client import get_ai_client
from ..ai.prompts import PARSE_EXCLUSION_INSTRUCTION
from ..database import get_pool

log = structlog.get_logger()

_VALID_RULE_TYPES = ('relationship_type', 'tag', 'customer_status')


async def parse_exclusion_instruction(user_id: str, instruction: str) -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        contacts = await conn.fetch(
            """SELECT id, COALESCE(custom_name, display_name, phone_number) AS name
               FROM contacts WHERE user_id = $1 AND is_group = false
               ORDER BY last_message_at DESC NULLS LAST LIMIT 200""",
            user_id,
        )

    contact_list = '\n'.join(f"{c['id']}: {c['name']}" for c in contacts) or 'No contacts found.'

    prompt = PARSE_EXCLUSION_INSTRUCTION.format(instruction=instruction, contact_list=contact_list)
    ai = get_ai_client()
    try:
        raw = await ai.complete_json(
            [{'role': 'user', 'content': prompt}],
            service='intelligence', feature='exclusion_parsing', user_id=user_id,
        )
    except Exception as exc:
        log.warning('exclusion_instruction_parse_failed', error=str(exc))
        return {'type': 'unknown'}

    kind = raw.get('type')

    if kind == 'contact':
        contact_id = raw.get('contactId')
        matched = next((c for c in contacts if str(c['id']) == str(contact_id)), None)
        if not matched:
            return {'type': 'unknown'}
        return {'type': 'contact', 'contactId': str(matched['id']), 'contactName': matched['name']}

    if kind == 'rule':
        rule_type = raw.get('ruleType')
        rule_value = str(raw.get('ruleValue') or '').strip().lower()
        if rule_type not in _VALID_RULE_TYPES or not rule_value:
            return {'type': 'unknown'}

        pool = await get_pool()
        async with pool.acquire() as conn:
            if rule_type == 'relationship_type':
                count = await conn.fetchval(
                    "SELECT COUNT(*) FROM relationships WHERE user_id = $1 AND relationship_type ILIKE $2",
                    user_id, rule_value,
                )
            elif rule_type == 'tag':
                count = await conn.fetchval(
                    "SELECT COUNT(DISTINCT contact_id) FROM contact_tags WHERE user_id = $1 AND tag ILIKE $2",
                    user_id, rule_value,
                )
            else:
                count = await conn.fetchval(
                    "SELECT COUNT(*) FROM contacts WHERE user_id = $1 AND customer_status = $2",
                    user_id, rule_value,
                )
        return {'type': 'rule', 'ruleType': rule_type, 'ruleValue': rule_value, 'matchCount': int(count or 0)}

    return {'type': 'unknown'}
