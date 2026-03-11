"""Pytest fixtures: testcontainers Postgres, schema, seed data, AsyncClient, mock LLM."""

import asyncio
import json
import os
from collections.abc import AsyncGenerator, Generator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from testcontainers.postgres import PostgresContainer

# Ensure test env before any src imports that read settings
os.environ.setdefault("GEMINI_API_KEY", "test-key-for-tests")
os.environ.setdefault(
    "DATABASE_URL", "postgresql+asyncpg://test:test@localhost:5432/test"
)


# Load src.core first to avoid circular import when registering mocks that import gemini
def _ensure_core_loaded():
    import src.core  # noqa: F401


# Register mock LLM for tests (model="mock" in API/integration tests)
def _register_mock_llm():
    from src.llm import client_factory
    from tests.mocks.mock_llm_client import MockLLMClient

    client_factory._MODEL_REGISTRY["mock"] = (
        lambda model_id: MockLLMClient(model_id=model_id),
        "mock",
    )


def _register_langgraph_mock_llm():
    """Register langgraph-mock: MockLangChainLLM for LangGraph strategy integration tests."""
    from src.llm.provider import register_llm_override
    from tests.mocks.mock_langchain_llm import MockLangChainLLM

    def _factory():
        return MockLangChainLLM()

    register_llm_override("langgraph-mock", _factory)


_ensure_core_loaded()
_register_mock_llm()
_register_langgraph_mock_llm()


@pytest.fixture(scope="session")
def event_loop() -> Generator[asyncio.AbstractEventLoop, None, None]:
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="session")
def postgres_container() -> Generator[PostgresContainer, None, None]:
    try:
        with PostgresContainer("postgres:16-alpine", driver="asyncpg") as container:
            yield container
    except Exception as e:
        # In some environments (e.g. sandboxed CI) Docker is unavailable.
        # Skip integration tests that require testcontainers instead of erroring.
        pytest.skip(f"Docker unavailable for testcontainers: {e}")


@pytest.fixture(scope="session")
def database_url(postgres_container: PostgresContainer) -> str:
    return postgres_container.get_connection_url(driver="asyncpg")


@pytest.fixture
async def db_session(
    database_url: str,
) -> AsyncGenerator[AsyncSession, None]:
    """Create per-test engine, ensure schema, yield session, then dispose engine."""
    engine = create_async_engine(database_url, pool_pre_ping=True)
    session_factory = async_sessionmaker(
        engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    # Ensure schema exists for this engine
    async with engine.begin() as conn:
        await conn.execute(
            text("""
            CREATE TABLE IF NOT EXISTS fhir_resources (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                patient_id TEXT NOT NULL,
                resource_type TEXT NOT NULL,
                resource JSONB NOT NULL,
                received_at TIMESTAMP WITH TIME ZONE DEFAULT now()
            )
        """)
        )
        await conn.execute(
            text("""
            CREATE TABLE IF NOT EXISTS fhir_note_text (
                id SERIAL PRIMARY KEY,
                patient_id TEXT NOT NULL,
                document_type TEXT,
                extracted_text TEXT,
                char_count INT
            )
        """)
        )
    async with session_factory() as session:
        try:
            yield session
        finally:
            await session.rollback()

    await engine.dispose()


@pytest.fixture
async def seeded_db(db_session: AsyncSession) -> AsyncSession:
    """Session with seed data (2-3 patients, varied resources)."""
    patients = [
        (
            "patient-1",
            "Condition",
            {"resourceType": "Condition", "code": {"text": "Hypertension"}},
        ),
        (
            "patient-1",
            "Observation",
            {"resourceType": "Observation", "valueQuantity": {"value": 120}},
        ),
        (
            "patient-2",
            "Condition",
            {"resourceType": "Condition", "code": {"text": "Diabetes"}},
        ),
    ]
    for pid, rtype, resource in patients:
        await db_session.execute(
            text(
                "INSERT INTO fhir_resources (patient_id, resource_type, resource) VALUES (:pid, :rt, CAST(:res AS jsonb))"
            ),
            {"pid": pid, "rt": rtype, "res": json.dumps(resource)},
        )
    await db_session.commit()
    return db_session


@pytest.fixture
def app(database_url: str):
    """FastAPI app. Set DATABASE_URL before any src import that reads it."""
    os.environ["DATABASE_URL"] = database_url
    from src.api.app import create_app

    return create_app()


@pytest.fixture
async def async_client(app, db_session):
    """AsyncClient with overridden get_db using per-test session."""
    from src.api.dependencies import get_db

    async def override_get_db():
        # Reuse the same AsyncSession for all requests in this test.
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest.fixture
async def async_client_seeded(app, seeded_db):
    """AsyncClient with seeded DB, reusing the seeded session."""
    from src.api.dependencies import get_db

    async def override_get_db():
        yield seeded_db

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest.fixture
def mock_llm_client():
    """Configurable mock LLM client for unit tests."""
    from tests.mocks.mock_llm_client import MockLLMClient

    return MockLLMClient(
        model_id="mock",
        response_text='{"answer": "Test response.", "resource_ids": []}',
        input_tokens=10,
        output_tokens=5,
    )
