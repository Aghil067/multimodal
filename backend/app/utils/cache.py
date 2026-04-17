"""
Small async TTL cache helpers for expensive external API calls.
"""
from __future__ import annotations

import asyncio
import copy
import time
from collections import OrderedDict
from functools import wraps
from inspect import signature
from typing import Any, Awaitable, Callable


def _freeze(value: Any) -> Any:
    if isinstance(value, dict):
        return tuple(sorted((k, _freeze(v)) for k, v in value.items()))
    if isinstance(value, (list, tuple, set)):
        return tuple(_freeze(item) for item in value)
    return value


def ttl_cache_async(ttl_seconds: int = 60, max_entries: int = 32) -> Callable:
    """
    Cache async function results for a short time to avoid hammering remote APIs.
    """

    def decorator(func: Callable[..., Awaitable[Any]]) -> Callable[..., Awaitable[Any]]:
        cache: OrderedDict[Any, tuple[float, Any]] = OrderedDict()
        locks: dict[Any, asyncio.Lock] = {}
        func_signature = signature(func)

        @wraps(func)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            bound = func_signature.bind_partial(*args, **kwargs)
            bound.apply_defaults()
            key = _freeze(bound.arguments)
            now = time.monotonic()

            cached = cache.get(key)
            if cached and cached[0] > now:
                cache.move_to_end(key)
                return copy.deepcopy(cached[1])

            lock = locks.setdefault(key, asyncio.Lock())
            async with lock:
                now = time.monotonic()
                cached = cache.get(key)
                if cached and cached[0] > now:
                    cache.move_to_end(key)
                    return copy.deepcopy(cached[1])

                result = await func(*args, **kwargs)
                cache[key] = (time.monotonic() + ttl_seconds, copy.deepcopy(result))
                cache.move_to_end(key)

                while len(cache) > max_entries:
                    cache.popitem(last=False)

                return copy.deepcopy(result)

        return wrapper

    return decorator
