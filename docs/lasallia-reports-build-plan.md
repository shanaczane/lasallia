# Lasallia — AI-Assisted Report Generation Module: Phased Build Plan

**Audience:** Claude Code
**Stack:** Next.js (frontend) + FastAPI (backend) + Supabase/Postgres
**Surface:** Librarian dashboard only (`/librarian/reports`).
**How to use this doc:** Build **one phase at a time**. Do not start a later phase until the current phase's acceptance criteria all pass. Only Phase 1 is designed so far — later phases are named but not yet specified; plan each one for real (grounded in the codebase at the time) before building it, the same way Phase 1 below was planned.

---

## Starting point (found before Phase 1 was designed)

This module is **not greenfield**. `apps/web/app/librarian/reports/page.tsx` (Sprint 5.6) already has a mature UI: a drag-and-drop sortable grid of 4 report cards (Catalogue Overview donut, Circulation Summary bar, Top Patrons list, Borrowing Trends line — all hand-rolled SVG via `@dnd-kit`), an Overdue Books table, and a filter bar (date range, Category, Program, Year Level). The filter bar is explicitly commented `"not yet wired to the data below"`, and every chart is derived **client-side** from three unfiltered full-table fetches (`fetchBooks()`, `fetchLoans()`, `fetchPatrons()`). No backend report/stats endpoint exists anywhere — `apps/api/routers/` has no `reports.py`.

The functional requirements describe 8 report types: catalogue reports, shelf lists, weeding logs, wishlist and request monitoring, transaction statistics, library statistics, top patron records, circulation reports — plus AI-generated summaries and AI-flagged outdated/inactive books.

---

## Phase 1 — Real backend, wired filters, two new report types

**Goal:** Replace "fetch everything, derive in the browser" with real filterable backend endpoints, and add the two report types the current UI is missing that today's schema already supports.

### Scope decisions

- **Wishlist & request monitoring — out of scope for this whole plan until its own prerequisite feature exists.** No underlying feature exists at all (no table, no student-facing "request a book" flow). This report type needs a new product feature built first, not just a report view.
- **Weeding logs — deferred to a later phase.** Needs a new `books` schema concept (no archived/withdrawn status exists today) plus AI flagging logic.
- **Real backend endpoints — yes, this phase.** New filterable, aggregate-returning endpoints so date-range/category/program/year-level filters actually work, replacing the client-side-only approach.
- **AI-generated summaries — deferred to a later phase.** Consistent with how every other AI-touching feature in this codebase followed a solid deterministic pass first (chatbot's retrieval-only Phase 1, recommendations' content-only Phase 3 before Phase 4's collaborative boost). This phase is the data/filtering foundation; AI narration layers on top once it exists.

This phase covers the 6 report types buildable against today's schema: catalogue, circulation, transaction statistics, library statistics, shelf lists (new), top patron records — reusing `profiles.program` and `profiles.year_level` (both already exist) for the program/year-level filters.

### Backend

**`apps/api/core/reports.py` (new)** — aggregation logic, following this codebase's established pattern (`core/recommendations.py`, `core/similarities.py`): fetch filtered rows via the admin client with embeds, aggregate in Python — no SQL `GROUP BY` through PostgREST, same reasoning as every prior aggregation in this codebase.

A shared filter set: `date_from`, `date_to` (applied to `loans.borrowed_at` for loan-centric reports), `category` (applied to `books.category`), `program`, `year_level` (applied via `loans.student_id → profiles`, only relevant to loan-centric reports — book-centric reports like catalogue/shelf-list don't have a program/year_level dimension of their own, and the UI needs to say so plainly rather than silently ignoring the filter).

Functions — each a direct server-side port of an existing `derive*` function in `reports/page.tsx` (same shape, same output type), plus three new ones:
- `catalogue_report(admin, filters) -> CatalogueSlice[]` — ports `deriveCatalogue`.
- `circulation_summary(admin, filters, months=6) -> Bucket[]` — ports `deriveMonthlyCirculation`.
- `borrowing_trends(admin, filters, weeks=8) -> Bucket[]` — ports `deriveWeeklyTrend`.
- `top_patrons(admin, filters, limit=5) -> TopPatron[]` — ports `deriveTopPatrons`.
- `overdue_rows(admin, filters) -> OverdueRow[]` — ports `deriveOverdueRows`.
- `library_stats(admin, filters) -> LibraryStats` — **new**: total_titles, total_copies, active_borrowers, overdue_count, utilization_rate (copies on loan / total copies), most_active_category. Same data the page's `quickStats` tiles already compute inline, pulled into its own filterable report rather than static dashboard tiles.
- `transaction_stats(admin, filters) -> TransactionStats` — **new**: total transactions in period (loans + reservations), breakdown by type, average loan duration (`returned_at - borrowed_at` for completed loans). Distinct from circulation (volume over time) — this is aggregate counts/rates for a period.
- `shelf_list(admin, filters) -> list[ShelfListRow]` — **new**: books ordered by `call_number`/`shelf_location`, filterable by `floor`/`aisle`/`category`, for a physical shelf-reading printout. Pulls straight from `books`, no loan join needed. Includes `accession_no` even though it's deliberately withheld from the public catalog (borrowing-station design) — this endpoint is librarian-only, and matching physical labels is the whole point of a shelf list.

**`apps/api/schemas/reports.py` (new)** — Pydantic response models mirroring the frontend's existing local types exactly (`CatalogueSlice`, `Bucket`, `TopPatron`, `OverdueRow`, plus new `LibraryStats`, `TransactionStats`, `ShelfListRow`). Keeping field names identical to what `reports/page.tsx` already uses is what makes the frontend change a data-source swap, not a rewrite.

**`apps/api/routers/reports.py` (new)** — all endpoints gated by `require_librarian` (`core/deps.py:88`, already used by `routers/patrons.py` — reused as-is, no new auth pattern). Filters as optional query params (`date_from`, `date_to`, `category`, `program`, `year_level`):

```
GET /reports/catalogue
GET /reports/circulation-summary?months=6
GET /reports/borrowing-trends?weeks=8
GET /reports/top-patrons?limit=5
GET /reports/overdue
GET /reports/library-stats
GET /reports/transactions
GET /reports/shelf-list?floor=&aisle=
```

### Frontend

**`apps/web/lib/reports.ts` (new)** — fetch functions mirroring the endpoints above, each accepting a shared `ReportFilters` type built from the page's existing filter state (resolving the `dateRange` quick-select — week/month/semester/custom — to actual `from`/`to` ISO dates, same as the filter bar already tracks). Same `authHeaders()`/`parseErrorOrThrow` pattern as every other `lib/*.ts` file (e.g. `lib/reservations.ts`).

**`apps/web/app/librarian/reports/page.tsx`**:
- The filter state (`dateRange`, `fromDate`, `toDate`, `category`, `program`, `yearLevel`) already exists — becomes the dependency array for a new `useEffect` that calls the `lib/reports.ts` functions and stores results in state, replacing the current `useMemo(() => derive*(...), [...])` calls. The chart components (`DonutChart`, `BarChartViz`, `LineChartViz`, `TopPatronsList`, `OverdueTable`) keep their exact current prop shapes — **none of them need to change**, only what feeds them does. The local `derive*` functions get deleted (moved to `core/reports.py`), not duplicated.
- Two new cards added to `cardDefs`: **"Library Statistics"** (stat-tile style, matching the page's own existing `quickStats` visual pattern) and **"Shelf List"** (a plain sortable table, not a chart — a shelf list is read/carried while walking the stacks, not visualized). A **"Transaction Statistics"** stat block is added alongside Library Statistics rather than as a 7th DnD card, since it's a handful of numbers, not a chart.
- Simple client-side CSV export (a small `toCsv(rows) -> string` + Blob-download helper, no new backend/library needed) wired to the Shelf List and the Overdue table — their most realistic real-world use ("print and carry" / "hand to the counter"), and directly serves the requirement's "without manually compiling records" goal.
- Program/year-level filter dropdowns get a small inline note when applied to catalogue/shelf-list ("book-level reports aren't filtered by program/year level") rather than silently no-op'ing — keeps the UI honest about what each filter actually does, same principle applied elsewhere in this codebase (e.g. the recommendations module's rung-aware subtitles never claim personalization that didn't happen).

### Not built this phase

- Weeding logs (new archived/withdrawn schema + AI flagging) — later phase.
- Wishlist & request monitoring — needs its own feature plan first.
- AI-generated report summaries — later phase, once the data foundation above is real. `core/recommendations.py`'s borrow-count-in-a-window pattern (`POPULAR_LOOKBACK_DAYS`-style constant, `_borrow_counts`) is the natural model to build the "flag outdated/inactive" heuristic on when that phase comes, with AI narrating the heuristic's output rather than deciding from scratch.
- PDF export — only CSV this phase (no PDF library in `requirements.txt`, and CSV covers the realistic "shelf-walk" and "hand to counter" use cases already).

### Verification

- Syntax/import-check the new backend files; confirm all 8 routes register under `/reports` and are 403'd for a non-librarian caller (reuse `require_librarian`'s existing behavior, already proven by `routers/patrons.py`).
- Direct comparison test: for at least catalogue/circulation/top-patrons, confirm the new backend endpoint's output (unfiltered) matches what the OLD client-side `derive*` functions currently produce from the same data — proves the port is faithful, not just "runs without erroring."
- No migration is needed this phase (no schema changes) — confirm that's actually still true once the design is final.
- `tsc --noEmit` on `apps/web` after the frontend rewiring.
- Manually exercise each filter combination in the browser (date range presets + custom, category, program, year level) and confirm the charts/tables actually change, including the new Library Statistics / Transaction Statistics / Shelf List cards and the two CSV export buttons.

---

## Later phases (named, not yet specified)

- **Phase 2 — Weeding logs.** New `books` status/flag for archived/withdrawn, plus AI flagging of outdated/inactive titles (heuristic: low/zero borrow count over a lookback window + old `published_year`/`created_at`, narrated by AI rather than decided by it).
- **Phase 3 — AI-generated report summaries.** Natural-language summaries of each report (reuses this codebase's existing OpenAI patterns — `gpt-4o-mini`, the lazy `OPENAI_API_KEY` check in `core/config.py`, the tool-calling shape in `core/tools/registry.py` if structured output is wanted).
- **Wishlist & request monitoring** — not a phase of this plan. Needs its own separate feature plan (a student-facing "request a book" flow) before a report on it means anything.

Plan each of these for real against the codebase's state at the time, the same way Phase 1 was grounded in what `reports/page.tsx` and `apps/api` actually looked like before writing it.
