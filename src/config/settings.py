from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    DATABASE_URL: str
    GOOGLE_API_KEY: str
    DEFAULT_STRATEGY: str = "naive_dump"
    DEFAULT_MODEL: str = "gemini-3.0-flash"
    LOG_LEVEL: str = "INFO"


settings = Settings()
