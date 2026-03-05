import pytest

from src.llm.client_factory import create_llm_client
from src.llm.providers.gemini import GeminiClient
from tests.mocks.mock_llm_client import MockLLMClient


def test_known_model_returns_correct_client_type():
    client = create_llm_client("mock")
    assert isinstance(client, MockLLMClient)
    assert client.model_id == "mock"


def test_known_model_gemini_returns_gemini_client():
    client = create_llm_client("gemini-3.0-flash")
    assert isinstance(client, GeminiClient)
    assert client.model_id == "gemini-3.0-flash"


def test_unknown_model_raises_value_error_with_available_list():
    with pytest.raises(ValueError) as exc_info:
        create_llm_client("unknown-model")
    assert "Unknown model" in str(exc_info.value)
    assert "mock" in str(exc_info.value)
