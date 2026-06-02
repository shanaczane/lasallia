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

Examples:
```bash
feat: add book catalog page
fix: qr scan not updating book status
chore: add supabase client config
docs: update local setup guide
refactor: extract chatbot logic into service
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