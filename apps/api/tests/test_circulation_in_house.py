# Circulation with guest (in-house) loans: their own rows and key figures,
# figures that add up to Transactions, the busiest day in transactions, and
# never the guest's ID number. Builds on the round 1 made-up library.

import io
import json
import re
import zipfile

import openpyxl
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pypdf import PdfReader

import core.reports as reports
import routers.inhouse as inhouse_router
from core.deps import require_librarian
from core.report_export.csv_file import build_csv
from core.report_export.definitions import TRANSACTION_RULE, ExportFilters, ai_input
from core.report_export.excel import build_excel
from core.report_export.pdf import build_pdf
from tests.fake_supabase import FakeSupabase
from tests.report_export_fixtures import predictable_fines  # noqa: F401  (autouse fixture)
from tests.test_report_definitions import LIBRARIAN, NOVEMBER, _at, _build, _options, world
from tests.librarian_auth import allow_librarian

GUEST_ID = "GUEST-ID-7781"


def _in_house(i, *, guest, visitor_type, checked_out_at, returned_at=None, book_id="book-1", title="Clean code",
              category="BSIT"):
    return {
        "id": f"inhouse-{i}", "book_copy_id": "copy-uuid-2", "librarian_id": "staff-uuid-1",
        "guest_name": guest, "guest_id_number": GUEST_ID, "visitor_type": visitor_type,
        "fee_paid": visitor_type == "non_nocei", "receipt_number": "OR-9" if visitor_type == "non_nocei" else None,
        "purpose": "library_use", "checked_out_at": checked_out_at, "returned_at": returned_at,
        "status": "returned" if returned_at else "active", "notes": "private note",
        "book_copies": {"book_id": book_id, "books": {"id": book_id, "title": title, "author": "Robert C. Martin",
                                                       "category": category, "subject": "CITE", "call_number": "005.1"}},
    }


def with_guests() -> FakeSupabase:
    db = world()
    db.tables["in_house_loans"] = [
        # Checked out and returned on 3 November: two transactions that day.
        _in_house(1, guest="Pedro Visitor", visitor_type="non_nocei", checked_out_at=_at("2026-11-03", 1),
                  returned_at=_at("2026-11-03", 6)),
        # Checked out in October, returned in November: a return only.
        _in_house(2, guest="Lena Alumni", visitor_type="nocei", checked_out_at=_at("2026-10-30"),
                  returned_at=_at("2026-11-02")),
        # Still out, an accounting book.
        _in_house(3, guest="Rico Guest", visitor_type="nocei", checked_out_at=_at("2026-11-12"),
                  book_id="book-2", title="Old accounting", category="BSA"),
    ]
    return db


def _figures(data):
    return {f.label: f.number for f in data.key_figures if f.number is not None}


def test_in_house_loans_get_their_own_rows_on_their_own_dates():
    data = _build("circulation", db=with_guests())
    guest_rows = [(r["type"], r["borrower"], r["program"], r["date"]) for r in data.rows if r["type"].startswith("In-house")]
    assert guest_rows == [
        ("In-house return", "Lena Alumni", "Guest (NOCEI)", "2026-11-02"),
        ("In-house checkout", "Pedro Visitor", "Guest (visitor)", "2026-11-03"),
        ("In-house return", "Pedro Visitor", "Guest (visitor)", "2026-11-03"),
        ("In-house checkout", "Rico Guest", "Guest (NOCEI)", "2026-11-12"),
    ]
    assert all(r["due_date"] == "" and r["year"] == "—" for r in data.rows if r["type"].startswith("In-house"))


def test_figures_add_up_to_transactions():
    data = _build("circulation", db=with_guests())
    f = _figures(data)
    assert (f["Borrows"], f["Returns"], f["In-house checkouts"], f["In-house returns"]) == (2, 1, 2, 2)
    assert f["Borrows"] + f["Returns"] + f["In-house checkouts"] + f["In-house returns"] == f["Transactions"] == len(data.rows)
    # Juan borrowed and Maria returned; guests aren't counted as borrowers,
    # but their titles are.
    assert f["Student borrowers"] == 2 and f["Titles"] == 3
    assert [name for name, _ in data.chart.series] == ["Borrows", "Returns", "In-house checkouts"]
    assert sum(data.chart.series[2][1]) == 2
    assert TRANSACTION_RULE in data.filters


def test_busiest_day_counts_transactions():
    data = _build("circulation", db=with_guests())
    busiest = {f.label: f.value for f in data.key_figures}["Busiest day"]
    # 3 November: a borrow, plus Pedro's checkout and return.
    assert busiest == "November 3, 2026 (3 transactions)"
    assert f"The busiest day was {busiest}." in data.computed_summary
    assert ai_input(data)["busiest_day"] == {"date": "2026-11-03", "transactions_that_day": 3}
    one = world()
    one.tables["loans"] = one.tables["loans"][:1]
    single = _build("circulation", db=one)
    assert {f.label: f.value for f in single.key_figures}["Busiest day"].endswith("(1 transaction)")


@pytest.mark.parametrize("filters", [
    ExportFilters(date_from=NOVEMBER.date_from, date_to=NOVEMBER.date_to, college="CITE"),
    ExportFilters(date_from=NOVEMBER.date_from, date_to=NOVEMBER.date_to, year_level=2),
    ExportFilters(date_from=NOVEMBER.date_from, date_to=NOVEMBER.date_to, program="BSIT"),
])
def test_borrower_filters_leave_guests_out_and_say_so(filters):
    data = _build("circulation", filters, db=with_guests())
    assert not any(r["type"].startswith("In-house") for r in data.rows)
    assert any("In-house (guest) loans are left out" in line for line in data.filters)


def test_category_filter_applies_to_guest_books():
    filters = ExportFilters(date_from=NOVEMBER.date_from, date_to=NOVEMBER.date_to, category="BSA")
    data = _build("circulation", filters, db=with_guests())
    assert [r["borrower"] for r in data.rows if r["type"].startswith("In-house")] == ["Rico Guest"]
    assert not any("left out" in line for line in data.filters)


def test_no_guest_id_number_or_note_anywhere():
    data = _build("circulation", db=with_guests())
    pdf = " ".join(p.extract_text() for p in PdfReader(io.BytesIO(build_pdf(data, _options(data)))).pages)
    wb = openpyxl.load_workbook(io.BytesIO(build_excel(data, _options(data))))
    excel = json.dumps([c.value for ws in wb.worksheets for row in ws.iter_rows() for c in row], default=str)
    everything = pdf + excel + build_csv(data).decode("utf-8-sig") + json.dumps(data.rows) + json.dumps(ai_input(data))
    for private in (GUEST_ID, "private note", "OR-9", "staff-uuid-1"):
        assert private not in everything
    # The AI gets totals only, no guest names either.
    for name in ("Pedro Visitor", "Lena Alumni", "Rico Guest"):
        assert name not in json.dumps(ai_input(data)) and name in excel


def test_report_query_never_selects_the_guest_id_number():
    assert "guest_id_number" not in reports.IN_HOUSE_COLUMNS and "librarian_id" not in reports.IN_HOUSE_COLUMNS


def test_empty_period_says_so():
    data = _build("circulation", ExportFilters(date_from=NOVEMBER.date_from.replace(year=2020),
                                               date_to=NOVEMBER.date_to.replace(year=2020)), db=with_guests())
    assert not data.rows and data.chart is None
    assert data.computed_summary == data.empty_message


def test_in_house_list_reads_past_1000_rows(monkeypatch):
    rows = []
    for i in range(1005):
        row = _in_house(i, guest="Guest", visitor_type="nocei", checked_out_at=_at("2026-11-01"))
        row["book_copies"] = {"accession_number": f"T{i}", "books": None}
        rows.append(row)
    db = FakeSupabase(in_house_loans=rows)
    monkeypatch.setattr(inhouse_router, "get_admin_client", lambda: db)
    app = FastAPI()
    app.include_router(inhouse_router.router)
    allow_librarian(app, LIBRARIAN)
    res = TestClient(app).get("/in-house-loans")
    assert res.status_code == 200, res.text
    assert len(res.json()) == 1005


def test_each_chart_series_has_its_own_colour():
    data = _build("circulation", db=with_guests())
    with zipfile.ZipFile(io.BytesIO(build_excel(data, _options(data)))) as z:
        xml = z.read([n for n in z.namelist() if n.startswith("xl/charts/chart")][0]).decode()
    fills = re.findall(r"<(?:a:)?solidFill><(?:a:)?srgbClr val=\"([0-9A-Fa-f]{6})\"", xml)
    assert len(set(fills[:3])) == 3, fills
