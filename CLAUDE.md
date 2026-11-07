# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Monorepo Structure

This is a pnpm workspace with three packages:

- **`apps/web`** — Next.js 16 frontend (Turbopack, App Router, Tailwind CSS v4)
- **`apps/api`** — FastAPI backend (Python, Supabase, scikit-learn, OpenAI)
- **`packages/types`** — Shared TypeScript types consumed by `apps/web` as `@lasallia/types`

`apps/web` talks to the real API through `lib/*.ts`. Routers are in `apps/api/routers`, logic in `apps/api/core`, SQL migrations in `apps/api/migrations` (run by hand in the Supabase SQL editor, in number order) and scheduled SQL in `supabase/cron`.

## Commands

All commands run from the **repo root** using pnpm.

```bash
# Frontend
pnpm dev:web          # starts Next.js dev server at localhost:3000
pnpm build:web        # production build of apps/web

# Backend
pnpm dev:api          # starts FastAPI dev server (uvicorn)

# Run a single workspace's scripts directly
pnpm --filter web <script>
pnpm --filter api <script>

# Install dependencies (always from root — never run pnpm install inside apps/)
pnpm install
pnpm add <pkg> --filter web   # add to apps/web
pnpm add <pkg> --filter api   # add to apps/api (Python packages go in requirements.txt)
```

Tests:

```bash
# API, from apps/api. Fakes the database with tests/fake_supabase.py.
venv/Scripts/python.exe -m pytest

# Also runs tests/db (real SQL, RLS) against a throwaway Postgres. Never the
# Supabase project: those tests drop the public schema.
$env:TEST_DATABASE_URL = "postgresql://..."; venv/Scripts/python.exe -m pytest

# Web, from the repo root
pnpm --filter web test
```

## Deployment

- Deployed to Vercel with Root Directory set to `apps/web` in the Vercel dashboard.
- `apps/web/vercel.json` contains `{ "framework": "nextjs" }` only.
- `installCommand` in Vercel is `cd ../.. && pnpm install` (set in dashboard) to install from the workspace root so `@lasallia/types` resolves.
- `ENABLE_EXPERIMENTAL_COREPACK=1` is set as an env var in Vercel; `"packageManager": "pnpm@11.5.0"` in the root `package.json` pins the pnpm version.
- The root `pnpm-lock.yaml` uses pnpm v9 lockfile format; Vercel logs "Error while parsing config file" for it but this is a cosmetic warning — the build succeeds.

## Frontend Architecture (`apps/web`)

### Role-based layout system

Three user roles each have a Next.js route group with its own layout wrapper:

| Route prefix | Layout component | Notes |
|---|---|---|
| `/librarian/*` | `LibrarianLayout` | Collapsible sidebar (persisted in localStorage), Quick Scan card, Sign out button |
| `/student/*` | `StudentLayout` | Sidebar navigation |
| `/guest/*` | `GuestLayout` | Minimal layout |

Each role's `layout.tsx` (e.g. `app/librarian/layout.tsx`) instantiates the layout component; the signed-in user replaces its placeholder props on the client.

`TopNav` is shared across all three layouts — it is not used standalone.

`apps/web/proxy.ts` is Next.js 16's name for `middleware.ts` (don't add one). It reads the client-set `lasallia_role` cookie, so it's a UI convenience only; the API is the real boundary.

### Librarian profiles

The LRC shares one librarian login (`profiles.role = 'librarian'`). Each librarian has a row in `librarian_profiles` and proves who they are with a PIN or staff ID tap on the "Who is using Lasallia?" screen (`LibrarianProfileGate`, `LibrarianProfilePicker`). The gate renders nothing else until a profile is active, so no page or poll reaches the API while the picker is showing.

The API returns a signed token, kept in sessionStorage and added to every API call as `X-Librarian-Profile` by the fetch wrapper in `lib/librarianProfile.ts`. Its lifetime is `library_settings.librarian_idle_timeout_minutes`; the browser renews it while the librarian is active.

In `core/deps.py`, `require_librarian_profile` guards every librarian write action and `require_librarian` alone is for read-only pages. `tests/test_librarian_profiles.py` fails if a non-GET librarian route skips it; a genuinely read-only POST must be added to `READ_ONLY_POSTS` there.

### Audit log

Call `log_action(admin, librarian, action, entity_type, entity_id, details)` from `core/audit.py` right after a librarian change is saved, and add new actions to `ACTIONS` there. It never raises. Never put PINs, card ids or tokens in `details`. `audit_log` is append-only, enforced by triggers.

### Design system

All design tokens are CSS custom properties defined in `apps/web/app/globals.css` under `@theme`. Use them inline via `style={{ ... }}` or reference Tailwind utility classes generated from them.

Key tokens:
- **Colors**: `--color-green-{50–900}` (DLSL brand), `--color-ink-{50–900}` (neutrals), `--color-gold-{100,500,600}` (accent), `--color-paper` (page background `#FAFAF5`), status colors (`--color-success`, `--color-warn`, `--color-danger`, `--color-info`)
- **Fonts**: `--font-display` (Fraunces, serif), `--font-body` (Manrope, sans-serif), `--font-mono` (JetBrains Mono)
- **Font sizes**: Named scale from `--text-2xs` (0.625rem) to `--text-7xl` (4rem); always apply with `fontFamily` too
- **Layout**: `--height-nav` (64px), `--width-side` (248px)
- **Shadows**: `--shadow`, `--shadow-sm`, `--shadow-lg`

The pattern for styled text throughout the codebase is always:
```tsx
style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
```
Never use Tailwind's `text-sm` etc. for font sizes — use the CSS variables.

### Component conventions

- All interactive pages are `"use client"` components with local `useState`/`useMemo`.
- `cn()` from `@/lib/utils` (re-exports `clsx` + `tailwind-merge`) is used for conditional class merging everywhere.
- Types from `@lasallia/types` are imported as `import { Book } from '@lasallia/types'`.
- Don't add sprint numbers or ticket tags (e.g. `// Sprint 5.4`, `F18`) to new comments — describe the behavior plainly. Existing `// Sprint …` comments are legacy; leave them unless you're already editing that code.
- Commit messages are plain conventional commits with no sprint or ticket suffix: `fix: scroll to top on catalog pagination`.

### Key components

- **`components/layout/LibrarianLayout.tsx`** — sidebar with collapsible state, Quick Scan card, nav sections (Operations / Manage), sign-out. Renders differently when `collapsed`.
- **`components/ui/catalog/FilterSidebar.tsx`** — exports `CatalogFilters` type and `DEFAULT_FILTERS`; used by catalog pages for genre/availability/format/floor/subject/call-number filtering.
- **`components/ui/catalog/LibrarianBookCard.tsx`** — book card for librarian views with edit/delete actions.
- **`components/chat/shared/`** — shared chat UI (window, input, header, sidebar, message) used by the assistant pages across all three roles.
- **`components/ui/notifications/NotificationContext.tsx`** — React context for notification state.

## Scheduled jobs

- `supabase/cron/loan_reminders_schedule.sql`: daily loan reminders (Edge Function).
- `supabase/cron/recommendation_rebuild_schedule.sql`: pg_cron calls `POST /internal/rebuild-recommendations` at 18:00 UTC (2:00 AM Manila) with `X-Internal-Secret`. It answers 202 and runs similarities, co-borrowing, then recommendations in the background (`core/recommendation_rebuild.py`), recording start, end and step reached in `recommendation_rebuild_runs`.
- Lapsed reservation pickups are swept every minute inside the API (`run_expiry_loop` in `main.py`).
- `jobs/rebuild_all.py` runs the whole rebuild by hand; the other `jobs/rebuild_*.py` run one step.

Reads in the rebuild must use `core/paging.py`: PostgREST returns at most 1000 rows per request. The recommendation values are quoted in the thesis manuscript; `tests/test_recommendation_rebuild.py` pins them. `scripts/explain_recommendations.py` prints a worked example from the same `score_student` the job uses.

## Shared Types (`packages/types`)

All domain types are defined here and exported from `index.ts`. Key types: `Book`, `BookStatus`, `BookFormat`, `BookSearchFilters`, `User`, `BorrowRecord`, `Reservation`, `Notification`, `ChatMessage`, `RecommendationResult`. Changes here affect both frontend and (eventually) the API schema.
