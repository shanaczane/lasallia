import pytest

from core.accession import accession_sort_key, clean_accession_input
from core.importers.marc import large_jump
from core.isbn import clean_isbn_input, is_valid_isbn, normalize_isbn


# ─── ISBN ───────────────────────────────────────────────────────────────

@pytest.mark.parametrize("raw, expected", [
    ("978-0-13-235088-4", "9780132350884"),
    ("978 0 13 235088 4", "9780132350884"),
    ("978-0-13-235088-4 (pbk.)", "9780132350884"),
    ("ISBN 978-0-13-235088-4", "9780132350884"),
    ("ISBN-13: 9780132350884", "9780132350884"),
    ("0-07-123361-x", "007123361X"),
    ("0-07-123361-X pbk.", "007123361X"),
    ("", None),
    (None, None),
    ("n/a", None),
])
def test_normalize_isbn(raw, expected):
    assert normalize_isbn(raw) == expected


def test_isbn_check_digits():
    assert is_valid_isbn("9780132350884")
    assert is_valid_isbn("007123361X")
    assert not is_valid_isbn("9780132350885")      # wrong check digit
    assert not is_valid_isbn("786210424805")       # the audit's 12-digit value
    assert not is_valid_isbn("0071233610")         # X replaced by 0


def test_clean_isbn_input_stores_digits_and_uppercase_x():
    assert clean_isbn_input(" 978-0-13-235088-4 ") == "9780132350884"
    assert clean_isbn_input("0-07-123361-x") == "007123361X"
    assert clean_isbn_input("   ") is None
    assert clean_isbn_input(None) is None
    with pytest.raises(ValueError):
        clean_isbn_input("78-6-210-42480-5")


# ─── Accession numbers ──────────────────────────────────────────────────

def test_clean_accession_input():
    assert clean_accession_input(" t046646 ") == "T46646"
    assert clean_accession_input("gs676") == "GS676"
    for bad in ("", "46646", "T45312-C2", "T44846 T44847", "T-1"):
        with pytest.raises(ValueError):
            clean_accession_input(bad)


def test_sorting_is_numeric_within_a_prefix():
    values = ["T10", "GS2", "T9", "T45312-C2", "T100", "GS10"]
    assert sorted(values, key=accession_sort_key) == ["GS2", "GS10", "T9", "T10", "T100", "T45312-C2"]


def test_large_jump_flags_only_numbers_far_above_the_counter():
    counters = {"T": 46646, "GS": 676}
    assert large_jump("T47646", counters) is None          # exactly 1,000 above
    assert large_jump("T47647", counters) == "T46646"      # 1,001 above
    assert large_jump("GS9999", counters) == "GS676"
    assert large_jump("T100", counters) is None            # below the counter
    assert large_jump("X99999", counters) is None          # unknown prefix
    assert large_jump("T45312-C2", counters) is None       # nonstandard value
