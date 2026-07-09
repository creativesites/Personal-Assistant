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
