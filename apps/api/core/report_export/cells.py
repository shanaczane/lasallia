# Writing text into Excel and CSV files without letting it run as a
# formula. The one implementation every export uses ("Export new books"
# and the report exports).

from openpyxl.cell.cell import ILLEGAL_CHARACTERS_RE

# A cell starting with one of these could run as a formula in Excel or
# another spreadsheet app.
FORMULA_START = ("=", "+", "-", "@", "\t", "\r", "\n")


def looks_like_formula(value: str) -> bool:
    return value.startswith(FORMULA_START)


def put_cell(ws, row: int, column: int, value, number_format: str | None = None):
    """Writes a value into an openpyxl sheet. Text is always stored as text,
    never a formula, and text that starts like a formula is also marked to
    show as typed (quotePrefix). The text itself isn't changed. Returns the
    cell."""
    cell = ws.cell(row=row, column=column)
    if value is None or value == "":
        return cell
    if isinstance(value, str):
        value = ILLEGAL_CHARACTERS_RE.sub("", value)
        cell.value = value
        cell.data_type = "s"
        if looks_like_formula(value):
            cell.quotePrefix = True
    else:
        cell.value = value
    if number_format:
        cell.number_format = number_format
    return cell


def csv_text(value: str) -> str:
    """Text for a CSV cell. CSV has no "this is text" marker, so text that
    starts like a formula gets a leading apostrophe, which spreadsheet apps
    show as typed instead of running it. Only for text columns: numbers are
    written as they are."""
    return f"'{value}" if looks_like_formula(value) else value
