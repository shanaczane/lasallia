# Conventions

## Commit Messages

Format: `type: short description`

| Prefix | When to use |
|---|---|
| `feat:` | new feature |
| `fix:` | bug fix |
| `chore:` | setup, config, dependencies |
| `docs:` | documentation only |
| `refactor:` | code change, no new feature |
| `style:` | formatting, no logic change |
| `test:` | adding tests |

Always include the sprint number at the end in parentheses:

```bash
feat: add book catalog page (sprint 2.1.3)
fix: qr scan not updating book status (sprint 2.1.2)
chore: add supabase client config (sprint 2.1.1)
docs: update local setup guide (sprint 2.1.1)
refactor: extract chatbot logic into service (sprint 2.2.1)
```

---

## Naming Conventions

| Thing | Convention | Example |
|---|---|---|
| DB tables | `snake_case` | `borrow_transactions` |
| DB columns | `snake_case` | `due_date`, `user_id` |
| React components | `PascalCase` | `BookCard.tsx` |
| TS variables/functions | `camelCase` | `fetchBookById` |
| Python functions/vars | `snake_case` | `get_book_by_id` |
| Next.js API routes | `kebab-case` | `/api/borrow-request` |
| FastAPI routes | `snake_case` paths | `/books/search` |
| Supabase RLS policies | `snake_case` descriptive | `students_read_own_history` |
| Env vars | `SCREAMING_SNAKE_CASE` | `OPENAI_API_KEY` |

---

## Folder Structure
lasallia/
├── apps/
│   ├── web/          # Next.js frontend
│   └── api/          # FastAPI backend
├── packages/
│   └── types/        # Shared TypeScript types split by domain
└── docs/
├── setup/        # Local setup and env docs
└── architecture/ # System design docs

---

## TypeScript Types

All shared types live in `packages/types/`. They are split by domain:

- `auth.ts` — authentication types
- `book.ts` — book and catalog types
- `borrow.ts` — borrow transaction types
- `reservation.ts` — reservation types
- `notification.ts` — notification types
- `chatbot.ts` — chatbot message and log types
- `recommendation.ts` — recommendation types
- `user.ts` — user profile and role types

Import from the package directly:
```ts
import { Book, BookStatus } from '@lasallia/types'
```

---

## Branch Naming
main          — production ready code only
dev           — active development, merge here first
feat/xxx      — new features
fix/xxx       — bug fixes
chore/xxx     — setup and config changes

Always branch off `dev`, never commit directly to `main`.

---

## Component Library

We use [shadcn/ui](https://ui.shadcn.com/) with Radix UI as our base component system.

**Ownership:** shadcn components are copied into the codebase — they are not an npm dependency. This means we own and can freely modify them.

| Location | Contents |
|---|---|
| `components/ui/` | Base shadcn/ui components (Button, Input, Dialog, etc.) |
| `components/ui/pills/` | Lasallia-specific components (e.g. availability pills) |

**Theming:** All shadcn components are skinned via CSS variables defined in `globals.css` under `:root`. These map directly to our design tokens. Do not hardcode colors or spacing in component files — use the token variables.

```css
/* Example: use tokens, not raw values */
background-color: hsl(var(--primary));   /* correct */
background-color: #4f46e5;               /* wrong */
```

When adding a new shadcn component, run the shadcn CLI to copy it in, then adjust its CSS variable references to align with our token naming in `globals.css`.

### How shadcn works (new teammate primer)

shadcn is **not** a normal component library. There is no `shadcn` package in `node_modules`. Instead, the CLI copies component source directly into your codebase.

**Adding a component:**
```bash
pnpm dlx shadcn add button
# → writes apps/web/components/ui/button.tsx
# → you own this file now
```

**The theming chain — how `bg-primary` becomes DLSL green:**

```
globals.css :root
  --primary: #006F3C        ← our green-700 design token

     ↓ mapped to

Tailwind config
  colors.primary → var(--primary)

     ↓ consumed by

button.tsx
  className="bg-primary"    ← resolves to #006F3C automatically
```

Every shadcn Tailwind class (`bg-primary`, `text-foreground`, `border-input`, etc.) is backed by a CSS variable in `globals.css`. Changing a token value there updates every component that uses it.

**Rules:**
- To add a component: `pnpm dlx shadcn add [component-name]`
- To customize a component: edit the file in `components/ui/` directly
- Never touch `node_modules` for component changes — shadcn components live in our codebase, not there
- Never hardcode color values in component files; always use the Tailwind token classes