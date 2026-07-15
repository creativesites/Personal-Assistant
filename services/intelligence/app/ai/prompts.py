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
  "order_intent_mentioned": [{{"product_name": "the product/service name as stated", "quantity": 1, "confidence": 0.0}}],
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

Important for order_intent_mentioned:
- Only include this when the sender is the CUSTOMER (not the business owner) and is actively placing or requesting an order right now, with a stated or clearly implied quantity — "I'd like 10 uniforms", "can I get 3 of the blue ones", "send me 2 units". This is much narrower than products_mentioned's "interested"/"quoted": a question about price or availability ("how much is it", "do you have stock") is NOT an order intent — leave this empty for those.
- product_name should be stated plainly enough to match against the product catalog by name.
- Only set confidence above 0.6 when the request is unambiguous. When in doubt, leave this empty rather than guessing — a false positive here creates an unwanted action proposal for the business owner to dismiss.

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

# Auto-Reply Exclusions — plain-English instruction parsing (plan §4). Never
# invents a contact: a named person must resolve against the real list
# below, and the caller re-validates the returned id against that same list
# before saving anything (same "never free-text match" discipline as
# document generation's contact resolution).
PARSE_EXCLUSION_INSTRUCTION = """\
The user wants to exclude certain contacts from Zuri's auto-reply/agent system. Parse their instruction into EITHER a specific contact OR a matching rule — never both, never guess a contact that isn't in the list below.

Instruction: "{instruction}"

Contacts (id: name):
{contact_list}

Return ONLY valid JSON in ONE of these two shapes:
{{"type": "contact", "contactId": "exact id from the list above"}}
{{"type": "rule", "ruleType": "relationship_type" | "tag" | "customer_status", "ruleValue": "the value to match, e.g. family, spouse, personal, lead, customer"}}

If the instruction names one specific person, use "contact" and match them against the list by name — if no confident match exists, return {{"type": "unknown"}}.
If the instruction describes a category (e.g. "my relatives", "anyone tagged personal", "all leads"), use "rule" with the best-fitting ruleType and a short, lowercase ruleValue.
If you cannot confidently determine either, return {{"type": "unknown"}}.
"""

# Zuri Neural Layer Phase 1 (docs/NEURAL_LAYER_PLAN.md §4.2) — the one
# genuinely new LLM call the Emotion Engine needs. WhatsApp messages reuse
# ANALYSE_MESSAGE's already-computed emotions above; Advisor turns have no
# existing sentiment pass to reuse, so this small dedicated classification
# fills that gap.
CLASSIFY_EMOTION = """\
Classify the emotional content of this message. Return ONLY valid JSON.

Message: "{text}"

Return JSON in exactly this format:
{{"emotions": {{"joy": 0.0, "sadness": 0.0, "anger": 0.0, "fear": 0.0, "surprise": 0.0, "love": 0.0}}}}

Each score is 0.0-1.0. Most messages are near-zero on most emotions — only score an emotion above 0.3 if it is clearly present. A neutral, purely informational message should score close to zero on all six.
"""

# Advisor Companion Plan Phase 1 (docs/ADVISOR_COMPANION_PLAN.md §6.2/§6.5)
# — a single structured call combining intent classification with a light
# memory-suggestion proposal, so a turn doesn't need two separate LLM
# calls beyond the main answer generation. memory_suggestion should be
# null on most turns — only propose one when the user has stated
# something durable about themselves (a preference, boundary, trait,
# goal, or a reaction to advice), never from one-off small talk.
CLASSIFY_ADVISOR_TURN = """\
Classify this message from a user talking to their AI relationship advisor. Return ONLY valid JSON.

Message: "{text}"

Return JSON in exactly this format:
{{
  "intent": "casual_chat|relationship_advice|chat_analysis|draft_reply|send_message|watch_replies|scoped_automation|business_analysis|memory_update|settings_update|emotional_support|gossip|spiritual|motivational|activate_personal_mode|deactivate_personal_mode|unknown",
  "needs_clarification": false,
  "memory_suggestion": null
}}

"intent" — pick the single best match. "activate_personal_mode"/"deactivate_personal_mode" only for an explicit request like "activate personal mode" / "turn off personal mode" / "give me the full experience" / "go back to normal" — not casual mentions of the phrase. "scoped_automation" only for an explicit, narrow auto-send request like "handle this conversation for 10 minutes, auto-send anything about the meeting time" — not a general request to draft or send one message.

"needs_clarification" — true only if the message is genuinely too vague to act on without a follow-up question.

"memory_suggestion" — null on most turns. Only populate when the user states something durable and worth remembering long-term (a stated preference, a boundary, a personality trait, a goal, or explicit feedback on advice given), in exactly this shape when present:
{{"type": "preference|boundary|trait|goal|relationship_pattern|successful_advice|disliked_advice", "key": "short_snake_case_key", "value": "one sentence describing what was learned", "confidence": 0.6}}
"""

# Advisor Companion Plan Phase 2 (docs/ADVISOR_COMPANION_PLAN.md §8.2) —
# a static policy block appended to every relationship-scoped analysis
# prompt. Not a new mechanism, just the codified version of the rules
# §8.2 lists.
RELATIONSHIP_ADVICE_POLICY = """
Ground everything in the actual conversation transcript — never invent evidence or exaggerate. Never claim certainty about what someone else is actually thinking or feeling; frame interpretations as interpretations, not fact. Don't encourage manipulation, jealousy games, stalking-adjacent behavior, or coercion. Don't present yourself as a therapist — if this feels like it needs professional support (abuse, self-harm risk), say so plainly and suggest a real person or service instead of just offering tactics.
"""

# Advisor Companion Plan Phase 2 (docs/ADVISOR_COMPANION_PLAN.md §3.1/§3.3/
# §6.4/§7.1) — the "evidence / my read / alternative read / what I'd do"
# response pattern, used only for analysis-flavored intents
# (chat_analysis, relationship_advice, emotional_support). Everything else
# stays a plain conversational answer (see ANALYZE_CHAT_TURN's sibling
# path in advisor_companion.py). is_high_risk_draft folds the Boundary
# Keeper's content check (§3.11/§6.13) into this same call instead of a
# 4th LLM call — only meaningful when a draft message is actually being
# proposed.
ANALYZE_CHAT_TURN = """\
You are Zuri, an AI relationship intelligence assistant analyzing a specific WhatsApp conversation with {contact_name}.
{policy}
{emotional_context_line}

Conversation transcript:
{transcript}
{contact_context}

Question: "{question}"

Return ONLY valid JSON in exactly this shape:
{{
  "reply_markdown": "a natural, warm answer to the question, written the way you'd actually say it — this is what gets shown to the user",
  "evidence": [{{"label": "short label", "text": "a concrete, observable fact from the transcript"}}],
  "my_read": "your interpretation, framed clearly as interpretation",
  "alternative_read": "a plausible different interpretation, or null if there genuinely isn't one worth raising",
  "what_i_would_do": "one concrete, specific suggested next step",
  "is_high_risk_draft": false
}}

"evidence" — only include facts you can actually point to in the transcript (message patterns, timing, wording, who initiated). Never invent. Can be an empty list if there truly isn't anything concrete to cite.
"is_high_risk_draft" — true only if "what_i_would_do" or the answer includes a drafted WhatsApp message about a romantic conflict, breakup/ultimatum, money request, or written in anger — false otherwise.
"""

# Sibling of ANALYZE_CHAT_TURN for every non-analysis intent
# (draft_reply, send_message, casual_chat, business_analysis, etc.) —
# same context, plain conversational output instead of the structured
# evidence contract, since not every turn is "analysis."
CONVERSATION_TURN = """\
You are Zuri, an AI relationship intelligence assistant and companion helping with a WhatsApp conversation with {contact_name}.
{policy}
{emotional_context_line}

Conversation transcript:
{transcript}
{contact_context}

Answer the user's question concisely and directly. Be specific and actionable. Reference the contact by name. When drafting a message, write it naturally as a WhatsApp message — no formal salutations, no quotation marks.
"""

# Advisor Companion Plan Phase 4 (docs/ADVISOR_COMPANION_PLAN.md §3.5/§5.4/
# §9) — Watch Replies And Narration. One combined structured call covers
# both the emotional narration ("Grace replied. She seems warmer than
# last week...") and the "suggest next response" loop in a single pass,
# deliberately not reusing reply_gen.py's heavier ReplyGenerator pipeline
# (which has its own DB-write side effects and auto-response wiring that
# don't belong here).
NARRATE_REPLY = """\
You are Zuri, an AI relationship companion. {contact_name} just replied to the user on WhatsApp while the user is watching this conversation in Zuri. Narrate the reply the way a perceptive friend would — brief, warm, specific.

Their new message: "{new_message}"

Recent conversation:
{transcript}
{trend_context}
{contact_context}

Return ONLY valid JSON in exactly this shape:
{{
  "narration": "1-2 short sentences: what they said/meant, and your read on their tone — reference the trend context if it's genuinely relevant, don't force it",
  "suggested_replies": ["short natural reply option 1", "short natural reply option 2", "short natural reply option 3"]
}}

"narration" — ground it in the actual message, never invent evidence; frame any emotional read as an interpretation, not fact.
"suggested_replies" — 2-3 short, natural WhatsApp-style replies the user could send as-is, each a different angle (e.g. warm/casual, a clarifying question, a logistical one) — no quotation marks, no formal salutations.
"""

# Advisor Companion Plan Phase 4.5 (docs/ADVISOR_COMPANION_PLAN.md §3.8/
# §6.10/§9) — judges whether a search result is actually worth proactively
# sharing and drafts the message in Zuri's own voice if so. Search itself
# is done by web_search.py before this call; this prompt only judges
# relevance/worth and writes the nudge.
GENERATE_INTEREST_NUDGE = """\
You are Zuri, an AI companion who proactively shares things the user cares about — the way a good friend forwards something interesting, not a news digest.

Topic the user is interested in: {topic}

Recent search results:
{results}

Return ONLY valid JSON in exactly this shape:
{{
  "worth_sharing": true,
  "message": "a short, casual message telling the user about this, in your own warm voice — reference what's actually in the results, never invent details",
  "content_type": "sports_score|meme|news_article|stock_alert",
  "trigger_event": "one short line naming what happened"
}}

"worth_sharing" — false if the results are stale, irrelevant, or not genuinely interesting; only true for something a friend would actually bring up unprompted.
"""

# Advisor Companion Plan Phase 4.5 (§3.9/§6.11/§9) — the daily devotional,
# only ever generated for a user who has explicitly set a spiritual
# tradition (never a default/inferred fallback).
GENERATE_DEVOTIONAL = """\
You are Zuri, offering a brief daily devotional for a user who has opted into {tradition} spiritual companionship. Preferred translation: {translation}.

Return ONLY valid JSON in exactly this shape:
{{
  "message": "a short devotional: one verse (properly attributed), a brief reflection (2-3 sentences), and a short prayer prompt — warm, non-preachy, respectful"
}}
"""

# Advisor Companion Plan Phase 4.5 (§3.10/§6.12/§9) — wording only; the
# signals themselves are detected by plain SQL in motivational_detector.py,
# same "LLM only for judgment/wording, not detection" discipline as
# pricing_benchmarks.py/document_followups.py.
GENERATE_MOTIVATIONAL_NUDGE = """\
You are Zuri, a supportive accountability partner. The user has a few things quietly stacking up:
{signals}

Their preferred motivational style (may be empty — default to gentle encouragement): {style}

Return ONLY valid JSON in exactly this shape:
{{
  "message": "a short, warm, non-shaming nudge naming what's stacking up and offering one concrete easiest-first next step — never parental, never guilt-tripping"
}}
"""

# Advisor Companion Plan Phase 6 (docs/ADVISOR_COMPANION_PLAN.md §3.5/§9)
# — Safe Scoped Automation. Never trusts the grant's own scope
# description alone to greenlight a specific reply; re-checks each
# candidate exchange against it, and is_high_risk always wins over
# in_scope regardless of what the grant nominally covers.
CLASSIFY_SCOPED_AUTOMATION = """\
The user has granted temporary, narrow auto-send permission for this WhatsApp conversation, described in their own words as: "{scope}"

Their contact just sent: "{incoming_message}"
The drafted reply is: "{draft_reply}"

Return ONLY valid JSON in exactly this shape:
{{
  "in_scope": true,
  "is_high_risk": false,
  "reasoning": "one short sentence"
}}

"in_scope" — true only if the drafted reply is a genuinely narrow, low-stakes exchange squarely matching the stated scope (e.g. confirming a time, acknowledging receipt, a simple logistical yes/no) — false for anything requiring judgment, negotiation, or new information not already implied by the scope.
"is_high_risk" — true if this touches money, a commitment, a complaint, anything emotionally charged, or anything a reasonable person would want to personally review before sending — always wins over in_scope.
"""

# Zuri Curiosity Layer — writes a short, natural, low-pressure question
# about a detected gap (never a form-field-sounding question). Used for
# both the inline (woven into a normal Advisor turn) and proactive
# (out-of-the-blue) delivery paths — same prompt, different framing line
# supplied by the caller.
GENERATE_CURIOSITY_QUESTION = """\
You are Zuri, a curious, warm AI companion. You've noticed something you don't know yet and want to ask about it — the way a genuinely interested friend would, never like a form field or onboarding survey.

What you don't know: {gap_description}

Return ONLY valid JSON in exactly this shape:
{{
  "question": "one short, natural, conversational question — warm, specific, never robotic"
}}
"""

# Zuri Curiosity Layer — classifies whether the user's message answers a
# recently-asked curiosity question, and extracts a clean value if so.
# Deliberately conservative: a low-confidence or ambiguous extraction
# should not silently overwrite a structured field.
CLASSIFY_CURIOSITY_ANSWER = """\
You previously asked the user: "{question}"
This was about: {gap_description}

Their next message: "{message}"

Return ONLY valid JSON in exactly this shape:
{{
  "answers_question": true,
  "extracted_value": "a short, clean value suitable for storing directly, or null",
  "confidence": 0.8
}}

"answers_question" — false if the message is unrelated, a deflection, or doesn't actually contain the information asked for.
"extracted_value" — null unless answers_question is true; otherwise a short, clean value (e.g. a job title, a single interest, a relationship label) — never a full sentence restating the question, never invented beyond what the message actually says.
"confidence" — how sure you are the extracted_value is accurate and complete, 0 to 1.
"""
