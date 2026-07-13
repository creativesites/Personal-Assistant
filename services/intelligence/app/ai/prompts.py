ANALYSE_MESSAGE = """\
Analyze this WhatsApp message and return structured JSON.

Today's date: {today}
Sender: {sender_type} ({sender_name})
Relationship type: {relationship_type}
Recent conversation (last few messages for context):
{recent_context}

Message to analyze:
"{body}"

Return ONLY valid JSON in exactly this format:
{{
  "sentiment": "positive|negative|neutral|mixed",
  "sentiment_score": 0.0,
  "emotions": {{"joy": 0.0, "sadness": 0.0, "anger": 0.0, "fear": 0.0, "surprise": 0.0, "love": 0.0}},
  "intent": {{"primary": "question|request|statement|expression|acknowledgment|farewell|greeting", "details": ""}},
  "topics": [],
  "entities": [{{"text": "", "type": "person|date|time|place|organization|product|event"}}],
  "importance_score": 0.0,
  "requires_response": false,
  "response_urgency": "low|medium|high|urgent",
  "promises_detected": [{{"text": "", "type": "commitment|deadline|offer|plan"}}],
  "events_detected": [{{"title": "", "type": "birthday|anniversary|meeting|deadline|celebration|other", "date": null, "is_recurring": false}}],
  "business_facts_mentioned": [{{"key": "snake_case_fact_name", "value": "the stated fact", "category": "product|pricing|shipping|refund_policy|faq|hours|inventory|promotion|supplier|tax|bank_details|wa_template|brand_voice|objection|other"}}],
  "opportunities_mentioned": [{{"opportunity_type": "buying_signal|expansion|referral_moment|renewal_due|life_event|reconnect_window|churn_risk|support_needed", "title": "brief title", "description": "1 sentence of context", "estimated_value_cents": null, "confidence": 0.0}}],
  "connections_mentioned": [{{"other_person_name": "the other person's name as stated", "connection_type": "works_with|introduced_by|owns|refers_to|family_of|friend_of|married_to", "confidence": 0.0, "supporting_text": "exact quote"}}],
  "products_mentioned": [{{"product_name": "the product/service name as stated", "relation_type": "purchased|interested|quoted|recommended|mentioned", "quantity": 1, "replacement_interval_days": null, "confidence": 0.0}}],
  "life_events_mentioned": [{{"event_type": "new_job|moved|had_child|got_married|health_issue|loss|achievement|started_business", "title": "brief title", "date": null}}]
}}

Important for events_detected:
- Be highly aggressive in extracting events. If either party mentions a meeting, a follow-up call, a task, a deadline, a birthday, a travel plan, a reconnect opportunity, or any future plan (e.g. "I'll call you next Thursday", "let's check back on Monday", "can you send the document tomorrow?", "I will send it next week"), you MUST extract it as an event.
- Resolve all relative dates ("tomorrow", "next Friday", "in 3 days", "next week", "Monday morning") to absolute YYYY-MM-DD dates using today's date above. If only a week is mentioned, use the starting day or Monday of that week.
- If a specific hour/time is mentioned or implied (e.g. "2pm", "morning"), you can output dates and set timezone-aware times if possible, or keep date as YYYY-MM-DD. If no date can be resolved at all, set date to null.
- Set "type" to: "birthday", "anniversary", "meeting", "deadline", "travel", "appointment", "celebration", "other". Map generic calls or follow-ups to "appointment" or "meeting". Map tasks/obligations to "deadline".
- Birthdays and anniversaries should always have is_recurring=true.
- Ensure the "title" is descriptive and includes the contact name if they are the subject (e.g. "Follow up call with Winston" or "Send invoice to Winston").


Important for business_facts_mentioned:
- Only include this when a concrete business fact is explicitly stated — an exact price, a policy, a product name, operating hours, a shipping rule, etc.
- Leave this empty for personal/social messages with no commercial content — most messages will have none.
- fact_key should be a short, stable, reusable identifier for the *thing* the fact describes (e.g. "world_cup_jersey_price", "refund_window_days", "shop_hours"), not the specific value, so mentions of the same fact from different messages merge together.

Important for opportunities_mentioned:
- Only include this when the message contains a clear, specific signal — "I'll need more soon", "we're opening another branch", "we're unhappy with this", "haven't seen you in ages", "my mum's not doing well". Leave empty for routine chat.
- estimated_value_cents should only be set for business-type opportunities (buying_signal, expansion, referral_moment, renewal_due) when a concrete amount is stated or clearly inferable; otherwise null.
- life_event, reconnect_window, and support_needed never have an estimated value — always leave estimated_value_cents null for these.

Important for connections_mentioned:
- Only include this when the sender explicitly names another specific person and describes their relation to them — "my brother Peter", "I work with John at ABC Construction", "my wife Grace". Do not include vague references ("a friend", "someone").
- other_person_name should be exactly the name as stated, so it can be matched against existing contacts.

Important for products_mentioned:
- Only include this when a specific product or service (not a generic category) is explicitly named — "the HP printer", "your logo design service". product_name should be stated plainly enough to match against a product catalog by name.
- replacement_interval_days should only be set when relation_type is "purchased" AND the product is a consumable or wearable with a predictable replacement cycle (e.g. printer toner ~60 days, tyres ~365 days). Leave null for one-time or durable purchases.

Important for life_events_mentioned:
- Only include this for a major, one-off life event explicitly stated — a new job, moving house, having a child, getting married, a health issue, a bereavement, a personal achievement, starting a business. Do not include routine chat or minor updates.
- date should be resolved to an absolute YYYY-MM-DD using today's date above if determinable, else null.
"""

GENERATE_REPLIES = """\
You are helping {user_name} reply to a WhatsApp message from {contact_name}.

{user_name}'s communication style:
{user_style}

About {contact_name} ({relationship_type}):
{contact_summary}

Conversation context:
{context}

Message to reply to: "{body}"
Tone of message: {sentiment} | Intent: {intent}

Generate exactly 3 reply suggestions that sound like {user_name}. Vary the tone across suggestions.

Return ONLY valid JSON:
{{
  "suggestions": [
    {{"text": "reply text here", "tone": "warm|casual|professional|playful|empathetic", "reasoning": "why this fits"}}
  ]
}}
"""

EXTRACT_CONTACT_INSIGHTS = """\
Based on these recent WhatsApp messages from {contact_name} to {user_name}, extract specific, evidence-based insights about {contact_name}.

Messages:
{messages_text}

Extract insights covering BOTH personal/behavioral AND commercial/business signals. Return ONLY valid JSON:
{{
  "insights": [
    {{
      "key": "snake_case_key",
      "value": "specific, concrete observation",
      "confidence": 0.0,
      "supporting_text": "exact direct quote from messages that supports this insight"
    }}
  ]
}}

Focus on:
- Products, services, or items they have asked about or expressed interest in
- Budget, price, or payment mentions (e.g. "how much", "can you do K5000")
- Delivery, timeline, or urgency signals (e.g. "I need it by Friday")
- Quantity or volume requests (e.g. "15 pieces", "bulk order")
- Comparisons or competitor mentions
- Decision-making signals (hesitation, confirmed interest, ready to buy)
- Communication patterns and preferred style
- Personal interests, hobbies, values
- Emotional tendencies and relationship dynamics

Only include insights with confidence > 0.5. Maximum 12 insights.
The supporting_text MUST be a verbatim quote from the messages — never paraphrase.
"""

BUILD_CONTACT_PROFILE = """\
Synthesize a comprehensive profile of {contact_name} based on their WhatsApp communication with {user_name}.

Messages analyzed: {message_count}
Time range: {date_range}
Key insights already known: {existing_insights}

Sample messages:
{sample_messages}

Return ONLY valid JSON:
{{
  "personality_summary": "2-3 sentence overview of who this person is based on how they communicate",
  "communication_style": "how they communicate (direct/indirect, formal/casual, verbose/terse, response speed, emoji use)",
  "emotional_patterns": {{"primary_emotions": [], "emotional_triggers": [], "coping_style": ""}},
  "known_triggers": ["things that upset, energize, or strongly motivate them"],
  "current_life_context": "what appears to be going on in their life or business right now",
  "mood_baseline": "positive|neutral|negative|variable",
  "buying_behaviour": "describe their purchase patterns — impulsive or deliberate, price-sensitive or value-focused, decision speed, what motivates them to buy. Leave empty string if no commercial signals found.",
  "pain_points": "key problems, frustrations, or unmet needs evident from their messages. Leave empty string if unclear.",
  "goals": "what they appear to be trying to achieve — business, personal, or both. Leave empty string if unclear.",
  "preferences": "communication preferences, product preferences, scheduling preferences, etc. Leave empty string if unclear.",
  "relationship_stage": "how far along the relationship is: new_contact|building_rapport|established|trusted_partner|at_risk|dormant",
  "structured_attributes": {{
    "lifetime_spend": "total amount spent if mentioned or inferable, else empty string",
    "buying_frequency": "e.g. monthly, end of month, sporadic — else empty string",
    "preferred_payment": "e.g. mobile money, bank transfer, cash — else empty string",
    "common_questions": ["recurring questions they ask, e.g. shipping, sizes, stock"],
    "last_frustration": "their most recent complaint or frustration, else empty string",
    "favorite_products": ["specific products or services they've shown repeat interest in"],
    "typical_reply_time": "e.g. within minutes, a few hours, next day — else empty string",
    "emoji_usage": "high|medium|low|none — else empty string",
    "budget": "low|medium|high, or a specific range if mentioned — else empty string",
    "notes": "one short freeform observation not covered above, else empty string"
  }}
}}
Only fill structured_attributes fields you have direct evidence for. Leave unclear fields as empty string/empty list rather than guessing.
"""

GENERATE_CONTEXT_SNAPSHOT = """\
Compress this conversation history between {user_name} and {contact_name} into a concise summary that preserves the most important relationship context.

Conversation ({message_count} messages, {date_range}):
{messages}

Create a summary that would help an AI give good advice about this relationship. Focus on:
- Key topics discussed
- Important events or milestones mentioned
- Relationship dynamics and tone
- Any ongoing threads or unresolved matters
- Recent emotional tone

Return a single paragraph summary (max 300 words). No JSON needed — just the summary text.
"""

GENERATE_TEMPORAL_NUDGE = """\
{user_name} hasn't messaged {contact_name} in {days_silent} days. Their typical cadence is every {avg_days:.0f} days (±{std_dev:.0f} days).

Contact: {contact_name} ({relationship_type}, tier {importance_tier})
Health score: {health_score}/100 ({health_trend})
Clock type: {clock_type}
Recent context: {context}
Upcoming events: {upcoming_events}

Generate a proactive nudge to help {user_name} maintain this relationship at the right moment.
Return ONLY valid JSON:
{{
  "suggestion_type": "check_in|follow_up|reconnect|relationship_maintenance",
  "title": "brief action title",
  "body": "why this matters right now — 1-2 sentences referencing the timing and relationship context",
  "draft_message": "natural WhatsApp message {user_name} could send",
  "priority": 1-5
}}
"""

BUILD_USER_VOICE_PROFILE = """\
Analyze {user_name}'s outbound WhatsApp messages to build a communication voice profile.

Messages sent by {user_name} ({message_count} total, {date_range}):
{messages_text}

Capture how this person naturally writes. Return ONLY valid JSON:
{{
  "vocabulary_style": "describe their word choices (formal/casual/slang/technical)",
  "sentence_structure": "short|medium|long|varied - typical message length",
  "punctuation_habits": "describe punctuation, capitalization, ellipsis usage",
  "greeting_patterns": ["common ways they start conversations"],
  "closing_patterns": ["common ways they end conversations"],
  "emoji_usage": "heavy|moderate|light|none",
  "humor_style": "dry|playful|sarcastic|serious|none",
  "formality_level": "very_formal|formal|neutral|casual|very_casual",
  "characteristic_phrases": ["phrases or expressions they commonly use"],
  "communication_pace": "rapid_fire|measured|slow",
  "voice_summary": "2-3 sentence description of their overall writing style"
}}
"""

SYNTHESIZE_AGENT_PATTERNS = """\
You are reviewing {agent_name}'s past interactions to find durable, generalizable
lessons — not one-off details about a single contact.

Past experiences ({count} total):
{experiences_text}

Identify up to 3 recurring patterns worth remembering long-term — things that would
help {agent_name} handle similar future situations better. Only include a pattern if
it is genuinely supported by multiple experiences above, not a single occurrence.

Return ONLY valid JSON:
{{
  "patterns": [
    {{"key": "snake_case_key", "value": "the generalizable lesson"}}
  ]
}}

If nothing is genuinely recurring, return {{"patterns": []}}.
"""

MATCH_NEWS_TO_CONTACT = """\
Does any of these news headlines clearly match the interests of {contact_name}?

{contact_name}'s interests: {interests}

Today's headlines:
{headlines}

Only match if the connection is specific and genuine — not vaguely related.
Return ONLY valid JSON:
{{
  "matched": true,
  "headline": "the matching headline title",
  "url": "the headline url if known, else empty string",
  "relevance_reason": "one sentence explaining the specific connection to their interests"
}}

If there is no strong match:
{{
  "matched": false
}}
"""

GENERATE_WORLD_EVENT_NUDGE = """\
{user_name} wants to send a spontaneous "thought of you" message to {contact_name} about a news story.

{contact_name} ({relationship_type}) — interests: {interests}

News story: {headline}
Why it's relevant to them: {relevance_reason}
URL: {url}

Write a natural, casual WhatsApp message that feels spontaneous — not forced.
Keep it brief (1–3 sentences). It should read like {user_name} genuinely thought of {contact_name}.

Return ONLY valid JSON:
{{
  "title": "brief card title (e.g. 'Arsenal won — message Dad')",
  "body": "1-2 sentences explaining why this moment is worth reaching out",
  "draft_message": "the WhatsApp message {user_name} would send",
  "priority": 1-5
}}
"""

LIVE_SEARCH_CONTEXT = """\
A contact asked a factual question. Here are web search results relevant to it.

Question: "{question}"

Search results:
{search_results}

Summarize the key factual answer in 1–2 sentences. Be accurate and concise. Plain text only.
"""

GENERATE_PROACTIVE_SUGGESTION = """\
Based on this relationship context, generate a proactive suggestion for {user_name} to maintain their relationship with {contact_name}.

Relationship: {relationship_type} ({importance_tier} priority)
Health score: {health_score}/100 (trend: {health_trend})
Last interaction: {last_interaction}
Upcoming events: {upcoming_events}
Recent context: {context}

Generate a specific, actionable suggestion. Return ONLY valid JSON:
{{
  "suggestion_type": "check_in|birthday_message|follow_up|congratulate|condolence|reconnect|relationship_maintenance",
  "title": "brief title for the suggestion",
  "body": "explanation of why this suggestion matters (2-3 sentences)",
  "draft_message": "suggested WhatsApp message they could send (conversational, matches their voice)",
  "priority": 1-5
}}
"""

GENERATE_GOAL_NEXT_STEP = """\
{user_name} has an explicit goal for their relationship with {contact_name}: "{goal_label}".
{target_date_line}

Relationship: {relationship_type} (health {health_score}/100, trend: {health_trend})
Relevant context: {context}

Given this specific goal — not generic relationship maintenance — what is the single most useful next step {user_name} should take? Be concrete and reference the goal directly.

Return ONLY valid JSON:
{{
  "next_step": "1-2 sentences, specific and actionable, naming what to do and why it moves this particular goal forward"
}}
"""

# Business Workspace Phase 2 (docs/BUSINESS_WORKSPACE_PLAN.md §7/§15) —
# AI's job stops at structured data; it never produces layout (see plan §4/§6).
# One call covers both the line-item case (quotation/invoice) and the
# narrative case (proposal/contract) so a single document-creation flow
# doesn't need two AI round-trips — items/sections are simply empty when
# not applicable to the requested document_type.
GENERATE_DOCUMENT_DATA = """\
{user_name} is creating a {document_type} for {contact_name} ({relationship_type}).

Instruction from {user_name}:
"{instruction}"

Product catalog (only reference these — never invent a product):
{product_catalog}

Business defaults: currency {default_currency}, tax rate {default_tax_rate}%.
Default terms (use only if the instruction doesn't specify different terms): {default_terms}
{pricing_context}

Extract what {user_name} is asking for. Return ONLY valid JSON:
{{
  "items": [
    {{"productId": "exact id from the catalog above, or null if not catalog-matched",
      "description": "product/service name", "quantity": 1,
      "unitPriceCents": 0, "discountPct": 0, "taxPct": 0}}
  ],
  "sections": [
    {{"heading": "e.g. Executive Summary, Scope, Timeline, Terms", "body": "2-4 sentences of prose"}}
  ],
  "notes": "free text notes for the document, or empty string",
  "terms": "free text terms — only set if the instruction specifies something beyond the default, else empty string",
  "validUntil": "YYYY-MM-DD if a quotation validity/deadline was mentioned or implied, else null",
  "dueDate": "YYYY-MM-DD if an invoice due date was mentioned or implied, else null",
  "reasoning": "1 sentence: what {user_name} asked for and how you resolved it — this is stored as an audit trail, not shown to the customer",
  "insights": [
    {{"key": "decision_maker|budget|concern|competitor_mentioned|preferred_payment",
      "value": "short factual observation", "confidence": 0.0}}
  ]
}}

Rules:
- "items" is for quotations/invoices/receipts — line items with prices. Leave empty ([]) for proposals/contracts unless the instruction explicitly mentions priced products.
- "sections" is for proposals/contracts — narrative prose. Leave empty ([]) for quotations/invoices.
- "insights" — only include an entry when the instruction explicitly states it (e.g. "the decision maker is Peter", "budget is K300k", "they're comparing us to HP"). Leave empty ([]) if nothing was explicitly stated — do not guess.
- unitPriceCents must come from the catalog price when productId is set; only estimate a price when productId is null and the instruction gives one explicitly.
- If pricing benchmark context is given above and the instruction doesn't specify a discount, you may use the benchmark as a reasonable default discountPct — never exceed it without the instruction asking for more.
"""

# Called once, right after a document is rendered (both AI- and manually-
# created — see plan §6). Deliberately qualitative only: a fabricated
# conversion-likelihood percentage would be dishonest before there's enough
# historical data to compute one for real (that's Phase 4, not this).
DOCUMENT_AI_SUMMARY = """\
Summarize this {document_type} in 2-3 sentences for {user_name}'s own reference — not for the customer.

Customer: {contact_name}
Total: {total_display}
Status: {status}
Line items / sections: {content_summary}
Notes: {notes}
{reasoning_line}

Cover: why this document exists (what was asked for), anything notable about the terms (discounts, deadlines), and one suggested next action (e.g. "follow up in 3 days if no response"). Plain text, no JSON, no markdown.
"""

# Advisory only — never blocks sending, just tells the user what to fix.
# See plan §15 Phase 2.
DOCUMENT_QUALITY_CHECK = """\
Review this {document_type} before {user_name} sends it to {contact_name}.

Content: {content_summary}
Notes: {notes}
Terms: {terms}
Total: {total_display}

Check for: missing or zero totals, empty terms, placeholder-looking text, obvious typos, a quotation with no expiry date, an invoice with no due date. Return ONLY valid JSON:
{{
  "score": 0-10,
  "issues": ["short, specific issue — empty array if none"],
  "recommendation": "one sentence, or empty string if nothing to add"
}}
"""

# Per-document AI Assistant (plan §12/§15 Phase 3) — the same discipline as
# GENERATE_DOCUMENT_DATA: AI edits structured data, never layout. Reuses the
# "regenerate with instruction" pattern already shipped for proactive_queue,
# scoped to one document and made multi-turn via history.
DOCUMENT_CHAT = """\
You are helping edit a {document_type}. Here is its current data:
{current_data}

Conversation so far:
{history}

New instruction: "{instruction}"

Apply the instruction to the data (e.g. "reduce the price by 5%" recalculates unitPriceCents or discountPct on the relevant items; "make this more persuasive" rewrites the relevant section's body; "add a warranty line" appends a note). Only change what the instruction asks for — leave everything else as-is.

Return ONLY valid JSON:
{{
  "items": [{{"productId": null, "description": "", "quantity": 1, "unitPriceCents": 0, "discountPct": 0, "taxPct": 0}}] or null if unchanged,
  "sections": [{{"heading": "", "body": ""}}] or null if unchanged,
  "notes": "string or null if unchanged",
  "terms": "string or null if unchanged",
  "reply": "1 sentence confirming what you changed, addressed to the person editing — not the customer"
}}
"""

# AI Compares Documents / "Sales-Analyst Mode" (plan §8/§15 Phase 4) — same
# shape as /internal/content/recommendations (Zuri Marketing): real
# aggregated numbers in, grounded suggestions out, no per-row prompt
# stuffing. `stats` below is a plain-language rendering of a GROUP BY over
# documents, not raw rows.
DOCUMENT_INSIGHTS = """\
You are a sales analyst reviewing {user_name}'s quotations and invoices.

Aggregated stats (from real data, already computed — do not invent numbers beyond these):
{stats}

Write 3-5 short, specific, actionable observations about what's converting and what isn't, based only on this data. If a document type or segment has a notably high or low conversion/expiry rate, call it out. No generic sales advice. Return ONLY a JSON object: {{"insights": ["...", "..."]}}
"""
