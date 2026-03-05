import pytest

from src.core.models import QueryContext


def test_frozen_dataclass_immutability():
    ctx = QueryContext(
        patient_id="p1",
        query_text="What are my conditions?",
        strategy_name="naive_dump",
        model_name="mock",
    )
    with pytest.raises(AttributeError):
        ctx.patient_id = "p2"  # type: ignore
    with pytest.raises(AttributeError):
        ctx.query_text = "other"  # type: ignore


def test_default_values_for_max_tokens_and_temperature():
    ctx = QueryContext(
        patient_id="p1",
        query_text="q",
        strategy_name="naive_dump",
        model_name="mock",
    )
    assert ctx.max_tokens == 4096
    assert ctx.temperature == 0.1
