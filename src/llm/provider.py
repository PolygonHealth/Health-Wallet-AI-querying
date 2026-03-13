"""LLM provider factory. Single place to swap models across the app."""

from collections.abc import Callable

from langchain_core.language_models.chat_models import BaseChatModel

from src.config.settings import settings

# Test override: model_id -> factory. Used for langgraph-mock in integration tests.
_LLM_OVERRIDES: dict[str, Callable[[], BaseChatModel]] = {}


def register_llm_override(model_id: str, factory: Callable[[], BaseChatModel]) -> None:
    """Register a factory for a model ID. Used by tests (e.g. langgraph-mock)."""
    _LLM_OVERRIDES[model_id] = factory


# Cache: model_id -> BaseChatModel
_llm_cache: dict[str, BaseChatModel] = {}

def create_llm(
    model_id: str | None = None,
    temperature: float = 0.0,
    max_output_tokens: int = 8192,
) -> BaseChatModel:
    """
    Return a LangChain chat model for the given model ID.
    Provider is inferred from the model name prefix.
    All models share the same BaseChatModel interface:
      llm.ainvoke(), llm.bind_tools(), llm.with_structured_output()
    """
    model_id = model_id or settings.DEFAULT_MODEL

    if model_id in _LLM_OVERRIDES:
        return _LLM_OVERRIDES[model_id]()

    cache_key = model_id
    if cache_key not in _llm_cache:
        if model_id.startswith("gemini"):
            from langchain_google_genai import ChatGoogleGenerativeAI

            _llm_cache[cache_key] = ChatGoogleGenerativeAI(
                model=model_id,
                google_api_key=settings.GEMINI_API_KEY,
                temperature=temperature,
                max_output_tokens=max_output_tokens,
            )
        else:
            raise ValueError(f"Unknown model prefix: {model_id}")
    
    return _llm_cache[cache_key]