from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql+asyncpg://cafe_user:cafe_pass@db:5432/cafe_reply"
    database_url_sync: str = "postgresql://cafe_user:cafe_pass@db:5432/cafe_reply"

    # Redis
    redis_url: str = "redis://redis:6379/0"

    # RabbitMQ
    rabbitmq_url: str = "amqp://guest:guest@rabbitmq:5672/"

    # Meta Platform
    meta_app_secret: str = ""
    meta_verify_token: str = ""

    # Gemini
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.0-flash"

    # Encryption
    encryption_key: str = ""

    # JWT
    jwt_secret: str = ""

    # App
    app_env: str = "development"
    log_level: str = "INFO"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
