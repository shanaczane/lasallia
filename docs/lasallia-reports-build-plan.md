# Lasallia — AI-Assisted Report Generation Module: Phased Build Plan

**Audience:** Claude Code
**Stack:** Next.js (frontend) + FastAPI (backend) + Supabase/Postgres
**Surface:** Librarian dashboard only (`/librarian/reports`).
**How to use this doc:** Build **one phase at a time**. Do not start a later phase until the current phase's acceptance criteria all pass. Phases 1 and 2 are built; Phase 3 is planned but not yet built. Plan each later phase for real (grounded in the codebase at the time) before building it, the same way Phase 1 was planned before it was built.

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

## Phase 2 — Weeding logs 

**Goal:** A way to flag old, rarely-borrowed books as weeding candidates, and let a librarian act on that — archive, restore, or dismiss — with every action logged.

### Scope decisions

- **Reused, didn't reinvent, existing UI.** `apps/web/components/ui/catalog/DeleteBookModal.tsx` already had an "Archive (recommended)" vs "Permanently delete" choice, with copy already promising "hides from catalog... can be restored later" — but it was pure local-state, wired to nothing (a comment marked the whole catalog page's add/edit/archive/delete as waiting on a separate, unrelated "Sprint 9.1"). This phase wires **only** the Archive button to a real endpoint, matching the terminology and behavior the UI already promised.
- **Permanent delete, Add, and Edit stay out of scope.** Real data destruction (delete) and full book CRUD (add/edit) belong to that separate "Sprint 9.1" backlog item, not this Reports plan. Left as the pre-existing local-only stubs.
- **No dedicated "browse archived books" page.** Restore lives as an action directly in the Weeding log table instead of a new management screen — smaller surface, same capability.
- **`books.status` not reused for "archived."** That column is already largely vestigial (`routers/books.py`'s `_apply_real_availability` overwrites it in-memory from `book_copies` on every read), and `'Archives'` is already a `collection_type` value with a different meaning (a physical section). A new nullable `archived_at timestamptz` avoids both collisions.

### Backend

**Migration `0022_weeding.sql`** — `books.archived_at` (nullable timestamp — archived vs not), `books.weeding_dismissed_at` (separate column: "keep this book, don't flag it again" is not the same state as "remove it from the catalog"), and an append-only `weeding_events` table (`book_id`, `event_type` in `archived`/`restored`/`dismissed`, `reason`, `performed_by`, `occurred_at`) — the actual "log" the phase is named after.

**`apps/api/core/weeding.py` (new)**:
- `find_weeding_candidates(admin) -> list[WeedingCandidateData]` — live heuristic scan, no precompute (a librarian-triggered report can tolerate live computation; it doesn't have Phase 5-of-the-recommendations-plan's student-facing latency budget). A book qualifies if it has ≤1 borrow in the last 24 months **and** is 5+ years old (by `published_year`, falling back to `created_at`). Thresholds are named constants (`WEEDING_LOOKBACK_MONTHS`, `WEEDING_MAX_BORROWS_IN_WINDOW`, `WEEDING_MIN_AGE_YEARS`) — a librarian policy call, not a technical one, kept in one place like the recommendations plan's `COOCCURRENCE_ALPHA`.
- `narrate(candidate) -> str` — `gpt-4o-mini` restates the heuristic's own facts in one plain sentence; the system prompt requires restating *every* given fact and forbids adding anything not given. Falls back to the raw heuristic string (`heuristic_reason`) if `OPENAI_API_KEY` isn't set or the call fails for any reason — the feature works with zero AI involvement, same "must degrade, never blank" principle the recommendations plan states outright.
- `archive_book` / `restore_book` / `dismiss_candidate` — each updates the relevant column and appends one `weeding_events` row.

**`apps/api/routers/weeding.py` (new)** — `require_librarian` throughout:
```
GET  /weeding/candidates
GET  /weeding/events
POST /weeding/{book_id}/archive
POST /weeding/{book_id}/restore
POST /weeding/{book_id}/dismiss
```

**Archived books excluded from every catalog-facing read**, not just the report: `routers/books.py` (`GET /books`, `GET /books/{id}` — 404s for non-librarians, still viewable by librarians so they can restore), `core/embeddings.py`'s `semantic_search` (shared by public search and the chatbot's `search_catalog` tool), `core/tools/book_details.py` (both the direct lookup and the "nearby on shelf" neighbor pool), and `core/reports.py`'s catalogue/library-stats/shelf-list (the collection snapshots — archived titles are no longer part of the active collection anywhere). Historical loan-centric reports (circulation, top patrons, overdue) deliberately do **not** filter archived books out of past activity — a loan that happened before a title was archived is still a real historical event.

### Frontend

- **`apps/web/lib/weeding.ts` (new)** — fetch layer, same pattern as every other `lib/*.ts` file.
- **`DeleteBookModal`'s Archive button, wired for real** in both `librarian/catalog/page.tsx` and `librarian/catalog/[bookId]/page.tsx` — local state only updates after the request actually succeeds, not optimistically before.
- **New "Weeding" tab on the Reports page** (`WeedingPanel`, alongside Overview/Overdue Books): a card per candidate (title, author, category, published year, the AI-narrated reason, Keep/Archive buttons), and the Weeding Log table below it (book, action, who, when, with a Restore action on archived rows).

### Verification

- Migration applied and confirmed (`books.archived_at`/`weeding_dismissed_at`, `weeding_events` all queryable).
- Heuristic run against real data: 38 candidates out of 185 books — plausible given the sparse real borrow history (`docs/data-audit.md`).
- AI narration checked for fact-fidelity directly — caught it dropping the "published year" fact on the first pass (restated only the borrow count), tightened the prompt to require every given fact, re-verified fixed.
- 403 confirmed for a non-librarian caller.
- Full round trip verified directly: archiving a real book removed it from `GET /books` immediately, dropped it out of the candidate list, and logged the event with the acting librarian's name; restoring brought it back; dismissing removed it from future candidate scans without archiving it. Test data cleaned up afterward.
- `tsc --noEmit` and `next build` both clean.
- Not verified: actual browser click-through (no browser tool available this session) — the candidate cards, Keep/Archive buttons, and log table are unverified visually.

---

## Phase 3 — AI-generated report summaries (planned, not yet built)

**Goal:** A one- or two-sentence, plain-English summary above each report — the same "AI narrates a deterministic result, never decides or computes it" boundary already held to by the chatbot, recommendations, and Phase 2's weeding narration.

### Scope decisions

- **Which reports get a summary:** Catalogue Overview, Circulation Summary, Top Patrons, Borrowing Trends, Library Statistics, Transaction Statistics, Overdue Books — seven narrative-friendly reports. **Not** Shelf List (a raw listing, nothing to narrate) and **not** Weeding Candidates (already has its own per-candidate AI narration from Phase 2 — a report-level summary on top would be redundant).
- **On-demand, not automatic.** Firing 7 LLM calls every time a librarian nudges a filter dropdown is wasteful and slow. A single " Generate Insights" action computes all 7 at once; changing any filter afterward invalidates the shown summaries (cleared, not left stale next to numbers that no longer match them) rather than silently leaving old AI text next to new charts.
- **Backend re-derives the data it narrates — never trusts client-supplied numbers.** The frontend already has all 7 report payloads in hand (it just rendered them), but summaries are computed from a fresh server-side call to the same `core/reports.py` functions, not from whatever the client sends. Trusting client-supplied figures would mean AI could narrate fabricated numbers as if authoritative — the same reasoning that keeps every other AI feature in this codebase grounded in a real, server-verified retrieval step first.
- **Graceful, silent degradation.** No `OPENAI_API_KEY`, or any individual call fails: that report's summary is simply absent (`null`), no error surfaced, same "must degrade, never blank" principle as Phase 2's narration fallback — except here there's no deterministic-text fallback to substitute, since a "summary" isn't something the non-AI layer produces on its own, so the honest behavior is just showing nothing for that card.

### Backend

**`apps/api/core/report_summaries.py` (new)** — one generic function, not seven near-duplicate ones:
- `summarize(report_name: str, payload: BaseModel | list[BaseModel]) -> str | None` — serializes whatever `core/reports.py` already returned for that report into compact text, sends it to `gpt-4o-mini` with a system prompt that forbids stating any number not present in the payload, returns `None` on missing key or any failure (mirrors `core/weeding.py`'s `narrate`'s try/except-and-fall-back shape, except there's no heuristic string to fall back to here).

**`apps/api/schemas/reports.py` (extend)** — `ReportSummaries` model, one optional string field per summarized report (`catalogue`, `circulation`, `top_patrons`, `borrowing_trends`, `library_stats`, `transactions`, `overdue`).

**`apps/api/routers/reports.py` (extend)** — `GET /reports/summaries`, same query params (`date_from`, `date_to`, `category`, `program`, `year_level`) and `report_filters` dependency as every other endpoint here. Internally calls the seven existing `core/reports.py` functions with those filters (recomputing, not reusing anything client-supplied) and narrates each — run concurrently (`ThreadPoolExecutor`, same pattern `core/recommendations.py` already uses for parallel Supabase calls) so seven sequential `gpt-4o-mini` round trips don't stack into multi-second latency.

### Frontend

- **`apps/web/lib/reports.ts` (extend)** — `fetchReportSummaries(filters) -> ReportSummaries`.
- **`apps/web/app/librarian/reports/page.tsx`**: a "✨ Generate Insights" button near the filter bar. On click, fetches summaries for the current filters into new state; each card (and the Overdue tab) renders its one-line summary when present, nothing when `null`. The summaries state resets to empty whenever any filter changes, so a stale AI sentence can never sit next to numbers it no longer describes.

### Not built this phase

- Weeding Candidates keeps its own Phase 2 narration; not touched here.
- No summary persistence/history — regenerated live each time, not stored (unlike Phase 2's `weeding_events`, there's no audit-trail reason to keep old summaries around).
- No structured/tool-calling output — plain text summaries are enough for what this phase needs; `core/tools/registry.py`'s tool-calling shape stays an option for later if a future phase wants the AI to *select* which numbers to highlight rather than just narrate everything it's given.

### Verification (planned)

- Fact-fidelity check per report type, same method Phase 2's narration used: generate a summary against known real data, confirm every number it states is actually present in the source payload.
- Confirm `GET /reports/summaries` returns `200` with all-`null` fields (not a `500`) when `OPENAI_API_KEY` is unset.
- 403 for a non-librarian caller.
- Confirm frontend clears shown summaries on any filter change, before the next "Generate Insights" click.
- `tsc --noEmit` and `next build` clean.

---

## Wishlist & request monitoring

Not a phase of this plan. Needs its own separate feature plan (a student-facing "request a book" flow) before a report on it means anything.
