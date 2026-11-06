# The shared report layout: paper, colours, the header (school and LRC),
# the summary label and the signature lines. Used by the PDF and Excel
# exporters.

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
class ExportOptions:
    header_lines: list[str]
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


def header_lines(settings: dict) -> list[str]:
    """['De La Salle Lipa', 'Learning Resource Center', '<address>'] from
    the library name ("De La Salle Lipa — Learning Resource Center")."""
    name = (settings.get("library_name") or "").strip()
    parts = [p.strip() for p in name.replace(" – ", " — ").split(" — ") if p.strip()] or ["Learning Resource Center"]
    address = (settings.get("address") or "").strip()
    return parts + ([address] if address else [])


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
