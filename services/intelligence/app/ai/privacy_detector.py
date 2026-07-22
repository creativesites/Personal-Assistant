import structlog
import json
from ..database import get_pool
from .client import get_ai_client

log = structlog.get_logger()

class PrivacyDetector:
    def __init__(self) -> None:
        self.ai_client = get_ai_client()

    async def detect_likely_personal_contacts(self, user_id: str) -> list[dict]:
        """
        Detect contacts that are likely family or personal relationships based on:
        1. Conversation messages (keywords, timings, outside business hours)
        2. Relationship characteristics (lack of deals, lack of invoice gaps, emotional keywords)
        
        Returns a list of proposed exclusions with confidence and explanation.
        """
        pool = await get_pool()
        proposed = []
        
        async with pool.acquire() as conn:
            # Query contacts of this user along with basic message and relationship stats
            contacts = await conn.fetch(
                """SELECT c.id, COALESCE(c.custom_name, c.display_name, c.phone_number) AS name,
                          c.phone_number,
                          r.relationship_category, r.relationship_type,
                          (SELECT COUNT(*) FROM messages m
                           JOIN conversations conv ON conv.id = m.conversation_id
                           WHERE conv.contact_id = c.id AND conv.user_id = $1) AS msg_count,
                          (SELECT COUNT(*) FROM deals d WHERE d.contact_id = c.id AND d.user_id = $1) AS deal_count,
                          (SELECT COUNT(*) FROM documents d WHERE d.contact_id = c.id AND d.user_id = $1) AS doc_count
                   FROM contacts c
                   LEFT JOIN relationships r ON r.contact_id = c.id AND r.user_id = $1
                   WHERE c.user_id = $1""",
                user_id
            )
            
            for contact in contacts:
                contact_id = contact['id']
                # Skip if already excluded in privacy_exclusions table
                already_excluded = await conn.fetchval(
                    "SELECT EXISTS(SELECT 1 FROM privacy_exclusions WHERE contact_id = $1 AND user_id = $2)",
                    contact_id, user_id
                )
                if already_excluded:
                    continue
                
                # Fetch recent messages (up to 20) for analysis
                messages = await conn.fetch(
                    """SELECT m.body, m.sender_type, m.whatsapp_timestamp
                       FROM messages m
                       JOIN conversations conv ON conv.id = m.conversation_id
                       WHERE conv.contact_id = $1 AND conv.user_id = $2
                       ORDER BY m.whatsapp_timestamp DESC
                       LIMIT 20""",
                    contact_id, user_id
                )
                
                if not messages:
                    continue
                
                # Heuristic signals
                msg_bodies = [m['body'] for m in messages if m['body']]
                full_text = " ".join(msg_bodies).lower()
                
                personal_keywords = ["mom", "dad", "babe", "love", "dinner", "baby", "darling", "honey", "sweetheart", "husband", "wife", "sister", "brother", "son", "daughter", "school", "home", "grocery", "groceries", "weekend", "kiss", "kisses", "hug", "hugs", "tomorrow"]
                keyword_hits = [k for k in personal_keywords if k in full_text]
                
                # Timing analysis: messages outside business hours (before 8 AM, after 6 PM)
                late_night_count = 0
                for m in messages:
                    ts = m['whatsapp_timestamp']
                    if ts:
                        hour = ts.hour
                        if hour < 8 or hour > 18:
                            late_night_count += 1
                
                score = 0.0
                reasons = []
                
                # Base criteria: no business activity
                if contact['deal_count'] == 0 and contact['doc_count'] == 0:
                    score += 0.30
                    reasons.append("No active deals or document-related activity")
                
                # Keyword triggers
                if len(keyword_hits) >= 3:
                    score += 0.40
                    reasons.append(f"Frequent personal keywords detected: {', '.join(keyword_hits[:4])}")
                elif len(keyword_hits) >= 1:
                    score += 0.20
                    reasons.append(f"Personal terminology detected: {', '.join(keyword_hits[:2])}")
                
                # Timing trigger
                if len(messages) > 5 and (late_night_count / len(messages)) > 0.6:
                    score += 0.20
                    reasons.append("Majority of communication occurs outside standard business hours")
                
                # Category checks
                if contact['relationship_category'] in ('family', 'personal'):
                    score += 0.30
                    reasons.append(f"Categorized as '{contact['relationship_category']}' in CRM")
                
                score = min(0.99, score)
                
                if score >= 0.5:
                    proposed.append({
                        "contact_id": str(contact_id),
                        "name": contact['name'],
                        "phone_number": contact['phone_number'],
                        "confidence": round(score, 2),
                        "reasons": reasons,
                    })
                    
        return proposed
