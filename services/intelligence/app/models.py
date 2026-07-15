from pydantic import BaseModel, Field


class EmotionScores(BaseModel):
    joy: float = 0.0
    sadness: float = 0.0
    anger: float = 0.0
    fear: float = 0.0
    surprise: float = 0.0
    love: float = 0.0


class IntentAnalysis(BaseModel):
    primary: str  # question|request|statement|expression|acknowledgment|farewell|greeting
    details: str = ''


class EntityItem(BaseModel):
    text: str
    type: str  # person|date|time|place|organization|product|event


class PromiseItem(BaseModel):
    text: str
    type: str  # commitment|deadline|offer|plan


class EventItem(BaseModel):
    title: str
    type: str  # birthday|anniversary|meeting|deadline|celebration|other
    date: str | None = None
    is_recurring: bool = False


class BusinessFactMention(BaseModel):
    key: str
    value: str
    category: str = 'other'  # product|pricing|shipping|refund_policy|faq|hours|inventory|
                              # promotion|supplier|tax|bank_details|wa_template|brand_voice|objection|other


class OpportunityMention(BaseModel):
    """A structured opportunity signal detected in a single message — see
    docs/RELATIONSHIP_OS_PLAN.md §5.8/§6.7. estimated_value_cents is left
    None for personal-type opportunities (life_event, reconnect_window,
    support_needed) since there's no commercial value to estimate."""
    opportunity_type: str  # buying_signal|expansion|referral_moment|renewal_due|
                            # life_event|reconnect_window|churn_risk|support_needed
    title: str
    description: str = ''
    estimated_value_cents: int | None = None
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)


class ConnectionMention(BaseModel):
    """A relationship-between-people signal — 'my brother Peter', 'I work
    with John at ABC Construction' — see docs/RELATIONSHIP_OS_PLAN.md §5.7.
    other_person_name is resolved against the user's other contacts by name
    match; mentions of people who aren't existing contacts are dropped."""
    other_person_name: str
    connection_type: str  # works_with|introduced_by|owns|refers_to|family_of|friend_of|married_to
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)
    supporting_text: str = ''


class ProductMention(BaseModel):
    """A product/service signal tied to a contact — see
    docs/RELATIONSHIP_OS_PLAN.md §5.6. product_name is resolved against the
    user's `products` catalog by name match; mentions of products that
    aren't in the catalog are dropped, same discipline as ConnectionMention.
    replacement_interval_days is only set when the product is a consumable
    with a predictable replacement cycle (e.g. printer toner ~60 days) and
    relation_type is 'purchased' — used to compute contact_products.
    replacement_predicted_at, which later feeds a renewal_due opportunity."""
    product_name: str
    relation_type: str  # purchased|interested|quoted|recommended|mentioned
    quantity: int = 1
    replacement_interval_days: int | None = None
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)


class OrderIntentMention(BaseModel):
    """A live purchase request — 'I'd like 10 uniforms', not just 'how much
    are uniforms' or a past-tense mention (that's ProductMention's job). See
    docs/BUSINESS_OS_PLAN.md §15 — this is what triggers the
    conversation-to-automation action-bundle proposal. product_name is
    resolved against the catalog the same way as ProductMention (exact
    single-match only); ambiguous or unmatched items are dropped. Kept
    deliberately narrow/high-confidence — this is the one detector that
    results in a multi-action proposal shown to the user, not just a
    passive relationship-memory write."""
    product_name: str
    quantity: int = 1
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)


class LifeEventMention(BaseModel):
    """A major personal life event — see docs/RELATIONSHIP_OS_PLAN.md §6.6.
    Distinct from EventItem (birthdays/meetings/routine calendar events):
    this captures the handful of things worth a contact's own timeline."""
    event_type: str  # new_job|moved|had_child|got_married|health_issue|loss|achievement|started_business
    title: str
    date: str | None = None


class MessageAnalysis(BaseModel):
    sentiment: str  # positive|negative|neutral|mixed
    sentiment_score: float = Field(ge=0.0, le=1.0)
    emotions: EmotionScores = Field(default_factory=EmotionScores)
    intent: IntentAnalysis
    topics: list[str] = Field(default_factory=list)
    entities: list[EntityItem] = Field(default_factory=list)
    importance_score: float = Field(ge=0.0, le=1.0)
    requires_response: bool = False
    response_urgency: str = 'low'  # low|medium|high|urgent
    promises_detected: list[PromiseItem] = Field(default_factory=list)
    events_detected: list[EventItem] = Field(default_factory=list)
    business_facts_mentioned: list[BusinessFactMention] = Field(default_factory=list)
    opportunities_mentioned: list[OpportunityMention] = Field(default_factory=list)
    connections_mentioned: list[ConnectionMention] = Field(default_factory=list)
    products_mentioned: list[ProductMention] = Field(default_factory=list)
    order_intent_mentioned: list[OrderIntentMention] = Field(default_factory=list)
    life_events_mentioned: list[LifeEventMention] = Field(default_factory=list)


class ReplySuggestion(BaseModel):
    text: str
    tone: str  # warm|casual|professional|playful|empathetic
    reasoning: str


class ReplySuggestions(BaseModel):
    suggestions: list[ReplySuggestion]


class InsightItem(BaseModel):
    key: str
    value: str
    confidence: float = Field(ge=0.0, le=1.0)
    supporting_text: str = ''


class ContactInsights(BaseModel):
    insights: list[InsightItem]


class ContactStructuredAttributes(BaseModel):
    """CRM-style structured facts about a contact — merged, not replaced, into
    contact_profiles.structured_attributes each profiling run, so a fact the
    model doesn't re-mention this round isn't wiped out."""
    lifetime_spend: str = ''
    buying_frequency: str = ''
    preferred_payment: str = ''
    common_questions: list[str] = Field(default_factory=list)
    last_frustration: str = ''
    favorite_products: list[str] = Field(default_factory=list)
    typical_reply_time: str = ''
    emoji_usage: str = ''
    budget: str = ''
    notes: str = ''


class AgentPattern(BaseModel):
    key: str
    value: str


class AgentPatternSynthesis(BaseModel):
    """Nightly-consolidation output: durable, cross-interaction lessons
    distilled from many individual 'experience' memories — see
    services/intelligence/app/services/consolidation.py."""
    patterns: list[AgentPattern] = Field(default_factory=list)


class AgentMemoryCandidate(BaseModel):
    """A fact or experience the agent engine judges worth remembering from a
    single interaction. Not strictly validated upstream (the agent's JSON
    response is read via dict .get(), same as reply/confidence/tools), so
    every field has a safe default and the writer tolerates partial data."""
    memory_type: str = 'fact'  # fact|experience
    scope: str = 'contact'     # contact|general — general = applies beyond this one contact
    key: str = ''              # fact: short stable identifier, e.g. "negotiation_style"
    value: str = ''            # fact: the learned value
    situation: str = ''        # experience: what was happening
    action_taken: str = ''     # experience: what the agent did
    outcome: str = ''          # experience: what resulted
    worked: bool | None = None # experience: was the outcome good? (biases future retrieval)


class ContactProfileUpdate(BaseModel):
    personality_summary: str
    communication_style: str
    emotional_patterns: dict
    known_triggers: list[str]
    current_life_context: str
    mood_baseline: str
    buying_behaviour: str = ''
    pain_points: str = ''
    goals: str = ''
    preferences: str = ''
    relationship_stage: str = ''
    structured_attributes: ContactStructuredAttributes = Field(default_factory=ContactStructuredAttributes)
