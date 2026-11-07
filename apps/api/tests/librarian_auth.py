# Test helper: lets a test app's librarian routes through without a real
# login or active-profile token.

from fastapi import FastAPI

from core.deps import require_librarian, require_librarian_profile
from schemas.auth import ActiveLibrarian, UserProfile


def active_librarian(user: UserProfile, profile_id: str = "profile-1", name: str = "Test Profile") -> ActiveLibrarian:
    return ActiveLibrarian(**user.model_dump(), librarian_profile_id=profile_id, librarian_name=name)


def allow_librarian(app: FastAPI, user: UserProfile) -> None:
    app.dependency_overrides[require_librarian] = lambda: user
    app.dependency_overrides[require_librarian_profile] = lambda: active_librarian(user)
