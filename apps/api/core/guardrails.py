"""Chatbot Phase 8 — cross-cutting safety: rate limiting, off-topic
redirect, and delimiting retrieved content from instructions.

The adversarial/hallucination test set itself lives in evals/, not
here — this module is what runs in production; evals/ is what's run
before a deploy to prove this module (and the prompt) actually holds.
"""


def check_rate_limit(session_id: str) -> bool:
    """Returns False if `session_id` has exceeded its allotted requests
    for the current window."""
    raise NotImplementedError


def is_off_topic(message: str) -> bool:
    """Flags a request as outside the chatbot's scope (homework help,
    essay writing, general chit-chat) so the caller can give a
    consistent redirect instead of engaging."""
    raise NotImplementedError


def delimit_retrieved_content(text: str) -> str:
    """Wraps retrieved content (a book description, a policy chunk)
    before it's placed in the prompt, so the model can clearly tell it
    apart from actual instructions — retrieved content is data, never
    something to obey."""
    raise NotImplementedError
