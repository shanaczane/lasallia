# apps/api/evals/run_eval.py
# Chatbot Phase 6 — the full-pipeline evaluation runner.
#
# Loads a versioned query set from evals/queries/, runs each query
# through the real chat endpoint (not a mock), and reports hit-rate and
# answer accuracy broken out by language. The English-vs-Taglish gap
# (plan 6.2) is the number that matters most here — report it
# explicitly, not just an overall average that hides it.
#
# Usage: venv/Scripts/python.exe evals/run_eval.py <query_set.json>

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # so `core.*` resolves


def run_eval(query_set_path: str) -> dict:
    """Runs every query in `query_set_path` through the chat pipeline
    (routers/chat.py) and returns per-language and overall metrics:
    retrieval hit-rate, human-verified answer accuracy, and the
    English-vs-Taglish degradation gap for matched question pairs."""
    raise NotImplementedError


if __name__ == "__main__":
    raise NotImplementedError("Phase 6 — argument parsing and the run_eval() call go here")
