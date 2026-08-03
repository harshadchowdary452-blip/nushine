import pytest
from typing import AsyncGenerator
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from app.database import Base, get_db
from app.main import app, limiter
from app.routers.auth import limiter as auth_limiter

# Live-server scripts (no pytest fixtures, hit http://localhost:8000 directly).
# They are executed manually; importing them during collection would run the
# full flow (and previously the hardcoded superadmin credential).
collect_ignore = [
    "test_treatment_e2e.py",
    "test_phase33_e2e.py",
    "test_sync_chain_e2e.py",
    "test_treatment_execution_e2e.py",
]

TEST_DATABASE_URL = "sqlite+aiosqlite://"
# Align app config with the in-memory test database so DB-specific SQL
# (to_char vs strftime) resolves to SQLite during tests.
from app.config import settings as _settings
_settings.DATABASE_URL = TEST_DATABASE_URL
engine = create_async_engine(TEST_DATABASE_URL, echo=False, connect_args={"check_same_thread": False})
test_async_session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


@pytest.fixture(autouse=True)
async def setup_database():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


async def override_get_db():
    async with test_async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


@pytest.fixture
async def client() -> AsyncGenerator:
    app.dependency_overrides[get_db] = override_get_db
    limiter.enabled = False
    auth_limiter.enabled = False
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    limiter.enabled = True
    auth_limiter.enabled = True
    app.dependency_overrides.clear()


@pytest.fixture
async def db_session() -> AsyncGenerator:
    async with test_async_session_factory() as session:
        yield session
