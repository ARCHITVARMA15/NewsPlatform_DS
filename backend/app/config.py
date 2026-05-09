import os
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # LLM
    groq_api_key: str

    # Search
    tavily_api_key: str

    # News
    newsdata_api_key: str

    # Database
    supabase_url: str
    supabase_service_key: str

    # Observability — matches LANGCHAIN_* keys in .env
    langchain_api_key: str
    langchain_project: str = "news-platform"
    langchain_tracing_v2: str = "true"
    langchain_endpoint: str = "https://api.smith.langchain.com"

    # App
    sqlite_db_path: str = "./checkpoints.db"
    frontend_url: str = "http://localhost:3000"


settings = Settings()

# Ensure LangSmith / LangChain tracing env vars are set for all child processes
os.environ["LANGCHAIN_API_KEY"] = settings.langchain_api_key
os.environ["LANGCHAIN_PROJECT"] = settings.langchain_project
os.environ["LANGCHAIN_TRACING_V2"] = settings.langchain_tracing_v2
os.environ["LANGCHAIN_ENDPOINT"] = settings.langchain_endpoint
