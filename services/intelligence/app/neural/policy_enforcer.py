"""Policy Enforcer — Evaluates proposed AI communications against active business rules.
Part of Neural Layer Phase 2.
"""
from typing import List, Dict, Any, Optional
import structlog
from ..database import get_pool
from ..ai.client import get_ai_client

log = structlog.get_logger()


class PolicyEnforcer:
    async def evaluate_reply(
        self, user_id: str, proposed_reply: str, contact_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Evaluates a draft reply against active business rules in business_facts.
        Returns {'is_compliant': bool, 'violations': [str]}
        """
        pool = await get_pool()
        async with pool.acquire() as conn:
            rules = await conn.fetch(
                """SELECT fact FROM business_facts
                   WHERE user_id = $1 AND category = 'business_rule' AND is_active = true
                   ORDER BY created_at DESC LIMIT 20""",
                user_id,
            )

        if not rules:
            return {'is_compliant': True, 'violations': []}

        rule_texts = [r['fact'] for r in rules]
        rules_block = '\n'.join([f"- {r}" for r in rule_texts])

        ai = get_ai_client()
        prompt = (
            f"You are a strict business policy compliance checker.\n"
            f"Active Business Rules:\n{rules_block}\n\n"
            f"Proposed WhatsApp Reply Draft:\n\"{proposed_reply}\"\n\n"
            f"Does the proposed reply violate any of the business rules above? "
            f"Respond in JSON format ONLY: {{\"is_compliant\": true/false, \"violations\": [\"reason 1\"]}}"
        )

        try:
            import json
            res = await ai.complete_text(
                [{'role': 'system', 'content': 'Evaluate policy compliance as JSON.'}, {'role': 'user', 'content': prompt}],
                service='intelligence',
                feature='policy_enforcement',
                user_id=user_id,
            )
            clean = res.strip().strip('`').replace('json\n', '')
            data = json.loads(clean)
            return {
                'is_compliant': data.get('is_compliant', True),
                'violations': data.get('violations', []),
            }
        except Exception as e:
            log.warn('policy_enforcement_evaluation_failed', error=str(e))
            return {'is_compliant': True, 'violations': []}
