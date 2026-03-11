from collections.abc import AsyncGenerator

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from src.db.session import async_session_factory, get_db as _get_db
from src.core.strategy_registry import get_strategy_class
from src.llm.client_factory import create_llm_client
from src.llm.provider import create_llm


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async for session in _get_db():
        yield session


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    """Expose async_session_factory for components that manage their own sessions (e.g., BenchmarkRunner)."""
    return async_session_factory


def resolve_strategy(
    name: str,
    db: AsyncSession,
    model_id: str,
):
    """
    Resolve strategy instance. For langgraph: uses create_llm and LanggraphStrategy(db, llm).
    For others: uses create_llm_client and strategy_cls(db, llm_client).
    """
    try:
        strategy_cls = get_strategy_class(name)
        if name == "langgraph":
            llm = create_llm(model_id)
            return strategy_cls(db=db, llm=llm)
        llm_client = create_llm_client(model_id)
        return strategy_cls(db=db, llm_client=llm_client)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
