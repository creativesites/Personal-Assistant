ANALYSE_MESSAGE = """\
Analyze this WhatsApp message and return structured JSON.

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
  "events_detected": [{{"title": "", "type": "birthday|anniversary|meeting|deadline|celebration|other", "date": null, "is_recurring": false}}]
}}
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
  "relationship_stage": "how far along the relationship is: new_contact|building_rapport|established|trusted_partner|at_risk|dormant"
}}
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
