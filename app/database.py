from typing import Optional
import logging
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.config import settings

logger = logging.getLogger("app.database")


def create_db_engine():
    connect_args = {}
    if settings.DB_IS_POSTGRESQL:
        connect_args = {
            "command_timeout": 30,
            "server_settings": {
                "statement_timeout": "30000",
            },
        }
    return create_async_engine(
        settings.DATABASE_URL,
        echo=settings.DEBUG,
        pool_size=settings.DB_POOL_SIZE,
        max_overflow=settings.DB_MAX_OVERFLOW,
        pool_pre_ping=True,
        pool_recycle=settings.DB_POOL_RECYCLE,
        pool_timeout=settings.DB_POOL_TIMEOUT,
        connect_args=connect_args,
    )


engine = create_db_engine()
async_session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


def log_pool_status():
    pool = engine.pool
    logger.info(
        "DB pool status: size=%d checkedin=%d checkedout=%d overflow=%d",
        pool.size(), pool.checkedin(), pool.checkedout(), pool.overflow(),
    )


class Base(DeclarativeBase):
    pass


async def get_db():
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
