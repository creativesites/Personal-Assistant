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
        default_model='gemini/gemini-3.6-flash',
        recommended_models=[
            {'id': 'gemini/gemini-3.6-flash', 'name': 'Gemini 3.6 Flash', 'type': 'fast/general', 'description': 'Recommended. High speed, latest Gemini 3 architecture.', 'recommended': True},
            {'id': 'gemini/gemini-3.5-pro', 'name': 'Gemini 3.5 Pro', 'type': 'reasoning', 'description': 'Deep reasoning & analysis.'},
            {'id': 'gemini/gemini-3.5-flash', 'name': 'Gemini 3.5 Flash', 'type': 'fast', 'description': 'Balanced speed & accuracy.'},
            {'id': 'gemini/gemini-3.5-flash-lite', 'name': 'Gemini 3.5 Flash Lite', 'type': 'light', 'description': 'Ultra-fast lightweight model.'},
            {'id': 'gemini/gemini-3-flash', 'name': 'Gemini 3 Flash', 'type': 'fast', 'description': 'Standard Gemini 3 Flash.'},
            {'id': 'gemini/gemini-3-deep-think', 'name': 'Gemini 3 Deep Think', 'type': 'reasoning', 'description': 'Advanced deep thinking & logic.'},
            {'id': 'gemini/gemini-flash-cyber', 'name': 'Gemini Flash Cyber', 'type': 'specialized', 'description': 'Specialized security & cyber intelligence.'},
        ],
    ),
    'openai': ProviderMetadata(
        id='openai',
        name='OpenAI',
        company='OpenAI',
        description='Industry standard for general language tasks, GPT-5, and advanced structured function calling.',
        strengths=['Universal standard compatibility', 'Exceptional function calling', 'Great multilingual performance'],
        best_for='Businesses requiring GPT-5 capabilities and standard enterprise integrations',
        estimated_pricing='~$2.50 per 1M input tokens',
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
        default_model='gpt-5.6',
        recommended_models=[
            {'id': 'gpt-5.6', 'name': 'GPT-5.6 (Sol)', 'type': 'flagship', 'description': 'Recommended. Next-gen GPT-5 architecture.', 'recommended': True},
            {'id': 'gpt-5.6-terra', 'name': 'GPT-5.6 Terra', 'type': 'general', 'description': 'Grounded high-efficiency model.'},
            {'id': 'gpt-5.6-luna', 'name': 'GPT-5.6 Luna', 'type': 'fast', 'description': 'Sub-second real-time model.'},
            {'id': 'o4', 'name': 'o4', 'type': 'reasoning', 'description': 'Advanced o-series reasoning model.'},
            {'id': 'o4-mini', 'name': 'o4 Mini', 'type': 'reasoning/fast', 'description': 'Compact STEM & logic reasoning.'},
            {'id': 'o3', 'name': 'o3', 'type': 'reasoning', 'description': 'Deep reasoning engine.'},
        ],
    ),
    'anthropic': ProviderMetadata(
        id='anthropic',
        name='Anthropic Claude',
        company='Anthropic',
        description='Renowned for unmatched nuance, human-like voice matching, empathy, and ethical safety controls.',
        strengths=['Best voice & tone matching', 'Superior empathy & nuanced communication', 'Massive context window'],
        best_for='Personal coaching, executive assistant tasks, and relationship OS matching',
        estimated_pricing='~$3.00 per 1M input tokens',
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
        default_model='claude-opus-5',
        recommended_models=[
            {'id': 'claude-opus-5', 'name': 'Claude Opus 5', 'type': 'flagship', 'description': 'Recommended. Unmatched human empathy, nuance & writing.', 'recommended': True},
            {'id': 'claude-sonnet-5', 'name': 'Claude Sonnet 5', 'type': 'reasoning/writing', 'description': 'Balanced reasoning and professional writing.'},
            {'id': 'claude-haiku-5', 'name': 'Claude Haiku 5', 'type': 'fast', 'description': 'Lightning-fast voice matching.'},
        ],
    ),
    'qwen': ProviderMetadata(
        id='qwen',
        name='Alibaba Qwen',
        company='Alibaba Cloud',
        description='High performance open-weights and enterprise models via DashScope API.',
        strengths=['Multilingual excellence', 'Strong reasoning & coding', 'Low cost'],
        best_for='Enterprise workflows and custom domain adaptations',
        estimated_pricing='~$0.20 per 1M input tokens',
        difficulty='Easy',
        is_recommended=False,
        badge='High Quality',
        console_url='https://dashscope.console.aliyun.com/',
        documentation_url='https://help.aliyun.com/dashscope/',
        setup_steps=[
            SetupStep(step=1, title='Open DashScope Console', description='Navigate to Alibaba Cloud DashScope.'),
            SetupStep(step=2, title='Generate API Key', description='Create a new DashScope API Key.'),
            SetupStep(step=3, title='Paste in Zuri', description='Paste your key below and test connection.'),
        ],
        default_model='dashscope/qwen-3.8-max',
        recommended_models=[
            {'id': 'qwen-3.8-max', 'name': 'Qwen 3.8 Max', 'type': 'flagship', 'description': 'Recommended. Premium large model.', 'recommended': True},
            {'id': 'qwen-3.8', 'name': 'Qwen 3.8', 'type': 'general', 'description': 'Standard Qwen 3.8 model.'},
            {'id': 'qwen-3.7-max', 'name': 'Qwen 3.7 Max', 'type': 'reasoning', 'description': 'Qwen 3.7 Max intelligence.'},
            {'id': 'qwen-3.6-plus', 'name': 'Qwen 3.6 Plus', 'type': 'general', 'description': 'Balanced Qwen 3.6 Plus.'},
            {'id': 'qwen-3.5', 'name': 'Qwen 3.5', 'type': 'fast', 'description': 'Fast lightweight model.'},
            {'id': 'qwen2.5-coder', 'name': 'Qwen2.5 Coder', 'type': 'coding', 'description': 'Specialized coding assistant.'},
            {'id': 'qwen2.5-vl', 'name': 'Qwen2.5 VL', 'type': 'vision', 'description': 'Multimodal vision model.'},
            {'id': 'qwen2.5-math', 'name': 'Qwen2.5 Math', 'type': 'math', 'description': 'Specialized math engine.'},
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
