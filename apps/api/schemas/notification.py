from typing import Literal

from pydantic import BaseModel

NotificationType = Literal[
    "due_reminder", "overdue", "reservation_confirmed",
    "reservation_cancelled", "return_confirmed",
    "loan_confirmed", "student_activity",
    "reservation_placed", "reservation_queue_advanced",
]

class Notification(BaseModel):
    id: str
    user_id: str
    type: NotificationType
    title: str
    message: str
    is_read: bool
    created_at: str
    link: str | None = None
