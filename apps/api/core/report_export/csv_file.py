# CSV exporter: the table only, so it opens and imports cleanly anywhere.
# Row 1 is the column names; there are no title or period rows (the period
# is in the file name). UTF-8 with a byte-order mark, so Excel shows "ñ" and
# "₱" correctly.

import csv
import io

from core.report_export.cells import csv_text
from core.report_export.definitions import ReportData


def _value(value, kind: str):
    if value is None:
        return ""
    if kind == "money":
        return f"{float(value):.2f}"
    if kind in ("int", "plain"):
        return str(int(value))
    return csv_text(str(value))  # text and dates


def build_csv(data: ReportData, table: str = "main") -> bytes:
    """The report's table, or with table="details" its detail table
    (Inventory's copies) when it has one."""
    columns, rows = data.columns, data.rows
    if table == "details" and data.details is not None:
        columns, rows = data.details.columns, data.details.rows
    buf = io.StringIO()
    writer = csv.writer(buf, lineterminator="\r\n")
    writer.writerow([csv_text(c.label) for c in columns])
    for row in rows:
        writer.writerow([_value(row.get(c.key), c.kind) for c in columns])
    return buf.getvalue().encode("utf-8-sig")
