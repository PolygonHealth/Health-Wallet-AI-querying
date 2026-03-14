from collections.abc import AsyncGenerator
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from src.db.session import async_session_factory, get_db as _get_db
from src.core.strategy_registry import get_strategy_class
from src.llm.provider import create_llm


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async for session in _get_db():
        yield session


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    """Expose async_session_factory for components that manage their own sessions (e.g., BenchmarkRunner)."""
    return async_session_factory

# Cache: (strategy_name, model_id) -> strategy instance
_strategy_cache: dict[tuple[str, str], Any] = {}

def resolve_strategy(name: str, session_factory, model_id: str):
    key = (name, model_id)
    if key not in _strategy_cache:
        strategy_cls = get_strategy_class(name)
        llm = create_llm(model_id)
        _strategy_cache[key] = strategy_cls(session_factory=session_factory, llm=llm)
    return _strategy_cache[key]
 