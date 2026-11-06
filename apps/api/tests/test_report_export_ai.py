# What is sent to OpenAI for report summaries: totals and breakdowns only.
# No borrower names, emails, ID numbers or accession numbers.

from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import core.report_summaries as report_summaries
import routers.reports as reports_router
from core.deps import require_librarian
from schemas.auth import UserProfile
from tests.fake_supabase import FakeSupabase
from tests.report_export_fixtures import loan, predictable_fines  # noqa: F401  (autouse fixture)

LIBRARIAN = UserProfile(id="lib-1", email="lib@dlsl.edu.ph", role="librarian", full_name="Test Librarian")

# Personal details in the made-up loans, none of which may reach OpenAI.
NAMES = ("Juan Dela Cruz", "Maria Clara Santos")
EMAILS = ("juan.delacruz@dlsl.edu.ph", "maria.santos@dlsl.edu.ph")
ID_NUMBERS = ("2021-00001", "2022-00002")
ACCESSIONS = ("T45000", "T45001")
STUDENT_IDS = ("student-uuid-1", "student-uuid-2")


class _RecordingOpenAI:
    """Stands in for the OpenAI client and keeps every message sent."""

    def __init__(self, reply="Two loans are overdue."):
        self.sent: list[str] = []
        self.reply = reply
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    def _create(self, model, messages):
        self.sent.extend(m["content"] for m in messages)
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=self.reply))])


@pytest.fixture
def openai(monkeypatch):
    client = _RecordingOpenAI()
    monkeypatch.setattr(report_summaries, "_get_client", lambda: client)
    return client


@pytest.fixture
def client(monkeypatch):
    loans = [
        loan(1, name=NAMES[0], email=EMAILS[0], id_number=ID_NUMBERS[0], accession=ACCESSIONS[0],
             student=STUDENT_IDS[0], program="BSIT", days_late=4),
        loan(2, name=NAMES[1], email=EMAILS[1], id_number=ID_NUMBERS[1], accession=ACCESSIONS[1],
             student=STUDENT_IDS[1], program="BSA", days_late=20),
    ]
    fake = FakeSupabase(loans=loans)
    monkeypatch.setattr(reports_router, "get_admin_client", lambda: fake)
    app = FastAPI()
    app.include_router(reports_router.router)
    app.dependency_overrides[require_librarian] = lambda: LIBRARIAN
    return TestClient(app)


def _assert_private(sent: list[str]):
    text = "\n".join(sent)
    assert text  # something was sent
    for value in NAMES + EMAILS + ID_NUMBERS + ACCESSIONS + STUDENT_IDS + ("loan-1", "loan-2", "Juan", "Maria"):
        assert value not in text, f"{value!r} was sent to OpenAI"


def test_export_ai_summary_sends_only_aggregates(client, openai):
    res = client.post("/reports/export/ai-summary", json={"report": "overdue"})
    assert res.status_code == 200 and res.json() == {"summary": "Two loans are overdue."}
    _assert_private(openai.sent)
    sent = "\n".join(openai.sent)
    assert '"overdue_loans": 2' in sent and '"BSIT": 1' in sent  # the totals it may describe


def test_report_page_summaries_send_only_aggregates(client, openai, monkeypatch):
    # The page's "Generate insights" also sends overdue loans and top
    # patrons; both are aggregated first.
    monkeypatch.setattr(reports_router, "top_patrons", lambda admin, filters: [
        SimpleNamespace(id=STUDENT_IDS[0], name=NAMES[0], program="BSIT", count=5),
        SimpleNamespace(id=STUDENT_IDS[1], name=NAMES[1], program="BSA", count=3),
    ])
    for name in ("catalogue_report", "circulation_summary", "borrowing_trends", "library_stats", "transaction_stats"):
        monkeypatch.setattr(reports_router, name, lambda admin, filters: [])
    res = client.get("/reports/summaries")
    assert res.status_code == 200, res.text
    _assert_private(openai.sent)


def test_without_ai_the_draft_is_null(client, monkeypatch):
    monkeypatch.setattr(report_summaries, "_get_client", lambda: None)
    assert client.post("/reports/export/ai-summary", json={"report": "overdue"}).json() == {"summary": None}


def test_an_ai_failure_is_null_not_an_error(client, monkeypatch):
    def boom(**_):
        raise RuntimeError("rate limited")
    failing = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=boom)))
    monkeypatch.setattr(report_summaries, "_get_client", lambda: failing)
    res = client.post("/reports/export/ai-summary", json={"report": "overdue"})
    assert res.status_code == 200 and res.json() == {"summary": None}
