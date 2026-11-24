from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')

    database_url: str
    redis_url: str
    port: int = 8000
    environment: str = 'development'
    api_url: str = 'http://localhost:3000'
    internal_api_secret: str = ''
    kb_storage_dir: str = '/app/kb-storage'
    doc_storage_dir: str = '/app/doc-storage'

    anthropic_api_key: str = ''
    openai_api_key: str = ''
    google_ai_api_key: str = ''
    dashscope_api_key: str = ''  # legacy / standard DashScope endpoint

    # Alibaba private MaaS workspace — two endpoint formats available:
    # - ALIBABA_API_HOST: native DashScope format (/api/v1) — used with dashscope/ provider
    # - ALIBABA_OPENAI_COMPATIBLE_HOST: OpenAI-compatible format (/compatible-mode/v1)
    alibaba_ai_api_key: str = ''
    alibaba_api_host: str = ''                    # e.g. https://ws-xxxx.maas.aliyuncs.com/api/v1
    alibaba_openai_compatible_host: str = ''      # e.g. https://ws-xxxx.maas.aliyuncs.com/compatible-mode/v1

    # Primary text model. 'anthropic/claude-haiku-5-5' (or 'haiku' /
    # 'sonnet' / 'opus') routes through the native Claude path in
    # ai/claude.py; anything else goes through the LiteLLM pools.
    default_ai_model: str = 'dashscope/qwen-max'
    # Used when the primary model fails hard (bad key, quota, refusal) and
    # the dashscope pool is exhausted. Must be a LiteLLM model, not Claude.
    fallback_ai_model: str = 'gemini/gemini-3.5-flash'
    # Claude: thinking effort (low|medium|high|xhigh|max) — 'low' keeps the
    # short classification/extraction calls inside AIClient's timeout.
    claude_effort: str = 'low'
    # JSON map of feature tag → Claude model/alias, e.g.
    # '{"advisor_chat": "sonnet", "chat_analysis": "opus"}'.
    claude_feature_models: str = ''

    embedding_model: str = 'text-embedding-3-small'

    tavily_api_key: str = ''
    serp_api_key: str = ''


settings = Settings()
