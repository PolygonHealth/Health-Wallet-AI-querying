from src.core.base_strategy import BaseStrategy

_REGISTRY: dict[str, type[BaseStrategy]] = {}


def register_strategy(name: str):
    def decorator(cls: type[BaseStrategy]) -> type[BaseStrategy]:
        _REGISTRY[name] = cls
        return cls

    return decorator


def get_strategy_class(name: str) -> type[BaseStrategy]:
    if name not in _REGISTRY:
        raise ValueError(
            f"Unknown strategy '{name}'. Available: {list(_REGISTRY.keys())}"
        )
    return _REGISTRY[name]


def list_strategies() -> list[str]:
    return list(_REGISTRY.keys())
