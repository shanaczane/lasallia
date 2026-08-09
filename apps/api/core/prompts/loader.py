"""Chatbot Phase 2+ — loads a versioned system prompt from a plain file.

System prompts are never a Python string literal: a prompt file can be
diffed, reviewed, and versioned on its own, without touching code that
imports it. When the prompt changes meaningfully, add system_v2.md
alongside system_v1.md rather than editing it in place — old versions
stay around for reproducing past behavior.
"""

from pathlib import Path

ACTIVE_VERSION = "v1"
PROMPTS_DIR = Path(__file__).parent


def load_system_prompt(version: str = ACTIVE_VERSION) -> str:
    """Reads core/prompts/system_{version}.md and returns its contents."""
    raise NotImplementedError
