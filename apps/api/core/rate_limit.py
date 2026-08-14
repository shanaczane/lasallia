# apps/api/core/rate_limit.py
# Recommendations plan, Phase 9 — a small in-memory sliding-window
# limiter, no new dependency (no Redis/slowapi anywhere in this
# codebase). Resets on process restart and isn't shared across multiple
# workers/instances — fine for this project's single-instance
# deployment, same scale of assumption this codebase already makes
# elsewhere (jobs/rebuild_recommendations.py is run by hand, not on a
# real scheduler).

import time

_windows: dict[str, list[float]] = {}


def check_and_record(key: str, max_requests: int, window_seconds: int) -> bool:
    """True if this call is allowed under `key`'s current window; also
    records it as having happened. Prunes timestamps older than the
    window lazily on each call rather than a background sweep."""
    now = time.monotonic()
    cutoff = now - window_seconds
    timestamps = [t for t in _windows.get(key, []) if t > cutoff]

    if len(timestamps) >= max_requests:
        _windows[key] = timestamps
        return False

    timestamps.append(now)
    _windows[key] = timestamps
    return True
