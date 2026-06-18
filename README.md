# Lasallia

AI-powered hybrid rule-based and NLP-driven library assistant with personalized content-based book recommendations and a real-time catalog, built for De La Salle Lipa's Learning Resource Center.

## Overview

Lasallia helps students, faculty, and library staff browse the catalog, get personalized book recommendations, and interact with an AI chatbot that answers library-related questions using a hybrid rule-based + RAG approach. Login is restricted to verified DLSL accounts (`@dlsl.edu.ph`).

## Tech Stack

- **Frontend:** Next.js 16 (App Router), TypeScript, Tailwind CSS, shadcn/ui
- **Backend:** FastAPI (Python)
- **Database & Auth:** Supabase (PostgreSQL, Auth, Realtime, Storage)
- **AI:** OpenAI GPT-4o-mini (RAG), scikit-learn (TF-IDF + Cosine Similarity)
- **Deployment:** Vercel (frontend), Railway (backend)

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

## Getting Started

See [`docs/setup/local-setup.md`](docs/setup/local-setup.md) for full setup instructions.

Quick start:

```bash
# Frontend
cd apps/web
pnpm install
pnpm dev

# Backend
cd apps/api
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

## Status

🚧 In active development — thesis project for BS Computer Science, AY 2025–2027.

## License

This project is part of an academic thesis at De La Salle Lipa and is not licensed for commercial use.
