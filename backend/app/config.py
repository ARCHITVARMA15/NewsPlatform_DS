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

    # Whisper (broadcast analyzer)
    whisper_model: str = "base"   # env var: WHISPER_MODEL

    # AI News Briefing
    elevenlabs_api_key: str = ""  # env var: ELEVENLABS_API_KEY
    did_api_key: str = ""         # env var: DID_API_KEY — Base64("email:api_key")

    # Notion MCP
    notion_token: str = ""         # env var: NOTION_TOKEN
    notion_database_id: str = ""   # env var: NOTION_DATABASE_ID

    # Slack
    slack_webhook_url: str = ""    # env var: SLACK_WEBHOOK_URL


settings = Settings()

# Ensure LangSmith / LangChain tracing env vars are set for all child processes
os.environ["LANGCHAIN_API_KEY"] = settings.langchain_api_key
os.environ["LANGCHAIN_PROJECT"] = settings.langchain_project
os.environ["LANGCHAIN_TRACING_V2"] = settings.langchain_tracing_v2
os.environ["LANGCHAIN_ENDPOINT"] = settings.langchain_endpoint
