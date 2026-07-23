"""
Provider Abstraction Layer for Zuri BYOK System.
Defines metadata, strengths, setup steps, model catalogues, and human-friendly error translation.
"""

from typing import Any
from pydantic import BaseModel


class SetupStep(BaseModel):
    step: int
    title: str
    description: str
    action_label: str | None = None
    action_url: str | None = None


class ProviderMetadata(BaseModel):
    id: str
    name: str
    company: str
    description: str
    strengths: list[str]
    best_for: str
    estimated_pricing: str
    difficulty: str  # "Very Easy" | "Easy" | "Moderate"
    is_recommended: bool = False
    badge: str | None = None
    console_url: str
    documentation_url: str
    setup_steps: list[SetupStep]
    default_model: str
    recommended_models: list[dict[str, Any]]


PROVIDERS: dict[str, ProviderMetadata] = {
    'google': ProviderMetadata(
        id='google',
        name='Google Gemini',
        company='Google AI',
        description='Zuri\'s primary recommended provider. Industry-leading speed, multimodal vision capabilities, and generous free & low-cost tiers.',
        strengths=['Extremely affordable pricing', 'Ultra-fast response times', 'Top-tier reasoning & vision', 'Generous free tier'],
        best_for='Most personal users, solopreneurs, and growing SMBs',
        estimated_pricing='~$0.075 per 1M input tokens',
        difficulty='Very Easy',
        is_recommended=True,
        badge='Best Value',
        console_url='https://aistudio.google.com/app/apikey',
        documentation_url='https://ai.google.dev/gemini-api/docs',
        setup_steps=[
            SetupStep(step=1, title='Open Google AI Studio', description='Navigate to Google AI Studio in your browser.', action_label='Open Google AI Studio', action_url='https://aistudio.google.com/app/apikey'),
            SetupStep(step=2, title='Sign in with Google', description='Use your existing Google or Google Workspace account.'),
            SetupStep(step=3, title='Create API Key', description='Click "Create API Key" and choose or create a project.'),
            SetupStep(step=4, title='Copy Key', description='Copy the generated API key string (starts with "AIza").'),
            SetupStep(step=5, title='Paste in Zuri', description='Paste your key in the secure input field below and click Test Connection.'),
        ],
        default_model='gemini/gemini-2.5-flash',
        recommended_models=[
            {'id': 'gemini/gemini-2.5-flash', 'name': 'Gemini 2.5 Flash', 'type': 'fast/general', 'description': 'Fastest, highly capable, best overall balance.'},
            {'id': 'gemini/gemini-2.5-pro', 'name': 'Gemini 2.5 Pro', 'type': 'reasoning', 'description': 'Deep analytical reasoning for complex negotiation & strategy.'},
            {'id': 'gemini/gemini-2.0-flash', 'name': 'Gemini 2.0 Flash', 'type': 'fast', 'description': 'Legacy low-latency model.'},
        ],
    ),
    'openai': ProviderMetadata(
        id='openai',
        name='OpenAI',
        company='OpenAI',
        description='Industry standard for general language tasks, GPT-4o, and advanced structured function calling.',
        strengths=['Universal standard compatibility', 'Exceptional function calling', 'Great multilingual performance'],
        best_for='Businesses requiring GPT-4o capabilities and standard enterprise integrations',
        estimated_pricing='~$2.50 per 1M input tokens (GPT-4o mini: ~$0.15)',
        difficulty='Easy',
        is_recommended=False,
        badge='Popular Standard',
        console_url='https://platform.openai.com/api-keys',
        documentation_url='https://platform.openai.com/docs',
        setup_steps=[
            SetupStep(step=1, title='Open OpenAI Platform', description='Visit the OpenAI Developer API Portal.', action_label='Open OpenAI Platform', action_url='https://platform.openai.com/api-keys'),
            SetupStep(step=2, title='Log in or Register', description='Sign in to your OpenAI account.'),
            SetupStep(step=3, title='Create Secret Key', description='Go to API Keys in the sidebar and click "Create new secret key".'),
            SetupStep(step=4, title='Copy Secret Key', description='Copy your key immediately (starts with "sk-"). It will not be shown again by OpenAI.'),
            SetupStep(step=5, title='Paste in Zuri', description='Paste your key below and click Test Connection.'),
        ],
        default_model='gpt-4o-mini',
        recommended_models=[
            {'id': 'gpt-4o-mini', 'name': 'GPT-4o Mini', 'type': 'fast/general', 'description': 'Fast, cheap, and smart for everyday messaging.'},
            {'id': 'gpt-4o', 'name': 'GPT-4o', 'type': 'reasoning/vision', 'description': 'Flagship multimodal reasoning model.'},
            {'id': 'o3-mini', 'name': 'o3-mini', 'type': 'reasoning', 'description': 'Specialized STEM and analytical reasoning.'},
        ],
    ),
    'anthropic': ProviderMetadata(
        id='anthropic',
        name='Anthropic Claude',
        company='Anthropic',
        description='Renowned for unmatched nuance, human-like voice matching, empathy, and ethical safety controls.',
        strengths=['Best voice & tone matching', 'Superior empathy & nuanced communication', 'Massive context window'],
        best_for='Personal coaching, executive assistant tasks, and relationship OS matching',
        estimated_pricing='~$3.00 per 1M input tokens (Claude 3.5 Haiku: ~$0.80)',
        difficulty='Easy',
        is_recommended=False,
        badge='Best Human Voice',
        console_url='https://console.anthropic.com/settings/keys',
        documentation_url='https://docs.anthropic.com/',
        setup_steps=[
            SetupStep(step=1, title='Open Anthropic Console', description='Go to Anthropic Account Settings.', action_label='Open Anthropic Console', action_url='https://console.anthropic.com/settings/keys'),
            SetupStep(step=2, title='Sign in to Anthropic', description='Access your Anthropic developer workspace.'),
            SetupStep(step=3, title='Create Key', description='Click "API Keys" -> "Create Key", give it a name like "Zuri Personal Assistant".'),
            SetupStep(step=4, title='Copy Key', description='Copy your secret key (starts with "sk-ant-").'),
            SetupStep(step=5, title='Paste in Zuri', description='Paste your key below and click Test Connection.'),
        ],
        default_model='claude-3-5-haiku-20241022',
        recommended_models=[
            {'id': 'claude-3-5-haiku-20241022', 'name': 'Claude 3.5 Haiku', 'type': 'fast', 'description': 'Lightning fast with human warmth.'},
            {'id': 'claude-3-5-sonnet-20241022', 'name': 'Claude 3.5 Sonnet', 'type': 'reasoning/writing', 'description': 'Industry gold standard for human writing & reasoning.'},
        ],
    ),
    'openrouter': ProviderMetadata(
        id='openrouter',
        name='OpenRouter',
        company='OpenRouter',
        description='Unified API gateway connecting you to over 200+ open and proprietary models via one key.',
        strengths=['Access to 200+ models', 'Fallback routing', 'Single unified billing'],
        best_for='Advanced power users who want maximum model variety',
        estimated_pricing='Varies by model chosen',
        difficulty='Moderate',
        is_recommended=False,
        badge='200+ Models',
        console_url='https://openrouter.ai/keys',
        documentation_url='https://openrouter.ai/docs',
        setup_steps=[
            SetupStep(step=1, title='Open OpenRouter Dashboard', description='Go to OpenRouter Key Management.', action_label='Open OpenRouter', action_url='https://openrouter.ai/keys'),
            SetupStep(step=2, title='Create Key', description='Click "Create Key" and set optional credit limits.'),
            SetupStep(step=3, title='Copy & Paste', description='Copy key (starts with "sk-or-") and paste below.'),
        ],
        default_model='openrouter/auto',
        recommended_models=[
            {'id': 'openrouter/auto', 'name': 'OpenRouter Auto Router', 'type': 'general', 'description': 'Automatically picks best price/performance.'},
        ],
    ),
    'groq': ProviderMetadata(
        id='groq',
        name='Groq (LPU)',
        company='Groq Inc.',
        description='Ultra-high speed Inference Engine running Llama 3 models at over 500 tokens per second.',
        strengths=['500+ tokens/sec speed', 'Instant real-time replies', 'Very low latency'],
        best_for='High-volume automated customer support requiring sub-second response times',
        estimated_pricing='~$0.05 - $0.59 per 1M tokens',
        difficulty='Easy',
        is_recommended=False,
        badge='Ultra-Fast LPU',
        console_url='https://console.groq.com/keys',
        documentation_url='https://console.groq.com/docs',
        setup_steps=[
            SetupStep(step=1, title='Open Groq Console', description='Visit Groq Developer Console.', action_label='Open Groq Console', action_url='https://console.groq.com/keys'),
            SetupStep(step=2, title='Create API Key', description='Click "Create API Key" (starts with "gsk_").'),
            SetupStep(step=3, title='Paste in Zuri', description='Paste key below and test connection.'),
        ],
        default_model='groq/llama-3.3-70b-versatile',
        recommended_models=[
            {'id': 'groq/llama-3.3-70b-versatile', 'name': 'Llama 3.3 70B', 'type': 'fast/general', 'description': 'Ultra-fast 70B open model.'},
        ],
    ),
}


def translate_provider_error(error_msg: str, status_code: int | None = None) -> str:
    """
    Translates raw technical API errors into warm, plain English business advice.
    No technical jargon shown to non-technical users.
    """
    err = error_msg.lower()

    if status_code == 401 or 'unauthorized' in err or 'invalid_api_key' in err or 'invalid api key' in err or 'incorrect api key' in err:
        return 'The API key appears to be invalid or mistyped. Please double-check that you copied the complete key correctly from your provider dashboard.'

    if status_code == 403 or 'forbidden' in err or 'access denied' in err or 'permission' in err:
        return 'Your API key does not have permission to use text generation models. Please verify that your provider account is active and has enabled model permissions.'

    if status_code == 429 or 'quota' in err or 'insufficient_quota' in err or 'exhausted' in err or 'billing' in err or 'credit' in err:
        return 'Your AI provider account has reached its quota or spending limit, or needs a payment method attached. Please check your billing settings on your provider website.'

    if 'rate limit' in err or 'too many requests' in err:
        return 'Your provider key is receiving too many requests at once. Zuri will automatically manage retries, but consider upgrading your tier on your provider console if this persists.'

    if 'not found' in err or 'model_not_found' in err or 'does not exist' in err:
        return 'The requested model is not available for this API key. We have automatically selected a supported alternative model for you.'

    if 'connection' in err or 'timeout' in err or 'unreachable' in err:
        return 'Could not reach the AI provider servers. Please check your internet connection or verify if the provider is experiencing an outage.'

    return f'Connection test failed: {error_msg}. Please review your provider account status.'
