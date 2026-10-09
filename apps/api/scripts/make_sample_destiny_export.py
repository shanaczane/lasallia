# apps/api/scripts/make_sample_destiny_export.py
# Builds stand-in Follett Destiny MARC 21 exports from the LRC's own
# per-college Excel files, so the Destiny import (routers/sync.py) can be
# developed and demonstrated before the library provides a real export.
#
# Writes to data/sample_destiny/:
#   catalog.mrc          the LRC catalog as Destiny would export it — one
#                        record per title, one 852 per physical copy
#   catalog_changed.mrc  the same export after some typical catalog work
#                        in Destiny (listed in CHANGES.txt), for showing
#                        what a second import picks up
#
# No database access — only reads data/*.xlsx.
#
# Usage: venv/Scripts/python.exe scripts/make_sample_destiny_export.py

import copy
import re
import sys
from pathlib import Path

from pymarc import Field, Indicators, MARCWriter, Record, Subfield

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # so `core.*` resolves

from core.accession import normalize_accession_number
from excel_source import read_records

# Same filename -> college code mapping as seed_books.SOURCE_FILES (not
# imported from there: that module pulls in core.supabase, which needs the
# Supabase env vars this offline script has no use for).
SOURCE_FILES = {
    "CITE.xlsx": "CITE",
    "CBEAM.xlsx": "CBEAM",
    "CEAS.xlsx": "CEAS",
    "CITHM.xlsx": "CITHM",
    "CON_Nursing.xlsx": "CON",
    "GEN-AD.xlsx": "GEN-AD",
    "GRADUATE SCHOOL.xlsx": "GRADUATE SCHOOL",
}

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
OUT_DIR = DATA_DIR / "sample_destiny"


def _ws(value) -> str | None:
    if value is None:
        return None
    cleaned = re.sub(r"\s+", " ", str(value)).strip()
    return cleaned or None


def _sub(code: str, value) -> list[Subfield]:
    return [Subfield(code, value)] if value else []


def _holding(barcode: str, call_number: str | None, college: str, program: str) -> Field:
    return Field(
        tag="852",
        indicators=Indicators(" ", " "),
        subfields=_sub("b", college) + _sub("c", program) + _sub("h", call_number) + [Subfield("p", barcode)],
    )


def build_record(control_no: str, title_row: dict, copies: list[dict]) -> Record:
    record = Record(force_utf8=True)
    record.add_field(Field(tag="001", data=control_no))
    if title_row["isbn"]:
        record.add_field(Field(tag="020", indicators=Indicators(" ", " "), subfields=[Subfield("a", title_row["isbn"])]))
    if title_row["author"]:
        record.add_field(Field(tag="100", indicators=Indicators("1", " "), subfields=[Subfield("a", title_row["author"])]))
    record.add_field(Field(
        tag="245",
        indicators=Indicators("1" if title_row["author"] else "0", "0"),
        subfields=[Subfield("a", title_row["title"])],
    ))

    place, _, publisher = (title_row["place"] or "").partition(":")
    pub_subfields = _sub("a", _ws(place) if publisher else None) + _sub("b", _ws(publisher or place)) + _sub("c", title_row["year"])
    if pub_subfields:
        record.add_field(Field(tag="264", indicators=Indicators(" ", "1"), subfields=pub_subfields))
    if title_row["description"]:
        record.add_field(Field(tag="520", indicators=Indicators(" ", " "), subfields=[Subfield("a", title_row["description"])]))

    for c in copies:
        record.add_field(_holding(c["barcode"], title_row["call_number"], c["college"], c["program"]))
    return record


def load_titles() -> list[tuple[dict, list[dict]]]:
    """Groups the Excel rows (one per physical copy) into titles, the way
    Destiny holds them: one bibliographic record with several copies."""
    titles: dict[tuple, tuple[dict, list[dict]]] = {}
    seen_barcodes: set[str] = set()

    for fname, college in SOURCE_FILES.items():
        path = DATA_DIR / fname
        if not path.exists():
            print(f"SKIP: {fname} not found in {DATA_DIR}")
            continue
        for r in read_records(path):
            barcode = normalize_accession_number(_ws(r["Book ID (Accession No.)"]) or "")
            title = _ws(r["Title"])
            if not barcode or not title or barcode in seen_barcodes:
                continue
            seen_barcodes.add(barcode)

            year = r["Year"]
            title_row = {
                "title": title,
                "author": _ws(r["Author(s) Full Name"]) or _ws(r["Author(s)"]),
                "isbn": _ws(r["ISBN"]),
                "call_number": _ws(r["Call No."]),
                "place": _ws(r["Place of Publication"]),
                "year": str(int(year)) if isinstance(year, (int, float)) else _ws(year),
                "description": _ws(r["Description"]),
            }
            key = (title.lower(), (title_row["author"] or "").lower(), title_row["isbn"] or "")
            entry = titles.setdefault(key, (title_row, []))
            entry[1].append({"barcode": barcode, "college": college, "program": r["program"]})

    return list(titles.values())


def write_mrc(path: Path, records: list[Record]) -> None:
    with open(path, "wb") as fh:
        writer = MARCWriter(fh)
        for record in records:
            writer.write(record)


def main() -> None:
    titles = load_titles()
    if not titles:
        print("No Excel rows found — nothing to export.")
        return

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    base = [build_record(f"LAS{n:06d}", t, copies) for n, (t, copies) in enumerate(titles, start=1)]
    write_mrc(OUT_DIR / "catalog.mrc", base)
    print(f"catalog.mrc: {len(base)} titles, {sum(len(c) for _, c in titles)} copies")

    # ── catalog_changed.mrc: the same export after some work in Destiny ──
    changed_titles = [(dict(t), [dict(c) for c in copies]) for t, copies in titles]
    notes = []

    t0 = changed_titles[0][0]
    t0["title"] = f"{t0['title']} (Revised edition)"
    notes.append(f"Title edited: record 1 is now {t0['title']!r}")

    t1 = changed_titles[1][0]
    t1["call_number"] = f"{t1['call_number'] or ''} c.2".strip()
    notes.append(f"Call number edited: record 2 is now {t1['call_number']!r}")

    copies2 = changed_titles[2][1]
    copies2.append({**copies2[0], "barcode": "T9990001"})
    notes.append(f"New copy T9990001 added to record 3 ({changed_titles[2][0]['title']!r})")

    multi = next((i for i, (_, c) in enumerate(changed_titles) if len(c) > 1 and i > 2), None)
    if multi is not None:
        dropped = changed_titles[multi][1].pop()
        notes.append(f"Copy {dropped['barcode']} left out of record {multi + 1} (reported as not in export, never deleted)")

    college, program = titles[0][1][0]["college"], titles[0][1][0]["program"]
    new_books = [
        ({"title": "Sample Destiny title: Introduction to Library Systems", "author": "Dela Cruz, Juan",
          "isbn": "9780000000011", "call_number": "025.04 D37 2026", "place": "Manila : Sample Press",
          "year": "2026", "description": "Placeholder record added to show a brand-new title arriving from Destiny."},
         [{"barcode": "T9990002", "college": college, "program": program},
          {"barcode": "T9990003", "college": college, "program": program}]),
        ({"title": "Sample Destiny title: Cataloging Basics", "author": "Santos, Maria",
          "isbn": "9780000000028", "call_number": "025.3 S26 2026", "place": "Manila : Sample Press",
          "year": "2026", "description": "Second placeholder title, one copy."},
         [{"barcode": "T9990004", "college": college, "program": program}]),
    ]
    changed_titles.extend(new_books)
    notes.append("New titles added: 2 (copies T9990002, T9990003, T9990004)")

    changed = [build_record(f"LAS{n:06d}", t, c) for n, (t, c) in enumerate(changed_titles, start=1)]

    broken = build_record("LAS999999", {**new_books[1][0], "isbn": None}, [{"barcode": "T9990005", "college": college, "program": program}])
    broken.remove_fields("245")
    changed.append(broken)
    notes.append("Broken record added: no title (245), copy T9990005, reported as an error")

    write_mrc(OUT_DIR / "catalog_changed.mrc", changed)
    (OUT_DIR / "CHANGES.txt").write_text(
        "catalog_changed.mrc differs from catalog.mrc as follows:\n\n" + "\n".join(f"- {n}" for n in notes) + "\n",
        encoding="utf-8",
    )
    print(f"catalog_changed.mrc: {len(changed)} records")
    for n in notes:
        print(f"  - {n}")


if __name__ == "__main__":
    main()
