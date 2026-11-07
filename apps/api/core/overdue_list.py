# The librarians' overdue list. Rows come from overdue_loans, the same data as
# the Overdue report, so the two always show the same numbers. Only the
# reminder columns are added here.

from core.loan_reminders import manila_day_number
from core.dates import manila_now
from core.paging import fetch_rows_for_ids
from core.reports import ReportFilters, overdue_loans
from schemas.reports import OverdueListRow


def overdue_list(admin) -> list[OverdueListRow]:
    loans = overdue_loans(admin, ReportFilters())
    logged = fetch_rows_for_ids(
        lambda ids: (
            admin.table("loan_reminder_log").select("loan_id, kind, occurrence, sent_at")
            .eq("channel", "in_app").in_("loan_id", ids).order("id")
        ),
        [row.id for _, row in loans],
    )
    by_loan: dict[str, list[dict]] = {}
    for entry in logged:
        by_loan.setdefault(entry["loan_id"], []).append(entry)

    today = manila_day_number(manila_now().date())
    rows = []
    for student_id, row in loans:
        entries = sorted(by_loan.get(row.id, []), key=lambda e: e["sent_at"])
        rows.append(OverdueListRow(
            **row.model_dump(),
            studentId=student_id,
            lastReminderAt=entries[-1]["sent_at"] if entries else None,
            lastReminderKind=entries[-1]["kind"] if entries else None,
            reminderCount=len(entries),
            remindedToday=any(e["kind"] == "manual" and e["occurrence"] == today for e in entries),
        ))
    rows.sort(key=lambda r: (-r.daysOverdue, -r.libraryHours, -r.fine, r.patron.lower()))
    return rows
