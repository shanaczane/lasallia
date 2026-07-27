# apps/api/scripts/preview_excel.py
# One-off helper: dumps every sheet of a raw book-data Excel file into a
# single readable CSV (only real rows, only the columns that matter) so it
# can be reviewed in a plain text editor instead of the binary .xlsx.
#
# Usage: venv/Scripts/python.exe scripts/preview_excel.py data/CITE.xlsx

import csv
import sys
from pathlib import Path

from excel_source import COLUMNS, read_records

def main(xlsx_path: str) -> None:
    src = Path(xlsx_path)
    out = Path("data/preview") / f"{src.stem}_preview.csv"
    records = read_records(src)

    with out.open("w", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f)
        writer.writerow(["program", *COLUMNS])
        for r in records:
            writer.writerow([r["program"]] + [r[c] if r[c] is not None else "" for c in COLUMNS])

    print(f"Wrote {out} ({len(records)} books)")

if __name__ == "__main__":
    main(sys.argv[1])
