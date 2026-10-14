# Inventory Module — Build Plan

Librarians scan a shelf with a barcode scanner or webcam and see which books are **Found**, **Misplaced** (on the wrong shelf) or **Not Found**, then act on the results with one click.

Source: the librarian survey asked for "an inventory management feature to support book inventory, barcode scanning, and the monitoring of available, missing, and misplaced library materials." Live planning doc (with comments): https://claude.ai/code/artifact/f07dca4c-6273-4fc3-884b-a61937d64b9c

## Build status

All 10 tasks are built. **The inventory screens won't work until you apply the three migrations.**

| | Status |
|---|---|
| Migrations 0053–0055 | Written. **To do:** run each one in the Supabase SQL editor, in number order. |
| API (`routers/inventory.py`, `core/inventory.py`, `/reports/inventory*`) | Built. The scan / finish / resolve logic was tested against an in-memory fake database, not the real one. |
| Inventory pages, webcam scanner, Reports tab, dashboard cards, Misplaced status | Built. `tsc` and `pnpm build:web` pass. |
| Google sign-in (Task 10) | Built behind `NEXT_PUBLIC_GOOGLE_CLIENT_ID`. Until it's set, the old Supabase redirect is used. **To do, in order:** (1) Google Cloud Console → Credentials → the Web client → add `https://www.lasallia.com`, `https://lasallia.com` and `http://localhost:3000` under *Authorized JavaScript origins*. (2) Check that Supabase → Authentication → Providers → Google lists that same client ID. (3) Set `NEXT_PUBLIC_GOOGLE_CLIENT_ID` in Vercel and redeploy. (4) Fill in OAuth Branding (name "Lasallia", logo, `lasallia.com` as an authorized domain, home page and privacy links) and submit for verification. |
| Acceptance test | **To do:** run a check on one real aisle with a librarian. |

One behaviour to know: when a scan finds a missing, misplaced or waiting-to-be-reshelved copy **on its own shelf**, the copy goes straight back into circulation. It goes through the same `reshelve_copy_now` helper as the Reshelving scan, so a waiting reservation still gets the copy first. The Mark Found button (no scan at the shelf) only sends a copy to the Reshelving Queue.

## Decisions

| # | Question | Decision |
|---|---|---|
| 1 | Supabase address on the Google sign-in screen | Google shows `heuobszggqjfkmhlztox.supabase.co` because the OAuth redirect goes through Supabase. Fix for free: Google's own sign-in button on www.lasallia.com and `supabase.auth.signInWithIdToken`. You also need to set up OAuth Branding in the Google Cloud Console (see Task 10). |
| 2 | What a check covers | **One aisle, or a whole floor**, using `books.floor` + `books.aisle`. Real data: every book is on Floor 2, in Aisles 1–12, and 10 books have no aisle. `book_copies.shelf_location` is always "Unassigned", so the book's location is the only source. |
| 3 | Which copies are expected on the shelf | Every copy in that location except `on_loan`, `overdue`, `reserved` (they're on the hold shelf) and `lost`. `missing` copies **are** expected, so a found one can be recovered. |
| 4 | Can a misplaced copy be borrowed? | Not at the kiosk, which only claims `available` copies. At the desk, yes: `misplaced → on_loan` is allowed. |
| 5 | Scanning a copy recorded as on loan | Warn "Recorded as on loan — check it in first" and change nothing. |
| 6 | Two librarians on one check | Allowed (same session from two devices). Only one open check per location at a time. |
| 7 | CSV export | Two exports: a summary (one row per check) and details (one row per copy). |
| 8 | Hardware | A laptop. Every book has a barcode sticker with its accession number. Two input options: a **USB barcode scanner**, which types like a keyboard so it works through the existing `ScannerListener`, and the **webcam**, through the ZXing decoder, because Chrome on Windows has no built-in camera barcode reader. |
| 9 | Rename the book-level `misplaced` value | Yes. The book-level `books.status = 'misplaced'` (shown as "Missing" in the UI) becomes `missing`. **Misplaced** now only means a copy on the wrong shelf. |

## How a check works

1. **Start:** the librarian picks Floor 2 · Aisle 3. One `pending` row is added to `inventory_items` for every expected copy. This saves the expected list at that moment, so later borrowing doesn't change it.
2. **Scan:** each scan looks up `book_copies.accession_number`.
   - It belongs here: the row becomes **found**. A `missing` copy that turns up also returns to `for_reshelving`.
   - It belongs elsewhere: a new row is added (`expected = false`, result **misplaced**), the copy's status becomes `misplaced`, and the screen shows where it belongs.
   - It's recorded as on loan, overdue or reserved: show a warning and record nothing (decision 5).
   - An unknown barcode or a repeat scan gets a clear message, and nothing is double counted.
3. **Finish:** every row still `pending` becomes **not_found**.
4. **Resolve:** on each Not Found or Misplaced row, **Mark Missing** or **Mark Found** updates the row and the copy's status in one click.

## Data model

| Migration | What it does |
|---|---|
| `0053_inventory_sessions.sql` | One row per check: `floor`, `aisle` (null means the whole floor), `status` (`in_progress` / `completed` / `cancelled`), `started_by`, `started_at`, `completed_at`. A partial unique index allows only one open check per location. |
| `0054_inventory_items.sql` | One row per copy in a check: `session_id`, `book_copy_id` (unique per session), `expected`, `result` (`pending` / `found` / `misplaced` / `not_found`), `expected_location`, `scanned_at`/`scanned_by`, `resolution` (`marked_missing` / `marked_found`), `resolved_at`/`resolved_by`. |
| `0055_misplaced_copy_status.sql` | Adds `misplaced` to `book_copies.status`. Re-creates the status trigger (from 0051) with the new moves `available`/`for_reshelving` → `misplaced` and `misplaced` → `for_reshelving` / `on_loan` / `missing`. Renames the book-level `misplaced` to `missing`. |

Both new tables have RLS turned on with **no policies**. Only the service-role client can read or write them, and every request goes through `require_librarian`, the same pattern as `book_requests` (0039).

Migrations are applied by hand in the Supabase SQL editor, in number order.

## Tasks

| # | Task | Backend (`apps/api`) | Frontend (`apps/web`) |
|---|---|---|---|
| 1 | Inventory page in the sidebar | `routers/inventory.py`, librarian only | Inventory entry under Operations in `LibrarianLayout.tsx`; `app/librarian/inventory/page.tsx` lists checks |
| 2 | Choose a shelf or aisle and start | `GET /inventory/locations`, `POST /inventory/sessions` | Location picker showing copy counts |
| 3 | Scan marks a copy Found | `POST /inventory/sessions/{id}/scan` | Scan screen with a USB scanner / webcam toggle, live counters, recent scans |
| 4 | Wrong-shelf scan shows Misplaced and where it belongs | Same scan endpoint | "Misplaced — belongs in Floor 2 · Aisle 7" |
| 5 | Unscanned copies become Not Found | `POST /inventory/sessions/{id}/complete` | Finish button with a confirmation step; results grouped Found / Misplaced / Not Found |
| 6 | One-click Mark Missing or Found | `POST /inventory/items/{id}/resolve` | Two buttons on each Not Found / Misplaced row |
| 7 | Misplaced shown in the catalog and copy tables | Migration 0055, `_derive_status` | Pill, filters and the copy table on the book page |
| 8 | Inventory tab in Reports with CSV | `GET /reports/inventory`, `GET /reports/inventory/items` | `inventory` tab on `ReportTableCard` |
| 9 | Dashboard Missing / Misplaced counts | `GET /inventory/counts` | Two count cards on the librarian dashboard |
| 10 | Remove the Supabase address from Google sign-in | none | Google Identity Services button + `signInWithIdToken` in `lib/auth.ts`. You also set up OAuth Branding in the Google Cloud Console: app name "Lasallia", logo, `lasallia.com` as an authorized domain, a support email you're happy to show, then submit for brand verification. |

## Build order

1. Migrations 0053–0055 and the `misplaced` → `missing` rename
2. The start → scan → finish → resolve flow (tasks 1–6)
3. The screens that show results (tasks 7–9)
4. Task 10, which doesn't depend on the rest and can go at any point
5. Acceptance: run a check on one real aisle with a librarian

## Survey feedback not covered here

| Survey point | Possible next step |
|---|---|
| Accuracy of AI answers | Extend the chatbot evals in `apps/api/evals/` with questions from library staff, and show sources on answers |
| User-friendliness and accessibility | Test the student and kiosk pages with a keyboard and a screen reader, and check text contrast |
| Data privacy and security | Write up the existing protections (RLS, the 3-student rule in recommendations, server-side identity) |
| Integration with existing library systems | Catalog Import (MARC, spreadsheet) already exists. Ask which system the LRC uses now. |
| Testing with library personnel | The acceptance check on a real aisle, above |
