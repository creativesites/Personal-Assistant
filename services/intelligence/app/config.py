from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')

    database_url: str
    redis_url: str
    port: int = 8000
    environment: str = 'development'
    api_url: str = 'http://localhost:3000'

    anthropic_api_key: str = ''
    openai_api_key: str = ''
    google_ai_api_key: str = ''
    default_ai_model: str = 'claude-haiku-4-5-20251001'
    embedding_model: str = 'text-embedding-3-small'


settings = Settings()
