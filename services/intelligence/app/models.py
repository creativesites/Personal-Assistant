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


class ContactProfileUpdate(BaseModel):
    personality_summary: str
    communication_style: str
    emotional_patterns: dict
    known_triggers: list[str]
    current_life_context: str
    mood_baseline: str
