# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Monorepo Structure

This is a pnpm workspace with three packages:

- **`apps/web`** — Next.js 16 frontend (Turbopack, App Router, Tailwind CSS v4)
- **`apps/api`** — FastAPI backend (Python, Supabase, scikit-learn, OpenAI)
- **`packages/types`** — Shared TypeScript types consumed by `apps/web` as `@lasallia/types`

The API is a stub (`main.py` only has a health endpoint). All data in `apps/web` currently uses static mock data from `apps/web/lib/mock/`.

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

There is no test suite yet.

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

Each role's `layout.tsx` (e.g. `app/librarian/layout.tsx`) instantiates the layout component with hardcoded placeholder props (`userName`, `userInitials`, `notificationCount`). These will be replaced with real auth data later.

`TopNav` is shared across all three layouts — it is not used standalone.

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
- Mock data lives in `apps/web/lib/mock/catalog.ts` and `lib/mock/patrons.ts` — comments mark where real API calls replace them.
- Sprint annotations in comments (e.g. `// Sprint 5.4`) track feature ownership — include these when adding new features.
- Commit messages append the sprint number: `feat: description (sprint 5.4)`.

### Key components

- **`components/layout/LibrarianLayout.tsx`** — sidebar with collapsible state, Quick Scan card, nav sections (Operations / Manage), sign-out. Renders differently when `collapsed`.
- **`components/ui/catalog/FilterSidebar.tsx`** — exports `CatalogFilters` type and `DEFAULT_FILTERS`; used by catalog pages for genre/availability/format/floor/subject/call-number filtering.
- **`components/ui/catalog/LibrarianBookCard.tsx`** — book card for librarian views with edit/delete actions.
- **`components/chat/shared/`** — shared chat UI (window, input, header, sidebar, message) used by the assistant pages across all three roles.
- **`components/ui/notifications/NotificationContext.tsx`** — React context for notification state.

## Shared Types (`packages/types`)

All domain types are defined here and exported from `index.ts`. Key types: `Book`, `BookStatus`, `BookFormat`, `BookSearchFilters`, `User`, `BorrowRecord`, `Reservation`, `Notification`, `ChatMessage`, `RecommendationResult`. Changes here affect both frontend and (eventually) the API schema.
