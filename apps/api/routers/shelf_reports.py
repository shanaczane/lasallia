# "Can't find this book on the shelf" reports. Anyone signed in can report;
# only librarians can list and resolve them.

from fastapi import APIRouter, Depends, status

from core.deps import get_current_user, require_librarian
from core.shelf_reports import list_open_reports, report_book, resolve_report
from core.supabase import get_admin_client
from schemas.auth import UserProfile
from schemas.shelf_report import ResolveShelfReportRequest, ShelfReport

router = APIRouter(tags=["shelf-reports"])


@router.post("/books/{book_id}/shelf-report", response_model=ShelfReport)
def post_shelf_report(book_id: str, user: UserProfile = Depends(get_current_user)):
    return report_book(get_admin_client(), book_id, user.id, user.full_name)


@router.get("/inventory/shelf-reports", response_model=list[ShelfReport])
def get_shelf_reports(librarian: UserProfile = Depends(require_librarian)):
    return list_open_reports(get_admin_client())


@router.post("/inventory/shelf-reports/{report_id}/resolve", status_code=status.HTTP_204_NO_CONTENT)
def post_resolve_shelf_report(
    report_id: str, body: ResolveShelfReportRequest, librarian: UserProfile = Depends(require_librarian),
):
    resolve_report(get_admin_client(), report_id, body.action, librarian.id)
