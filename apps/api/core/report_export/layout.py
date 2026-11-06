# The shared report layout: paper, colours, the header (school and LRC),
# the summary label and the signature lines. Used by the PDF and Excel
# exporters.

import re
from dataclasses import dataclass

# Paper for PDF and Excel printing. Change it here only.
PAPER_SIZE = "A4"            # "A4" or "Letter"
ORIENTATION = "landscape"    # "landscape" or "portrait"

# A PDF longer than this many table rows stops there and says so; Excel and
# CSV always have every row.
PDF_MAX_ROWS = 2000

# Brand colours (apps/web/app/globals.css).
GREEN_700 = "#006F3C"
GREEN_50 = "#F3F9F5"
INK_200 = "#DDDFD7"
INK_500 = "#6B6E63"
INK_900 = "#14150F"
GOLD_500 = "#C8A951"

# Job titles for the signature lines, until the library confirms them.
# Editable in Settings (library_settings.report_*_title, migration 0060);
# a title still equal to its placeholder is flagged in the export dialog.
SIGNATURE_ROLES: list[tuple[str, str, str]] = [
    # (key, label on the report, placeholder job title)
    ("prepared_by", "Prepared by", "Librarian"),
    ("noted_by", "Noted by", "Head Librarian"),
    ("approved_by", "Approved by", "Director, Learning Resource Center"),
]
PLACEHOLDER_TITLES = {key: title for key, _, title in SIGNATURE_ROLES}


@dataclass
class Signatory:
    label: str   # "Prepared by"
    name: str    # typed at export time; may be blank (a line to sign on)
    title: str   # job title from Settings


@dataclass
class ReportHeader:
    school: str                     # first line, e.g. "De La Salle Lipa"
    unit: str | None = None         # second line, e.g. "Learning Resource Center"
    address: str | None = None      # always in the small address style


@dataclass
class ExportOptions:
    header: ReportHeader
    summary_text: str
    summary_label: str
    signatories: list[Signatory]


def signature_titles(settings: dict) -> dict[str, str]:
    """Job titles from Settings, falling back to the placeholders."""
    return {
        key: (settings.get(f"report_{key}_title") or "").strip() or placeholder
        for key, _, placeholder in SIGNATURE_ROLES
    }


def placeholder_roles(settings: dict) -> list[str]:
    """Labels of the signature lines whose job title is still a placeholder."""
    titles = signature_titles(settings)
    return [label for key, label, placeholder in SIGNATURE_ROLES if titles[key] == placeholder]


# " - ", " – " or " — " between the school and the LRC name. Only a dash
# with spaces around it, so a hyphenated name stays whole.
_NAME_SEPARATOR = re.compile(r"\s+[-–—]\s+")


def report_header(settings: dict) -> ReportHeader:
    """The report header from Settings. "De La Salle Lipa - Learning
    Resource Center" becomes two lines; a name without a separator stays on
    one line. The address is kept apart so it's always styled as an
    address."""
    name = re.sub(r"\s+", " ", (settings.get("library_name") or "").strip())
    school, unit = (_NAME_SEPARATOR.split(name, maxsplit=1) + [None])[:2] if name else ("Learning Resource Center", None)
    address = (settings.get("address") or "").strip() or None
    return ReportHeader(school=school.strip(), unit=unit.strip() if unit and unit.strip() else None, address=address)


def summary_label(source: str, text: str, computed: str) -> str:
    """How the summary on the report is described. The key figures are
    always printed separately, computed by the server."""
    if source == "ai":
        return "Summary (AI-assisted draft, reviewed by the librarian)"
    if text.strip() == computed.strip():
        return "Summary (computed from the report data)"
    return "Summary (written by the librarian)"


def signatories(settings: dict, names: dict[str, str | None]) -> list[Signatory]:
    titles = signature_titles(settings)
    return [
        Signatory(label=label, name=(names.get(key) or "").strip(), title=titles[key])
        for key, label, _ in SIGNATURE_ROLES
    ]
