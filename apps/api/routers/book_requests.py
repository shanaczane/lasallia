# apps/api/routers/book_requests.py
# Faculty-only "request a book" flow — student/requests/page.tsx (shown
# only to role='faculty') submits and checks their own; the librarian
# Reports > Requests tab (RequestsPanel) lists and resolves every one.
# See migrations/0039_book_requests.sql.

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from core.deps import require_faculty, require_librarian
from core.supabase import get_admin_client
from schemas.auth import UserProfile
from schemas.book_request import BookRequest, CreateBookRequestRequest, UpdateBookRequestRequest

router = APIRouter(prefix="/book-requests", tags=["book-requests"])

# profiles!book_requests_requester_id_fkey: book_requests has two FKs into
# profiles (requester_id and reviewed_by), so a bare "profiles(...)" embed
# is ambiguous to PostgREST (PGRST201) — this pins it to the requester,
# not whichever librarian reviewed it. attachments aliases the reverse-FK
# embed of book_request_attachments (0042) to the plural name
# schemas.book_request.BookRequest expects.
_SELECT = (
    "*, profiles!book_requests_requester_id_fkey(full_name, email, college), "
    "attachments:book_request_attachments(id, url, name, created_at)"
)

ATTACHMENT_BUCKET = "book-request-attachments"
MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024


# Checked against the file's own first bytes, not the client-sent
# content-type header — same reasoning as books.py's _sniff_image_type,
# extended with PDF's magic bytes for reading lists / price quotes.
def _sniff_attachment_type(data: bytes) -> tuple[str, str] | None:
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg", "jpg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png", "png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp", "webp"
    if data.startswith(b"%PDF-"):
        return "application/pdf", "pdf"
    return None


@router.post("", response_model=BookRequest, status_code=status.HTTP_201_CREATED)
def create_book_request(
    body: CreateBookRequestRequest,
    user: UserProfile = Depends(require_faculty),
):
    title = body.title.strip()
    if not title:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Title is required")

    if body.copies < 1:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Copies must be at least 1")

    admin = get_admin_client()
    res = admin.table("book_requests").insert({
        "requester_id": user.id,
        "title": title,
        "author": (body.author or "").strip() or None,
        "isbn": (body.isbn or "").strip() or None,
        "note": (body.note or "").strip() or None,
        "format": body.format,
        "copies": body.copies,
        "course": (body.course or "").strip() or None,
    }).execute()
    if not res.data:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Could not submit this request")

    # Re-read with the profile embed — the insert's own response doesn't
    # include the join, and every other response here carries it.
    created = admin.table("book_requests").select(_SELECT).eq("id", res.data[0]["id"]).execute()
    return created.data[0]


# Faculty-only, and only the request's own submitter — a librarian reviews
# through the Reports tab but never uploads on a faculty member's behalf.
# Accepts several files in one call (a reading list PDF *and* a listing
# screenshot, say) — each becomes its own book_request_attachments row
# rather than overwriting a single column, so none of them replace another.
# Server-side type/size enforcement, same reasoning as books.py's cover
# upload: the form's own limits are just UX, not what's actually enforced.
@router.post("/{request_id}/attachments", response_model=BookRequest)
def upload_request_attachments(
    request_id: str,
    files: list[UploadFile] = File(...),
    user: UserProfile = Depends(require_faculty),
):
    admin = get_admin_client()
    existing = admin.table("book_requests").select("id, requester_id").eq("id", request_id).execute()
    if not existing.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Request not found")
    if existing.data[0]["requester_id"] != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only attach files to your own request")

    bucket = admin.storage.from_(ATTACHMENT_BUCKET)
    rows = []
    for file in files:
        data = file.file.read(MAX_ATTACHMENT_BYTES + 1)
        if len(data) > MAX_ATTACHMENT_BYTES:
            raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, f"'{file.filename}' is over 10 MB")
        sniffed = _sniff_attachment_type(data)
        if not sniffed:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"'{file.filename}' must be a JPG, PNG, WebP, or PDF file")
        content_type, ext = sniffed

        path = f"{request_id}/{uuid.uuid4().hex}.{ext}"
        bucket.upload(path, data, {"content-type": content_type})
        rows.append({
            "request_id": request_id,
            "url": bucket.get_public_url(path),
            "name": file.filename or path,
        })

    if rows:
        admin.table("book_request_attachments").insert(rows).execute()

    updated = admin.table("book_requests").select(_SELECT).eq("id", request_id).execute()
    return updated.data[0]


@router.delete("/{request_id}/attachments/{attachment_id}", response_model=BookRequest)
def delete_request_attachment(
    request_id: str,
    attachment_id: str,
    user: UserProfile = Depends(require_faculty),
):
    admin = get_admin_client()
    existing = admin.table("book_requests").select("id, requester_id").eq("id", request_id).execute()
    if not existing.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Request not found")
    if existing.data[0]["requester_id"] != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only remove attachments from your own request")

    attachment = admin.table("book_request_attachments").select("url").eq("id", attachment_id).eq("request_id", request_id).execute()
    if not attachment.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Attachment not found")

    bucket = admin.storage.from_(ATTACHMENT_BUCKET)
    marker = f"/{ATTACHMENT_BUCKET}/"
    url = attachment.data[0]["url"]
    if marker in url:
        try:
            bucket.remove([url.split(marker, 1)[1].split("?")[0]])
        except Exception as e:
            print(f"delete_request_attachment: could not remove file for {attachment_id}: {e}")

    admin.table("book_request_attachments").delete().eq("id", attachment_id).execute()

    updated = admin.table("book_requests").select(_SELECT).eq("id", request_id).execute()
    return updated.data[0]


@router.get("/me", response_model=list[BookRequest])
def list_my_requests(user: UserProfile = Depends(require_faculty)):
    admin = get_admin_client()
    return (
        admin.table("book_requests")
        .select(_SELECT)
        .eq("requester_id", user.id)
        .order("created_at", desc=True)
        .execute()
        .data
    )


@router.get("", response_model=list[BookRequest])
def list_book_requests(
    request_status: str | None = None,
    librarian: UserProfile = Depends(require_librarian),
):
    query = get_admin_client().table("book_requests").select(_SELECT).order("created_at", desc=True)
    if request_status:
        query = query.eq("status", request_status)
    return query.execute().data


@router.patch("/{request_id}", response_model=BookRequest)
def update_book_request(
    request_id: str,
    body: UpdateBookRequestRequest,
    librarian: UserProfile = Depends(require_librarian),
):
    changes = body.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No changes given")

    changes["updated_at"] = datetime.now(timezone.utc).isoformat()
    changes["reviewed_by"] = librarian.id
    changes["reviewed_at"] = datetime.now(timezone.utc).isoformat()

    admin = get_admin_client()
    res = admin.table("book_requests").update(changes).eq("id", request_id).execute()
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Request not found")

    updated = admin.table("book_requests").select(_SELECT).eq("id", request_id).execute()
    return updated.data[0]
