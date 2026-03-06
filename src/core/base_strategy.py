import logging
from abc import ABC, abstractmethod

from sqlalchemy.ext.asyncio import AsyncSession

from src.llm.base_client import BaseLLMClient
from src.core.models import QueryContext, QueryResult


class BaseStrategy(ABC):
    def __init__(self, db: AsyncSession, llm_client: BaseLLMClient) -> None:
        self.db = db
        self.llm_client = llm_client
        self.logger = logging.getLogger(type(self).__name__)

    @abstractmethod
    async def execute(self, context: QueryContext) -> QueryResult: ...

    @property
    @abstractmethod
    def name(self) -> str: ...
