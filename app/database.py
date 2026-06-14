from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.config import settings


def create_db_engine():
    url = settings.DATABASE_URL
    connect_args = {}
    if settings.DB_IS_SQLITE:
        connect_args["check_same_thread"] = False
        return create_async_engine(url, echo=settings.DEBUG, connect_args=connect_args)
    return create_async_engine(
        url,
        echo=settings.DEBUG,
        pool_size=20,
        max_overflow=10,
        pool_pre_ping=True,
        pool_recycle=3600,
    )


engine = create_db_engine()
async_session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


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
