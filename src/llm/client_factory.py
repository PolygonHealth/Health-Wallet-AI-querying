from collections.abc import Callable

from src.llm.base_client import BaseLLMClient


def _get_gemini_client(model_id: str) -> BaseLLMClient:
    from src.llm.providers.gemini import GeminiClient

    return GeminiClient(model_id=model_id)


# Registry: model_name -> (factory_fn, model_id)
# Add a model: add one line. Add a provider: define factory_fn and register models.
_MODEL_REGISTRY: dict[str, tuple[Callable[[str], BaseLLMClient], str]] = {
    "gemini-3-flash-preview": (_get_gemini_client, "gemini-3-flash-preview"),
}


def create_llm_client(model_name: str) -> BaseLLMClient:
    if model_name not in _MODEL_REGISTRY:
        raise ValueError(
            f"Unknown model '{model_name}'. Available: {list(_MODEL_REGISTRY.keys())}"
        )
    factory, model_id = _MODEL_REGISTRY[model_name]
    return factory(model_id)
