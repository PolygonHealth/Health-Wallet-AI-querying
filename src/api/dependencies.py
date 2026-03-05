from collections.abc import AsyncGenerator

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.session import get_db as _get_db
from src.core.strategy_registry import get_strategy_class
from src.core.base_strategy import BaseStrategy
from src.llm.base_client import BaseLLMClient


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async for session in _get_db():
        yield session


def resolve_strategy(
    name: str,
    db: AsyncSession,
    llm_client: BaseLLMClient,
) -> BaseStrategy:
    try:
        strategy_cls = get_strategy_class(name)
        return strategy_cls(db=db, llm_client=llm_client)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
