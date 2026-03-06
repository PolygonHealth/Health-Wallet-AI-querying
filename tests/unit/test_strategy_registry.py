import src.core  # noqa: F401 - registers strategies

import pytest

from src.core.strategy_registry import get_strategy_class, list_strategies


def test_register_and_retrieve_strategy():
    cls = get_strategy_class("naive_dump")
    assert cls is not None
    assert cls.__name__ == "NaiveDumpStrategy"


def test_unknown_strategy_raises_with_available_list():
    with pytest.raises(ValueError) as exc_info:
        get_strategy_class("unknown_strategy")
    assert "Unknown strategy" in str(exc_info.value)
    assert "naive_dump" in str(exc_info.value)


def test_list_strategies_returns_all_registered():
    names = list_strategies()
    assert "naive_dump" in names
    assert "agentic" in names
    assert isinstance(names, list)
