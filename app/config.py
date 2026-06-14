from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True)

    APP_NAME: str = "NuShine Dental"
    APP_TAGLINE: str = "Modern Dental Practice Management Platform"
    DEBUG: bool = False
    ENVIRONMENT: str = "development"

    DATABASE_URL: str = "sqlite+aiosqlite:///./dental_hospital.db"
    DATABASE_URL_SYNC: str = "sqlite:///./dental_hospital.db"

    @property
    def DB_IS_POSTGRESQL(self) -> bool:
        return self.DATABASE_URL.startswith("postgresql")

    @property
    def DB_IS_SQLITE(self) -> bool:
        return self.DATABASE_URL.startswith("sqlite")

    @property
    def DB_DRIVER(self) -> str:
        if "postgresql+asyncpg" in self.DATABASE_URL or "postgresql+psycopg2" in self.DATABASE_URL:
            return self.DATABASE_URL.split("://")[0]
        if self.DB_IS_POSTGRESQL:
            return "postgresql+asyncpg"
        if self.DB_IS_SQLITE:
            return "sqlite+aiosqlite"
        return self.DATABASE_URL.split("://")[0]

    @property
    def SYNC_DATABASE_URL(self) -> str:
        if self.DB_IS_POSTGRESQL:
            return self.DATABASE_URL.replace("+asyncpg", "+psycopg2").replace("postgresql+psycopg2", "postgresql")
        return self.DATABASE_URL_SYNC

    SECRET_KEY: str = "change-this-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    REDIS_URL: str = "redis://localhost:6379/0"

    CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:5173"]

    UPLOAD_DIR: str = "app/uploads"
    MAX_UPLOAD_SIZE: int = 5 * 1024 * 1024

    WHATSAPP_PROVIDER: str = "mock"
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_WHATSAPP_NUMBER: str = ""

    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    EMAIL_FROM: str = "noreply@dentalhospital.com"

    SUPER_ADMIN_EMAIL: str = "superadmin@dental.com"
    SUPER_ADMIN_PASSWORD: str = "SuperAdmin@123"


settings = Settings()
