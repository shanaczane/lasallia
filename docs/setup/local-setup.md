 # Local Setup Guide

## Prerequisites

Make sure you have the following installed before cloning the project:

- [Node.js](https://nodejs.org/) v22+
- [Python](https://www.python.org/) 3.12+
- pnpm: `npm install -g pnpm`
- [Git](https://git-scm.com/)

---

## 1. Clone the Repository

```bash
git clone <repo-url>
cd lasallia
```

---

## 2. Frontend Setup (Next.js)

```bash
cd apps/web
pnpm install
pnpm approve-builds
```

Create your env file:

```bash
echo. > .env.local
```

Fill in `.env.local` with the values shared by the lead dev:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## 3. Backend Setup (FastAPI)

```bash
cd ../api
python -m venv venv
venv\Scripts\activate        # Windows
source venv/bin/activate     # Mac/Linux
pip install -r requirements.txt
```

Create your env file:

```bash
echo. > .env
```

Fill in `.env` with the values shared by the lead dev:

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
FRONTEND_URL=http://localhost:3000
```

---

## 4. Running the Project

Open two terminals:

**Terminal 1 — Frontend:**
```bash
cd apps/web
pnpm dev
```
Runs at: http://localhost:3000

**Terminal 2 — Backend:**
```bash
cd apps/api
venv\Scripts\activate
uvicorn main:app --reload
```
Runs at: http://localhost:8000

---

## 5. Verify Everything Works

- Frontend: open http://localhost:3000
- Backend health check: open http://localhost:8000/health
- Expected response: `{"status":"ok","service":"lasallia-api"}`

---

## Notes

- Never commit `.env` or `.env.local` files — they are in `.gitignore`
- Always activate the Python venv before running the backend
- Use `pnpm` not `npm` for all frontend commands
- Ask the lead dev for the actual env values