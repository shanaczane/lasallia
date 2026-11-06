# Made-up overdue loans for the report export tests, in the shape
# core/reports._fetch_filtered_loans reads (book and borrower embedded).

from datetime import datetime, timedelta, timezone

import pytest

import core.reports as reports


def fake_fine(_db, due_iso, _collection):
    """Predictable fines: ₱5 a day, at most ₱100 (the real rule needs the
    library calendar)."""
    days = max((datetime.now(timezone.utc) - datetime.fromisoformat(due_iso)).days, 0)
    return days, float(min(days * 5, 100))


@pytest.fixture(autouse=True)
def predictable_fines(monkeypatch):
    monkeypatch.setattr(reports, "compute_fine", fake_fine)


def loan(i: int, *, days_late: int = 5, borrowed_at: str | None = None, student: str | None = None,
         name: str = "Juan Dela Cruz", email: str = "juan.delacruz@dlsl.edu.ph", id_number: str = "2021-00001",
         program: str = "BSIT", year_level: int = 2, title: str = "Clean code", accession: str = "T45000",
         status: str = "active") -> dict:
    now = datetime.now(timezone.utc)
    return {
        "id": f"loan-{i}",
        "student_id": student or f"student-{i}",
        "status": status,
        "borrowed_at": borrowed_at or (now - timedelta(days=days_late + 7)).isoformat(),
        "due_date": (now - timedelta(days=days_late)).isoformat(),
        "book_copies": {"book_id": f"book-{i}", "accession_number": accession, "books": {
            "title": title, "author": "Robert C. Martin", "category": "General", "collection_type": "General",
        }},
        "profiles": {
            "full_name": name, "email": email, "id_number": id_number,
            "program": program, "college": "CITE", "year_level": year_level,
        },
    }
