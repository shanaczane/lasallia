import io

from pymarc import Field, Indicators, MARCWriter, Record, Subfield

from core.importers.marc import normalize_isbn, parse_marc, plan_import


def _record(title=None, author="Martin, Robert C.", isbn="978-0-13-235088-4", barcodes=("T100",), call_number="005.1 M379 2008"):
    r = Record(force_utf8=True)
    if isbn:
        r.add_field(Field(tag="020", indicators=Indicators(" ", " "), subfields=[Subfield("a", f"{isbn} (pbk.)")]))
    if author:
        r.add_field(Field(tag="100", indicators=Indicators("1", " "), subfields=[Subfield("a", f"{author},")]))
    if title:
        r.add_field(Field(tag="245", indicators=Indicators("1", "0"), subfields=[Subfield("a", f"{title} /")]))
    r.add_field(Field(tag="264", indicators=Indicators(" ", "1"), subfields=[Subfield("a", "Upper Saddle River :"), Subfield("b", "Prentice Hall,"), Subfield("c", "c2008.")]))
    for code in barcodes:
        r.add_field(Field(tag="852", indicators=Indicators(" ", " "), subfields=[Subfield("b", "CITE"), Subfield("c", "Computer Science"), Subfield("h", call_number), Subfield("p", code)]))
    return r


def _mrc(*records) -> bytes:
    buf = io.BytesIO()
    writer = MARCWriter(buf)
    for r in records:
        writer.write(r)
    return buf.getvalue()


def _book(**overrides):
    book = {
        "id": "book-1",
        "title": "Clean code",
        "author": "Martin, Robert C.",
        "isbn": "9780132350884",
        "call_number": "005.1 M379 2008",
        "publisher": "Prentice Hall",
        "published_year": 2008,
        "abstract": None,
        "accession_no": "T100",
        "archived_at": None,
        "shelf_location": "Aisle 1",
    }
    return {**book, **overrides}


def _plan(records_bytes, books, copies):
    records, issues = parse_marc(records_bytes)
    return plan_import(records, books, copies, issues)


def test_parse_maps_marc_fields_and_strips_isbd_punctuation():
    records, issues = parse_marc(_mrc(_record("Clean code", barcodes=("T0000100", "T101"))))
    assert issues == []
    r = records[0]
    assert r.title == "Clean code"
    assert r.author == "Martin, Robert C."
    assert r.publisher == "Prentice Hall"
    assert r.published_year == 2008
    assert r.call_number == "005.1 M379 2008"
    assert (r.college, r.program) == ("CITE", "Computer Science")
    # Zero-padded label barcodes normalize the same way kiosk scans do.
    assert r.barcodes == ["T100", "T101"]


def test_normalize_isbn_ignores_hyphens_and_qualifiers():
    assert normalize_isbn("978-0-13-235088-4 (pbk.)") == normalize_isbn("9780132350884")


def test_new_title_is_added_with_one_copy_per_barcode():
    plan = _plan(_mrc(_record("Clean code", barcodes=("T100", "T101"))), [], [])
    assert plan.count("add") == 1
    item = plan.items[0]
    assert item.new_copies == ["T100", "T101"]
    assert item.payload["accession_no"] == "T100"
    assert item.payload["category"] == "Computer Science"
    assert item.payload["subject"] == "CITE"


def test_reimporting_the_same_data_changes_nothing():
    plan = _plan(_mrc(_record("Clean code")), [_book()], [{"book_id": "book-1", "accession_number": "T100"}])
    assert [i.action for i in plan.items] == ["unchanged"]
    assert plan.copies_added == 0


def test_edited_title_is_an_update_and_never_touches_status_or_lasallia_fields():
    plan = _plan(_mrc(_record("Clean code: a handbook")), [_book()], [{"book_id": "book-1", "accession_number": "T100"}])
    item = plan.items[0]
    assert item.action == "update"
    assert item.matched_by == "accession"
    assert [c.field for c in item.changes] == ["title"]
    assert set(item.payload) == {"title"}
    for protected in ("status", "cover_url", "category", "subject", "collection_type", "archived_at"):
        assert protected not in item.payload


def test_call_number_change_also_reclassifies_the_shelf():
    plan = _plan(_mrc(_record("Clean code", call_number="823 F12")), [_book()], [{"book_id": "book-1", "accession_number": "T100"}])
    assert {"call_number", "shelf_location", "aisle"} <= set(plan.items[0].payload)


def test_blank_export_fields_never_erase_existing_values():
    plan = _plan(_mrc(_record("Clean code", author=None, isbn=None)), [_book()], [{"book_id": "book-1", "accession_number": "T100"}])
    assert plan.items[0].action == "unchanged"


def test_new_copy_on_an_existing_title():
    plan = _plan(_mrc(_record("Clean code", barcodes=("T100", "T102"))), [_book()], [{"book_id": "book-1", "accession_number": "T100"}])
    item = plan.items[0]
    assert item.action == "update"
    assert item.new_copies == ["T102"]


def test_copy_missing_from_export_is_reported_not_deleted():
    copies = [{"book_id": "book-1", "accession_number": "T100"}, {"book_id": "book-1", "accession_number": "T101"}]
    plan = _plan(_mrc(_record("Clean code", barcodes=("T100",))), [_book()], copies)
    assert plan.items[0].action == "unchanged"
    assert plan.items[0].copies_not_in_export == ["T101"]


def test_seeded_book_without_a_copy_row_matches_and_gets_its_copy_created():
    plan = _plan(_mrc(_record("Clean code")), [_book()], [])
    item = plan.items[0]
    assert item.matched_by == "accession"
    assert item.new_copies == ["T100"]


def test_matches_by_isbn_then_title_author_when_barcodes_are_new():
    by_isbn = _plan(_mrc(_record("Clean code", barcodes=("T200",))), [_book(accession_no=None)], [])
    assert by_isbn.items[0].matched_by == "isbn"

    by_title = _plan(_mrc(_record("Clean code", isbn=None, barcodes=("T200",))), [_book(accession_no=None, isbn=None)], [])
    assert by_title.items[0].matched_by == "title_author"


def test_ambiguous_isbn_is_not_used_for_matching():
    books = [_book(id="a", accession_no=None, title="Clean code"), _book(id="b", accession_no=None, title="Clean code 2")]
    plan = _plan(_mrc(_record("Something else", barcodes=("T200",))), books, [])
    assert plan.items[0].action == "add"


def test_bad_records_are_errors_and_the_rest_still_import():
    data = _mrc(
        _record(None, barcodes=("T300",)),                 # no title
        _record("No copies", barcodes=()),                 # no 852 $p
        _record("First", isbn=None, barcodes=("T301",)),
        _record("Duplicate barcode", isbn=None, barcodes=("T301",)),
    )
    plan = _plan(data, [], [])
    assert plan.records_read == 4
    assert [i.title for i in plan.items] == ["First"]
    messages = [e.message for e in plan.errors]
    assert any("Missing title" in m for m in messages)
    assert any("No copy barcode" in m for m in messages)
    assert any("also appears in record 3" in m for m in messages)


def test_copies_split_across_two_lasallia_books_is_an_error():
    books = [_book(id="a", accession_no="T100"), _book(id="b", accession_no="T101", title="Other")]
    plan = _plan(_mrc(_record("Clean code", barcodes=("T100", "T101"))), books, [])
    assert plan.items == []
    assert "different books" in plan.errors[0].message


def test_spacing_before_punctuation_is_not_a_change():
    plan = _plan(
        _mrc(_record("Clean code", author="Flint , Paula Goodlett")),
        [_book(author="Flint, Paula Goodlett")],
        [{"book_id": "book-1", "accession_number": "T100"}],
    )
    assert plan.items[0].action == "unchanged"
