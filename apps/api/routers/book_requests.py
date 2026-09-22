# apps/api/routers/book_requests.py
# Faculty-only "request a book" flow — student/requests/page.tsx (shown
# only to role='faculty') submits and checks their own; the librarian
# Reports > Requests tab (RequestsPanel) lists and resolves every one.
# See migrations/0039_book_requests.sql.

import traceback
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from core.deps import require_faculty, require_librarian
from core.notify import notify, notify_librarians
from core.supabase import get_admin_client
from schemas.auth import UserProfile
from schemas.book_request import (
    BookRequest,
    CreateBookRequestRequest,
    UpdateBookRequestRequest,
    UpdateOwnBookRequestRequest,
)

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

    requester_name = user.full_name or user.email
    notify_librarians(
        "New book request submitted",
        f'{requester_name} requested "{title}".',
        link="/librarian/reports?tab=requests",
        type="book_request_submitted",
    )

    return created.data[0]


# Faculty-only, own-request-only, and only while a librarian hasn't acted on
# it yet — once approved/rejected/fulfilled the request is someone else's
# decision of record, so editing the ask out from under it isn't allowed.
# Separate from update_book_request below (that one is the librarian's
# status-only PATCH and stamps reviewed_by/reviewed_at).
@router.patch("/{request_id}/edit", response_model=BookRequest)
def edit_book_request(
    request_id: str,
    body: UpdateOwnBookRequestRequest,
    user: UserProfile = Depends(require_faculty),
):
    changes = body.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No changes given")

    admin = get_admin_client()
    existing = admin.table("book_requests").select("id, requester_id, status").eq("id", request_id).execute()
    if not existing.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Request not found")
    if existing.data[0]["requester_id"] != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only edit your own request")
    if existing.data[0]["status"] != "pending":
        raise HTTPException(status.HTTP_409_CONFLICT, "This request has already been reviewed and can no longer be edited")

    if "title" in changes:
        title = (changes["title"] or "").strip()
        if not title:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Title is required")
        changes["title"] = title
    if "copies" in changes and (changes["copies"] or 0) < 1:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Copies must be at least 1")
    for field in ("author", "isbn", "note", "course"):
        if field in changes:
            changes[field] = (changes[field] or "").strip() or None

    changes["updated_at"] = datetime.now(timezone.utc).isoformat()
    admin.table("book_requests").update(changes).eq("id", request_id).execute()

    updated = admin.table("book_requests").select(_SELECT).eq("id", request_id).execute()
    return updated.data[0]


# Faculty withdrawing their own request — only while still pending, same
# cutoff as edit_book_request above. A distinct 'cancelled' status (0043)
# rather than reusing 'rejected' keeps this visibly different on the
# librarian's Reports > Requests list: 'rejected' is a librarian decision,
# 'cancelled' is the requester's own. No reviewed_by/reviewed_at stamp —
# a librarian never acted on this one.
@router.post("/{request_id}/cancel", response_model=BookRequest)
def cancel_book_request(
    request_id: str,
    user: UserProfile = Depends(require_faculty),
):
    admin = get_admin_client()
    existing = admin.table("book_requests").select("id, requester_id, status, title").eq("id", request_id).execute()
    if not existing.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Request not found")
    if existing.data[0]["requester_id"] != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only cancel your own request")
    if existing.data[0]["status"] != "pending":
        raise HTTPException(status.HTTP_409_CONFLICT, "This request has already been reviewed and can no longer be cancelled")

    admin.table("book_requests").update({
        "status": "cancelled",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", request_id).execute()

    requester_name = user.full_name or user.email
    notify_librarians(
        "Book request withdrawn",
        f'{requester_name} cancelled their request for "{existing.data[0]["title"]}".',
        link="/librarian/reports?tab=requests",
        type="book_request_cancelled",
    )

    updated = admin.table("book_requests").select(_SELECT).eq("id", request_id).execute()
    return updated.data[0]


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
    # TEMP DEBUG (remove once the "attachments never save" bug is found) —
    # logs every call to this endpoint to a plain file so it can be
    # inspected without needing browser DevTools access.
    with open("attachment_debug.log", "a", encoding="utf-8") as dbg:
        dbg.write(f"\n=== upload call === request_id={request_id} user={user.id} ({user.email}) role={user.role}\n")
        dbg.write(f"files received: {[(f.filename, f.content_type) for f in files]}\n")

    try:
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
        with open("attachment_debug.log", "a", encoding="utf-8") as dbg:
            dbg.write(f"SUCCESS: inserted {len(rows)} attachment row(s)\n")
        return updated.data[0]
    except HTTPException as e:
        with open("attachment_debug.log", "a", encoding="utf-8") as dbg:
            dbg.write(f"HTTPException: {e.status_code} {e.detail}\n")
        raise
    except Exception:
        with open("attachment_debug.log", "a", encoding="utf-8") as dbg:
            dbg.write("UNHANDLED EXCEPTION:\n")
            dbg.write(traceback.format_exc())
        raise


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

    row = res.data[0]
    decision_notice = {
        "approved": (
            "book_request_approved", "Your book request was approved",
            f'"{row["title"]}" was approved — it\'s now in the library\'s acquisition queue.',
        ),
        "rejected": (
            "book_request_rejected", "Your book request was declined",
            f'"{row["title"]}" was not approved for acquisition.',
        ),
        "fulfilled": (
            "book_request_fulfilled", "Your requested book is now available",
            f'"{row["title"]}" has been acquired and is now part of the collection.',
        ),
    }.get(changes.get("status"))
    if decision_notice:
        notif_type, notif_title, notif_message = decision_notice
        notify(row["requester_id"], notif_type, notif_title, notif_message, link="/student/requests")

    updated = admin.table("book_requests").select(_SELECT).eq("id", request_id).execute()
    return updated.data[0]
