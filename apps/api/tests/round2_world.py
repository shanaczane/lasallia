# A made-up library for the round 2 report tests: the round 1 world plus
# guest loans, reservations with every status, copies added in every way,
# kiosk and desk sessions, and assistant usage. Personal details listed
# below must never reach an export's AI data, and emails / ID numbers /
# internal ids never reach any export.

from tests.test_circulation_in_house import GUEST_ID, _in_house
from tests.test_report_definitions import EMAILS, ID_NUMBERS, INTERNAL_IDS, NAMES, _at, world

FORMULA_TITLE = "=HYPERLINK(1)"
SESSION_KEYS = ["chat-key-1", "chat-key-2", "chat-key-3", "chat-key-4"]
PRIVATE = EMAILS + ID_NUMBERS + INTERNAL_IDS + [GUEST_ID, "student-uuid-9"] + SESSION_KEYS
GUESTS = ["Pedro Visitor", "Rico Guest"]


def _reservation(i, status, *, requested, book_id="book-1", title="Clean code", category="BSIT", **extra):
    return {
        "id": f"res-{i}", "user_id": "student-uuid-1" if i % 2 else "student-uuid-2", "book_id": book_id,
        "status": status, "requested_at": requested, "pickup_by": None, "fulfilled_at": None,
        "cancelled_at": None, "book_copy_id": None, "notes": "private reservation note",
        "books": {"id": book_id, "title": title, "author": "Robert C. Martin", "category": category},
        "profiles": ({"full_name": "Juan Dela Cruz", "email": EMAILS[0], "id_number": ID_NUMBERS[0],
                      "program": "BSIT", "college": "CITE", "year_level": 2} if i % 2 else
                     {"full_name": "Maria Santos", "email": EMAILS[1], "id_number": ID_NUMBERS[1],
                      "program": "BSA", "college": "CBEAM", "year_level": 3}),
        **extra,
    }


def _session(i, started, station="kiosk-1", student="student-uuid-1"):
    profile = ({"program": "BSIT", "college": "CITE", "year_level": 2} if student == "student-uuid-1"
               else {"program": "BSA", "college": "CBEAM", "year_level": 3})
    return {"id": f"station-{i}", "student_id": student, "auth_method": "rfid", "station_id": station,
            "started_at": started, "ended_at": None, "profiles": profile}


def _usage(i, when, surface, user_type, answered_by, key):
    return {"id": f"usage-{i:05d}", "occurred_at": when, "surface": surface, "user_type": user_type,
            "answered_by": answered_by, "session_key": key}


def round2_world():
    db = world()
    t = db.tables
    # Each loan's book follows its copy: copies 1 and 2 are Clean code
    # (book-1), copy 3 is Old accounting (book-2).
    for loan, book_id, title in zip(t["loans"], ["book-1", "book-1", "book-2", "book-2"],
                                    ["Clean code", "Clean code", "Old accounting", "Old accounting"]):
        loan["book_copies"]["book_id"] = book_id
        loan["book_copies"]["books"].update(id=book_id, title=title, call_number="005.1 M379 2008")
    t["in_house_loans"] = [
        _in_house(1, guest=GUESTS[0], visitor_type="non_nocei", checked_out_at=_at("2026-11-03", 1),
                  returned_at=_at("2026-11-03", 6)),
        _in_house(3, guest=GUESTS[1], visitor_type="nocei", checked_out_at=_at("2026-11-12"),
                  book_id="book-2", title="Old accounting", category="BSA"),
    ]
    t["books"][1]["edition"] = "2nd ed."
    t["books"][0].update(date_acquired="2010-02-14", funding_source="purchased", edition=None)
    t["books"].append({"id": "book-3", "title": FORMULA_TITLE, "author": "=cmd", "category": "BSIT", "subject": "CITE",
                       "call_number": "005 F1", "published_year": 2020, "archived_at": _at("2026-06-01"),
                       "date_acquired": None, "funding_source": "donated", "created_at": _at("2020-01-01")})
    t["book_copies"][0].update(origin="assigned", created_at=_at("2026-09-01"))
    t["book_copies"][1].update(origin="imported", created_at=_at("2025-01-15"))
    t["book_copies"][2].update(origin=None, created_at=_at("2024-06-30"))
    t["book_copies"] += [
        {"id": "copy-uuid-4", "book_id": "book-3", "accession_number": "GS10", "status": "available",
         "origin": "registered", "created_at": _at("2026-10-01")},
        {"id": "copy-uuid-5", "book_id": "book-3", "accession_number": "GS9", "status": "for_reshelving",
         "origin": "registered", "created_at": _at("2026-10-01")},
    ]
    t["accession_corrections"] = [{"id": "fix-1", "book_copy_id": "copy-uuid-4", "old_value": "GS0010",
                                   "new_value": "GS10", "reason": "private reason", "corrected_by": "staff-uuid-1",
                                   "corrected_at": _at("2026-10-02")}]
    t["reservations"] = [
        _reservation(1, "pending", requested=_at("2026-11-02")),
        _reservation(2, "ready", requested=_at("2026-11-03"), pickup_by=_at("2026-11-20")),
        _reservation(3, "fulfilled", requested=_at("2026-11-04"), fulfilled_at=_at("2026-11-06")),
        _reservation(4, "cancelled", requested=_at("2026-11-05"), cancelled_at=_at("2026-11-05", 8)),
        _reservation(5, "expired", requested=_at("2026-11-06"), pickup_by=_at("2026-11-09"),
                     book_id="book-3", title=FORMULA_TITLE),
        _reservation(6, "pending", requested=_at("2026-10-20")),  # before the period
    ]
    t["station_sessions"] = [
        _session(1, "2026-11-03T01:10:00+00:00"),                          # 9:10 AM Manila
        _session(2, "2026-11-03T01:40:00+00:00", student="student-uuid-2"),
        _session(3, "2026-11-03T05:05:00+00:00"),                          # 1:05 PM
        _session(4, "2026-11-01T16:30:00+00:00"),                          # 12:30 AM on 2 November in Manila
        _session(5, "2026-11-03T02:00:00+00:00", station="librarian-desk"),  # desk: not counted
        _session(6, "2026-11-03T02:00:00+00:00", station="web-portal"),      # phone: not counted
        _session(7, "2026-10-31T15:59:00+00:00"),                          # 31 October 11:59 PM Manila: before
    ]
    t["assistant_usage"] = [
        # Live rows first (the fake ignores .order()), earliest live one first.
        _usage(1, "2026-11-04T01:00:00+00:00", "web", "student", "ai", SESSION_KEYS[0]),
        _usage(2, "2026-11-04T01:05:00+00:00", "web", "student", "rule", SESSION_KEYS[0]),
        _usage(3, "2026-11-04T03:00:00+00:00", "kiosk", "guest", "rule", SESSION_KEYS[1]),
        _usage(4, "2026-11-05T03:00:00+00:00", "web", "staff", "ai", SESSION_KEYS[2]),
        _usage(5, "2026-11-05T03:10:00+00:00", "web", "faculty", "ai", SESSION_KEYS[3]),
        # Backfilled (answer type not recorded).
        _usage(6, "2026-11-02T02:00:00+00:00", "web", "student", None, SESSION_KEYS[3]),
    ]
    return db


__all__ = ["round2_world", "FORMULA_TITLE", "PRIVATE", "NAMES", "GUESTS", "SESSION_KEYS", "_at", "_usage",
           "_session", "_reservation"]
