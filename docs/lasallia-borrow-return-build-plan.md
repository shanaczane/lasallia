# Lasallia — Borrowing & Returning: Phased Build Plan

**Audience:** Claude Code
**Stack:** Next.js (frontend) + FastAPI (backend) + Supabase (Postgres, auth, storage)
**How to use this doc:** Build **one phase at a time**. Do not start a later phase until the current phase's acceptance criteria all pass. Each phase is designed to be independently demoable.

---

## 0. The core principle (read this before writing any code)

> **The system never trusts that the student grabbed the right physical book.**

The accession number is the only proof of possession. Therefore:

- **The accession number is NEVER displayed** on the catalog page, the book detail page, or the borrowing form. Availability is shown as a count only (`2 copies · 1 available`).
- The student **types** the accession number off the physical label. The system compares it to the copy it placed on hold.
- The ID tap proves **identity**. The accession number proves **possession**. These are two separate guarantees and neither substitutes for the other.

Any feature that leaks an accession number to the student before they've typed it is a bug, regardless of how convenient it seems.

---

## Phase 1 — Data model, status machine, and dual authentication

**Goal:** A correct schema and a working station session. No borrowing yet.

### 1.1 Schema

Core tables (names are suggestions; keep them consistent):

| Table | Purpose |
|---|---|
| `students` | Student record, ID card UID, enrollment status, account standing |
| `books` | Title-level bibliographic record (title, author, edition, year, publisher, place, ISBN, description, call number, collection type, cover image) |
| `book_copies` | One row per physical copy: `accession_number` (unique), `book_id`, `status`, `shelf_location` |
| `loans` | One row per borrow transaction |
| `reservations` | Title-level queue |
| `fines` | Fine records attached to loans |
| `station_sessions` | Kiosk sessions |
| `soft_holds` | Short-lived claim on a copy during the borrow flow |

**Critical constraints:**
- `book_copies.accession_number` — UNIQUE, NOT NULL. This is the physical identity of the object.
- `loans` must reference `book_copies.id`, **not** `books.id`. A loan is always against one specific physical copy.
- `reservations` must reference `books.id`, **not** a copy. Reservations are on the title; whichever copy returns first goes to whoever is first in line.

### 1.2 Copy status machine

```
Available ──borrow──> On Loan ──return──> For Reshelving ──scan──> Available
                                      └──return w/ queue──> Reserved ──pickup──> On Loan
                                                                  └──expired──> For Reshelving
```

Side states (set manually or by rule, not part of the happy path): `Overdue`, `Lost`, `Damaged`, `Missing`.

**Enforce the transitions in the database or a service layer, not in the UI.** Illegal transitions must be rejected. Specifically:

- `For Reshelving` is a real state and is **not** borrowable. A returned book sitting on the counter is not on the shelf, and the thesis promises real-time shelf location.
- Nothing goes from `On Loan` straight to `Available`. Ever.

### 1.3 Collection types

Store a `collection_type` on `books`. These types are **never borrowable** and must be blocked at the service layer:

`Reference`, `Thesis`, `Capstone`, `MTR`, `Archives`

These types use hourly fines (see Phase 4): `Reserve`, `Story book`, `Bible`

### 1.4 Dual authentication

Both paths open **the same** `station_session` object. Auth method is a field, not a separate flow.

| Method | `auth_method` value | Notes |
|---|---|---|
| Tap school ID on RFID reader | `rfid` | Default, one motion, no typing |
| Manual login (username + password) on the kiosk | `manual_login` | For students without their ID card on hand |
| Librarian logs student in from the dashboard | `librarian_assisted` | Used when the ID reader is offline |

Everything downstream of authentication is **identical** for all three. Same account checks, same timer, same soft hold, same QR, same accession verification.

**Kiosk hygiene requirements for `manual_login`:**
- No saved passwords, no autofill, no password manager.
- Password field clears on logout, on timeout, and on any navigation away.
- Nothing personal remains on screen after logout.

**Policy note for the team (not a code decision):** manual login is currently treated as a *convenience*, not a fallback — a student who forgot their ID can still borrow. This is acceptable because the accession-number step is the real verification and is unaffected by how they logged in. If the LRC later wants it restricted to reader-offline only, that becomes a config flag, not a rewrite.

### Acceptance criteria — Phase 1

- [ ] A student can open a session by tapping an ID **or** by manual login, and the resulting session is indistinguishable downstream except for `auth_method`.
- [ ] Attempting an illegal status transition (e.g. `On Loan` → `Available`) is rejected by the backend.
- [ ] Every session records `auth_method`, `station_id`, `student_id`, `started_at`.
- [ ] Seed data exists: at least 3 titles, one with multiple copies, one with zero available copies, one of a non-borrowable collection type.

### Do NOT build yet
Borrowing, QR generation, fines, returns, reservations.

---

## Phase 2 — Borrow happy path

**Goal:** A student with a clean account can borrow one book, end to end. Assume every account check passes — those come in Phase 3.

### 2.1 Search and catalog

- Search by title, author, subject, or call number.
- Results show: cover, title, author, call number, shelf location, live availability count.
- Book detail page shows full bibliographic data, a prominent **"Where to find it"** panel (floor, section, call number), and availability as a count.
- **No accession numbers anywhere on these pages.**

### 2.2 Claiming a copy

When the student taps **"Borrow this book"**:

1. System selects the **earliest available copy** (deterministic — order by accession number or acquisition date, pick one and document it).
2. System places a **soft hold** on that copy so the other station cannot claim it.
3. System generates a QR code with a **2-minute expiry**.
4. Screen shows: *"Get the book from the shelf first — you will need the number printed on its label."*

**One active QR per station.** The soft hold lives as long as the QR does.

### 2.3 The walk to the shelf

- **"I'm getting the book"** button extends the session to ~5 minutes.
- **"I can't find it"** button flags the copy for librarian attention and releases the hold.

### 2.4 The borrowing form

Opens on the phone via QR scan, **or** on the laptop via a **"Continue on this laptop"** button. Same form, same fields, same validation. No student is blocked by not having a phone or data.

| Box | Contents | Editable? |
|---|---|---|
| 1 — Who is borrowing | `Borrowing as: [first name]`, books out vs limit (`2 of 3`), blocked/fines banner when applicable | No |
| 2 — What book | Title, author, edition, year, publisher, place, ISBN, call number, collection type, shelf location, cover image | No (auto-filled from QR) |
| 3 — Verification | Accession number field, helper image showing where the label is, live match indicator, attempt counter | **Yes — this is the student's input** |
| 4 — Loan details | Transaction number, date/time borrowed, due date, applicable fine rates, renewal policy | No (computed) |
| 5 — Student input | Purpose (optional dropdown), condition (required), remarks + photo (required if not "Good"), agreement checkbox | Yes |

**Box 2 must not contain the accession number.** Showing it defeats the entire verification.

### 2.5 Accession number matching

- Input is **forgiving**: trim whitespace, case-insensitive. `t45136` and `T45136` both pass.
- On match: show title and cover with a green check. This catches typos *before* a loan exists.
- On mismatch: *"That number belongs to a different book. Please check the label."*
- **After 3 wrong entries the session ends** and the student is told to see the librarian.
- **Confirm stays disabled until the accession number matches.**

### 2.6 Condition declaration

The student declares the book's condition at borrow time: `Good` / `Minor wear` / `Already damaged`, with an optional photo (required if not `Good`).

**Why this matters:** no librarian inspects the book on the way out. This declaration is the *only* baseline for comparison at return. Treat it as a first-class field, not a nicety.

### 2.7 Commit

On **"Confirm borrow"**:
- Loan activates immediately. Copy status → `On Loan`.
- Due date starts **at this moment**.
- Catalog availability count updates in real time.
- Digital receipt appears on screen and is sent by push and email.
- Book appears in **"My Library"** immediately.

### 2.8 Reminders

Scheduled notifications: **2 days before due**, **on the due date**, then **daily with a running fine total**.

### Acceptance criteria — Phase 2

- [ ] Two stations attempting to borrow the last available copy simultaneously — exactly one succeeds, the other gets a clear message.
- [ ] The accession number does not appear in any HTTP response the student can reach before they've typed it correctly. **Check the API payloads, not just the rendered page.**
- [ ] A typo'd accession number never creates a loan.
- [ ] Letting the QR expire releases the soft hold and returns the copy to `Available`.
- [ ] The laptop fallback form is functionally identical to the phone form.

---

## Phase 3 — Blocking checks

**Goal:** Every rule in Part 4 is enforced, and every block explains itself.

| Check | Blocks when |
|---|---|
| Account standing | Blocked, or not enrolled this term |
| Unpaid fines | Any outstanding balance |
| Overdue items | An overdue book is still out |
| Borrowing limit | Already at the maximum number of titles |
| Copy status | `On Loan`, `Reserved` for someone else, `Missing`, or `Lost` |
| Collection type | Reference, thesis, capstone, MTR, archives |
| Duplicate title | Another copy of the same title is already out to them |
| Accession match | The typed number is not the copy on hold |
| Attempt limit | 3 wrong entries in a row |
| Session | No ID tapped, session expired, or a different student tapped in |
| QR expiry | The on-screen QR is older than 2 minutes |

**Rules:**
- Account-level checks (standing, fines, overdue, limit) run **immediately on session open**. If any fail, a banner appears and borrowing is **disabled for the entire session** — but search and browse stay fully available.
- **Every block shows a plain-language reason. Never a generic error.** "You have ₱15.00 in unpaid fines" — not "Request failed."
- Checks must run **server-side**. A disabled button is a courtesy, not a control.

### Acceptance criteria — Phase 3

- [ ] Each row in the table above has a test that triggers it and asserts the specific message.
- [ ] A blocked student can still search and open book pages.
- [ ] Calling the borrow endpoint directly with a blocked account fails server-side.

---

## Phase 4 — Returning (librarian side)

**Goal:** The librarian can close a loan, assess a fine, and get the book back into circulation correctly.

Students **never** confirm their own return, even though they borrow on their own.

### 4.1 Lookup

- Librarian scans or types the accession number → system finds the **open transaction for that exact copy**.
- If the label is damaged, allow search by **title** or **borrower name**.

### 4.2 The return screen

Must display:
- Borrower name and **photo** (for verification)
- Title and accession number
- Date borrowed, due date
- Date returned (automatic timestamp)
- Days overdue and fine amount (both computed automatically)
- **The condition the student declared at borrow time** — the comparison baseline

### 4.3 Inspection

Librarian checks for: water damage, torn or missing pages, writing, missing date due card, broken spine.

Encodes: `Good` / `Fair` / `Damaged` / `Incomplete`, with description and photo if not `Good`.

**Damage not present in the student's declaration is charged.**

### 4.4 Fine schedule

| Situation | Amount |
|---|---|
| General circulation, overdue | ₱5.00 per item per **school day** |
| Reserve books, story books, Bible | ₱2.00 per **library hour** |
| Lost or damaged | Replacement cost + ₱50.00 processing fee |
| Date due card lost or damaged | ₱50.00 |

Renewals are allowed.

> **⚠️ Open question — resolve before implementing:** "School day" and "library hour" both require a calendar. Weekends, holidays, semestral breaks, and daily opening hours all affect the computation. **Build a `library_calendar` table** (date, is_school_day, open_time, close_time) and compute against it. Do not hardcode "24 hours = 1 day" — it will produce wrong fines and it will be the first thing a panelist asks about.

### 4.5 Settlement

- No fine → move on.
- Fine due → mark **Paid** with a receipt number, or **Unsettled**.
- **Unsettled flags the account**: no borrowing at the stations, and no library clearance, until settled.

### 4.6 Confirm Return

On confirm:
- Transaction closes.
- Copy status → **`For Reshelving`** (not `Available` — it is still at the counter).
- Student's active count drops **immediately**, so they can borrow again right away.
- Return confirmation notification goes out.
- **If anyone is waiting for that title** → copy goes to `Reserved` instead, onto the hold shelf, and the first in queue is notified.

### 4.7 Reshelving scan

A separate **"Reshelving mode"** in the librarian portal. Staff shelve the book and scan it again. **Only then** does the copy become `Available` and borrowable.

Without this step the catalog claims a book is on the shelf while it is still in a cart.

### Acceptance criteria — Phase 4

- [ ] A returned book is not borrowable until the reshelving scan happens.
- [ ] Fines compute correctly across a weekend and across a holiday.
- [ ] An unsettled fine blocks the student's next session at a station.
- [ ] The student's active loan count drops at Confirm Return, not at reshelving.
- [ ] Damage worse than the borrow-time declaration is flagged for charging; damage matching the declaration is not.

---

## Phase 5 — Reservations

**Goal:** Students can queue for a title that is fully out.

### 5.1 Unavailable book display

```
Cloud native security
Call No. 005.8 B614c 2021 · Mezzanine Hall
2 copies · 0 available
Expected back: Aug 7, 2026
1 person is waiting · [ Reserve this book ]
```

- **Expected back** = due date of the copy due soonest.
- If that copy is already overdue, show **"Was due Aug 5 · not yet returned"**. **Never display a date that has already passed.**
- If a copy is available, there is **no Reserve button**. They should just go get it.

### 5.2 Queue rules

- Student must be authenticated (tap or manual login). Same account checks as borrowing.
- Reservation is **on the title, not one copy**.
- First-come, first-served. Position visible in My Library. Cancellable any time.
- Free. No due date starts.

### 5.3 Fulfillment

- On return of a copy of a queued title, the return screen tells the librarian **"HOLD — for [name]"**.
- Copy goes to the **hold shelf**, status `Reserved`. Not back into normal shelving.
- Student is notified and has **until the end of the next library day**.
- **At pickup:** student authenticates (tap **or** manual login), reservation appears automatically, they type the accession number, confirm. Same possession check as a normal borrow.
- **Not collected in time** → hold passes to the next in queue, or the copy returns to circulation.

> A held copy is locked to everyone else until the hold expires. That is exactly why holds belong on a hold shelf and not mixed in with normal books — a locked book that looks available is a confusing experience.

### Acceptance criteria — Phase 5

- [ ] Reserving is impossible when a copy is available.
- [ ] An overdue "expected back" date never renders in the past.
- [ ] Returning a copy of a queued title routes it to `Reserved`, not `For Reshelving`.
- [ ] An expired hold correctly advances to the next person in queue.
- [ ] Pickup requires the accession number, same as a normal borrow.

---

## Phase 6 — Station and session hardening

**Goal:** The kiosk is safe to leave unattended in a public library.

| Rule | Value |
|---|---|
| Inactivity timeout | **90 seconds** |
| "I'm getting the book" extension | ~5 minutes |
| Countdown warning | At 15 seconds, with a **"Still here?"** button |
| Tapping a different ID | Immediately ends the previous session |
| Log out control | **"Done / Log out"** in the same corner on every screen |
| Active QR per station | One, with a soft hold on the copy while it lives |

**Kiosk mode:** full screen, no address bar, no navigation to other sites, no saved passwords.

**Nothing personal remains on screen after logout.**

**ID reader failure:** the librarian logs the student in from the dashboard, and the transaction is tagged `librarian_assisted`.

> **The next student must never inherit a session.** This is the single most important rule in this phase. Test it deliberately: start a session, walk away, come back after 90 seconds, confirm you're at the idle screen with nothing recoverable.

### Acceptance criteria — Phase 6

- [ ] Session expires at 90s idle and clears all personal data from the DOM.
- [ ] Tapping a second ID mid-session terminates the first session cleanly and releases any soft hold.
- [ ] Browser back button after logout does not restore a session.
- [ ] Manual-login password field is empty after any session end.

---

## Phase 7 — Guests

**Goal:** Handle non-students correctly, entirely through the librarian.

- No school ID to tap → **cannot open a session or borrow at the laptops**.
- May browse the **public catalog** and use the **basic chatbot**.
- Librarian records their loan manually as an **in-house loan**: library use or photocopy use only, returned the same day.
- **The RFID tag is never disarmed for a guest loan**, since the book is not supposed to leave the building. The gate enforces this by itself.

Requirements (unchanged, per existing LRC rules):
- Referral letter signed by the Library Head
- Valid ID
- Gate pass
- ₱50.00 for non-NOCEI visitors
- Correct visiting day
- Maximum 5 researchers per school day

### Acceptance criteria — Phase 7

- [ ] A guest cannot reach the borrow endpoint at all.
- [ ] In-house loans are visibly distinct from student loans in the librarian portal.
- [ ] Guest loans never trigger tag disarming.

---

## Open questions to resolve with the LRC

These are policy decisions, not engineering ones. Answer them before the phase that depends on them.

1. **Library calendar** (blocks Phase 4) — Which days count as school days? What are daily opening hours? How are holidays and semestral breaks entered and by whom?
2. **Borrowing limit** (blocks Phase 3) — What is the maximum number of titles? Does it vary by student type (undergrad, grad, faculty)?
3. **Renewals** (blocks Phase 4) — How many renewals per loan? Can a student renew a title someone has reserved? (Recommended: no.)
4. **Replacement cost** (blocks Phase 4) — Where does the replacement price for a lost book come from? A field on `books`, or entered by the librarian per incident?
5. **Manual login scope** (affects Phase 1) — Convenience or reader-offline fallback only? Currently built as convenience.
6. **Reservation cap** — Can a student hold multiple reservations at once? Any limit?
7. **Soft hold expiry vs. QR expiry** — Confirm they are the same 2-minute window, and that "I'm getting the book" extends both.

---

## Build order summary

```
Phase 1  Schema + status machine + dual auth      ← foundation, everything depends on it
Phase 2  Borrow happy path                        ← the demo everyone wants to see
Phase 3  Blocking checks                          ← makes Phase 2 correct
Phase 4  Returning + fines + reshelving           ← closes the loop
Phase 5  Reservations                             ← builds on 2 and 4
Phase 6  Session + kiosk hardening                ← makes it deployable
Phase 7  Guests                                   ← smallest surface, safe to do last
```

**Do not skip ahead.** Phase 3 in particular looks optional during a demo and is the reason the system is trustworthy in production.
