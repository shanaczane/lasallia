# ISBN cleanup and validation. Stored form is digits only, plus an
# uppercase X as the last character of an ISBN-10: "978-0-13-235088-4"
# becomes "9780132350884". Existing values are left as they were typed, so
# every comparison runs both sides through normalize_isbn.

import re

_PREFIX = re.compile(r"^\s*ISBN(?:-1[03])?\s*:?\s*", re.IGNORECASE)
_LEADING = re.compile(r"[0-9X]+")


def normalize_isbn(value: str | None) -> str | None:
    """'978-0-13-235088-4 (pbk.)' -> '9780132350884'. Drops an "ISBN"
    label, anything in parentheses, hyphens and spaces, then keeps the run
    of digits/X at the start. Returns None when nothing is left."""
    if not value:
        return None
    text = _PREFIX.sub("", str(value)).split("(")[0]
    text = re.sub(r"[\s\-]", "", text).upper()
    match = _LEADING.match(text)
    return match.group(0) if match else None


def is_valid_isbn(isbn: str) -> bool:
    """True for a normalized ISBN-10 or ISBN-13 with a correct check digit."""
    if re.fullmatch(r"\d{9}[\dX]", isbn):
        total = sum((10 - i) * (10 if c == "X" else int(c)) for i, c in enumerate(isbn))
        return total % 11 == 0
    if re.fullmatch(r"\d{13}", isbn):
        total = sum(int(c) * (1 if i % 2 == 0 else 3) for i, c in enumerate(isbn))
        return total % 10 == 0
    return False


def clean_isbn_input(value: str | None) -> str | None:
    """For ISBNs typed on the book form: None when blank, otherwise the
    normalized ISBN. Raises ValueError when it isn't a valid ISBN-10/13."""
    if value is None or not str(value).strip():
        return None
    isbn = normalize_isbn(value)
    if not isbn or not is_valid_isbn(isbn):
        raise ValueError("Enter a valid ISBN-10 or ISBN-13. Check the digits for a typo.")
    return isbn
