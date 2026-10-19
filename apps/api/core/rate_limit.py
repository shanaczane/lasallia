# Simple in-memory rate limiter. Resets on restart and isn't shared between
# server instances, which is fine while we run a single instance.

import time

_windows: dict[str, list[float]] = {}


def check_and_record(key: str, max_requests: int, window_seconds: int) -> bool:
    """True if this call is allowed for `key`, and records it. Old
    timestamps are dropped on each call."""
    now = time.monotonic()
    cutoff = now - window_seconds
    timestamps = [t for t in _windows.get(key, []) if t > cutoff]

    if len(timestamps) >= max_requests:
        _windows[key] = timestamps
        return False

    timestamps.append(now)
    _windows[key] = timestamps
    return True
