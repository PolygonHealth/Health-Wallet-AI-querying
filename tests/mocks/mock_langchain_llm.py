"""Mock BaseChatModel for LangGraph strategy tests. Returns scripted AIMessages and ClassifyResult."""

from unittest.mock import AsyncMock, MagicMock

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from langchain_core.tools import BaseTool



class MockLangChainLLM(BaseChatModel):
    """Mock BaseChatModel that returns scripted responses for classify and llm_node."""

    model: str = "langgraph-mock"
    _llm_responses: list[AIMessage]

    def __init__(
        self,
        *,
        llm_responses: list[AIMessage] | None = None,
        **kwargs,
    ) -> None:
        super().__init__(**kwargs)
        self._llm_responses = llm_responses or [
            # Integration tests: full tool loop (get_patient_overview -> get_resources_by_type -> final)
            AIMessage(content="", tool_calls=[{"id": "1", "name": "get_patient_overview", "args": {}}]),
            AIMessage(
                content="",
                tool_calls=[{"id": "2", "name": "get_resources_by_type", "args": {"resource_type": "Condition"}}],
            ),
            AIMessage(content="Based on the data, the patient has hypertension.", tool_calls=[]),
        ]

    def with_structured_output(self, schema, **kwargs):
        """Return runnable that ainvoke returns ClassifyResult."""
        runnable = MagicMock()
        runnable.ainvoke = AsyncMock(return_value=AIMessage(content="", tool_calls=[]))
        return runnable

    def bind_tools(self, tools: list[BaseTool] | list[dict], **kwargs):
        """Return runnable that ainvoke returns next scripted AIMessage."""
        responses = self._llm_responses

        async def ainvoke(messages, **kw):
            if responses:
                return responses.pop(0)
            return AIMessage(content="I could not generate an answer.", tool_calls=[])

        runnable = MagicMock()
        runnable.ainvoke = AsyncMock(side_effect=ainvoke)
        return runnable

    def _generate(self, messages, stop=None, run_manager=None, **kwargs) -> ChatResult:
        raise NotImplementedError("Use ainvoke on bound runnables")

    @property
    def _llm_type(self) -> str:
        return "mock_langchain"
