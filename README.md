# Lasallia

[![Live site](https://img.shields.io/badge/live-www.lasallia.com-green)](https://www.lasallia.com)
[![Staging](https://img.shields.io/badge/staging-dev.lasallia.com-blue)](https://dev.lasallia.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-Python-009688?logo=fastapi)](https://fastapi.tiangolo.com)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase)](https://supabase.com)

An AI-powered library system for De La Salle Lipa's Learning Resource Center (LRC): a real-time catalog, borrowing and reservations, personalized book recommendations, an inventory module, and a chatbot that answers library questions with a hybrid rule-based and NLP approach.

- **Live site:** [www.lasallia.com](https://www.lasallia.com) (deployed from `main`)
- **Staging:** [dev.lasallia.com](https://dev.lasallia.com) (deployed from `dev`; shares the production database)

## Who it's for

| Role | What they can do |
|---|---|
| **Students and faculty** | Browse the catalog, borrow (QR code or on their phone), reserve, get recommendations, chat with the library assistant, track loans and fines. Faculty can also request books. |
| **Librarians** | Desk checkout and returns, reshelving, reservations, inventory checks, catalog management and import, patrons, reports, settings. |
| **Guests** | Browse the catalog and use the assistant without signing in. |
| **Kiosk** | A shared terminal in the LRC: students tap their ID card to browse, borrow and chat. |

Students and faculty sign in with their `@dlsl.edu.ph` account, by email and password or with Google.

## Features

- **Library assistant**: common policy questions (hours, fines, borrowing limits) are answered by fast keyword rules from the LRC handbook; everything else goes to OpenAI with tools for searching the catalog, the handbook, and the student's own loans. Works in English, Filipino and Taglish.
- **Recommendations**: "For You" picks based on books similar to what the student borrowed (TF-IDF and cosine similarity), with program-based and popular fallbacks.
- **Real-time catalog**: availability updates live, worked out from each physical copy.
- **Borrowing**: students claim a copy, then type the accession number from the book's barcode sticker to prove they have it. Librarians can also check out at the desk.
- **Reservations**: a queue per title. When a copy comes back, the next student is notified and has a pickup window before it passes to the next person.
- **Inventory**: scan a shelf with a USB barcode scanner; each copy shows as Found, Misplaced (wrong shelf) or Not Found.
- **Catalog Import**: bulk add or update books from the LRC's Excel sheets or a MARC export from Follett Destiny, with a preview before saving.
- **Notifications and email**: in-app notifications plus emails (via Resend) for ready reservations, due dates, overdue books and fines.
- **Reports**: catalogue, shelf list, circulation, overdue and fines, faculty requests, weeding candidates, inventory, and activity log, all exportable to CSV, with optional AI summaries.

## Tech stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 16 (App Router), TypeScript, Tailwind CSS v4, shadcn/ui |
| **Backend** | FastAPI (Python) |
| **Database and auth** | Supabase (PostgreSQL, Auth, Realtime, Storage, Edge Functions) |
| **AI / ML** | OpenAI GPT-4o-mini and text-embedding-3-small, scikit-learn (TF-IDF, cosine similarity) |
| **Email** | Resend |
| **Deployment** | Vercel (frontend), Railway (backend) |

## Project structure

```
lasallia/
├── apps/
│   ├── web/              # Next.js frontend
│   └── api/              # FastAPI backend
│       ├── core/         # Business logic
│       ├── routers/      # API endpoints
│       ├── migrations/   # SQL migrations, run in order in Supabase
│       ├── jobs/         # Recommendation rebuild jobs
│       ├── scripts/      # One-off and maintenance scripts
│       └── evals/        # Chatbot and recommender evaluations
├── packages/
│   └── types/            # Shared TypeScript types (@lasallia/types)
├── supabase/
│   ├── functions/        # loan-reminders Edge Function (daily emails)
│   └── cron/             # Schedule for the daily reminders
├── tools/
│   └── nfc-bridge/       # Makes an ACR122U card reader work with the kiosk
└── docs/                 # Setup guides and build plans
```

This is a **pnpm workspace monorepo**. Always run `pnpm install` from the repo root.

## Getting started

Full instructions: [`docs/setup/local-setup.md`](docs/setup/local-setup.md). Environment variables: [`docs/setup/env-variables.md`](docs/setup/env-variables.md).

**You need:** Node.js 22+, pnpm, Python 3.12+, and the env values from the lead developer.

**1. Install**

```bash
pnpm install                     # from the repo root

cd apps/api
python -m venv venv
venv\Scripts\activate            # Windows
# source venv/bin/activate       # macOS/Linux
pip install -r requirements.txt
```

**2. Add env files:** `apps/web/.env.local` and `apps/api/.env` (see the env variables doc).

**3. Run** (two terminals, from the repo root)

```bash
pnpm dev:web    # http://localhost:3000
pnpm dev:api    # http://localhost:8000 (check http://localhost:8000/health)
```

**Database changes** are SQL files in `apps/api/migrations/`. Run new ones in the Supabase SQL editor, in number order.

**Recommendations** are rebuilt by hand, in this order:

```bash
cd apps/api
venv/Scripts/python.exe jobs/rebuild_similarities.py
venv/Scripts/python.exe jobs/rebuild_cooccurrence.py
venv/Scripts/python.exe jobs/rebuild_recommendations.py
```

## Deployment

| | Production | Staging |
|---|---|---|
| Frontend (Vercel, root `apps/web`) | www.lasallia.com, from `main` | dev.lasallia.com, from `dev` |
| Backend (Railway, root `apps/api`) | production environment, from `main` | `dev` environment, from `dev` |

Both use the same Supabase project, so data created on staging is real. After changing a `NEXT_PUBLIC_` variable in Vercel, redeploy, because those values are built into the site.

## Documentation

- [Local setup](docs/setup/local-setup.md) and [environment variables](docs/setup/env-variables.md)
- [Conventions](docs/conventions.md)
- Build plans: [chatbot](docs/lasallia-chatbot-build-plan.md), [recommendations](docs/lasallia-recommendations-build-plan.md), [borrow and return](docs/lasallia-borrow-return-build-plan.md), [reports](docs/lasallia-reports-build-plan.md), [inventory](docs/lasallia-inventory-build-plan.md), [panel feedback and catalog import](docs/lasallia-panel-feedback-and-catalog-import.md)
- Evaluation: [data audit](docs/data-audit.md), [recommender evaluation](docs/recsys-evaluation.md)

## Status

In active development: an undergraduate thesis project for BS Computer Science at De La Salle Lipa, AY 2025–2027.

## License

This project is licensed under the [MIT License](LICENSE).

Lasallia was developed as an academic thesis for De La Salle Lipa's Learning Resource Center. The code is open source under MIT, but the DLSL branding, name and institutional data remain the property of De La Salle Lipa.
