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
    default_ai_model: str = 'gemini/gemini-3.5-flash'
    embedding_model: str = 'text-embedding-3-small'


settings = Settings()
