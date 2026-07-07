# Lasallia

[![Live Demo](https://img.shields.io/badge/demo-lasallia.vercel.app-green)](https://lasallia.vercel.app)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-Python-009688?logo=fastapi)](https://fastapi.tiangolo.com)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase)](https://supabase.com)

AI-powered hybrid rule-based and NLP-driven library assistant with personalized content-based book recommendations and a real-time catalog, built for De La Salle Lipa's Learning Resource Center.

**Live demo:** [lasallia.vercel.app](https://lasallia.vercel.app)

## Overview

Lasallia helps students, faculty, and library staff browse the catalog, get personalized book recommendations, and interact with an AI chatbot that answers library-related questions using a hybrid rule-based + RAG approach. Login is restricted to verified DLSL accounts (`@dlsl.edu.ph`).

## Features

- **AI Library Assistant** — hybrid chatbot combining rule-based responses for common queries with RAG (Retrieval-Augmented Generation) for open-ended, library-specific questions
- **Personalized Recommendations** — content-based book suggestions powered by TF-IDF vectorization and cosine similarity
- **Real-Time Catalog** — live book availability and search across the LRC collection
- **Reservation Management** — book reservations for students with a dedicated librarian dashboard for processing requests
- **DLSL-Only Access** — Google OAuth restricted to verified `@dlsl.edu.ph` accounts
- **Librarian Tools** — quick scanner interface, reports screen, and reservation management for library staff

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 16 (App Router), TypeScript, Tailwind CSS, shadcn/ui |
| **Backend** | FastAPI (Python) |
| **Database & Auth** | Supabase (PostgreSQL, Auth, Realtime, Storage) |
| **AI / ML** | OpenAI GPT-4o-mini (RAG), scikit-learn (TF-IDF + Cosine Similarity) |
| **Deployment** | Vercel (frontend) · Railway (backend) |

## Project Structure

```
lasallia/
├── apps/
│   ├── web/        # Next.js frontend
│   └── api/        # FastAPI backend
├── packages/
│   └── types/      # Shared TypeScript types
└── docs/           # Setup guides and architecture docs
```

This is a **pnpm workspace monorepo** — shared types in `packages/types` are consumed by the frontend via `workspace:*`.

## Getting Started

See [`docs/setup/local-setup.md`](docs/setup/local-setup.md) for full setup instructions, including environment variables and Supabase configuration.

### Quick Start

**Frontend**

```bash
cd apps/web
pnpm install
pnpm dev
```

**Backend**

```bash
cd apps/api
python -m venv venv
venv\Scripts\activate    # Windows
# source venv/bin/activate  # macOS/Linux
pip install -r requirements.txt
uvicorn main:app --reload
```

## Status

In active development — undergraduate thesis project for BS Computer Science at De La Salle Lipa, AY 2025–2027.

## License

This project is licensed under the [MIT License](LICENSE).

Lasallia was developed as an academic thesis for De La Salle Lipa's Learning Resource Center. While the code is open source under MIT, the DLSL branding, name, and institutional data remain the property of De La Salle Lipa.



