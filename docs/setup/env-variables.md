# Environment Variables

Never commit actual values to GitHub. Get the values from the lead dev.

---

## Frontend — `apps/web/.env.local`

| Variable | Description | Where to get |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Supabase dashboard → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase public anon key | Supabase dashboard → Project Settings → API |
| `NEXT_PUBLIC_API_URL` | FastAPI backend URL | `http://localhost:8000` for local, Railway URL for production |

---

## Backend — `apps/api/.env`

| Variable | Description | Where to get |
|---|---|---|
| `SUPABASE_URL` | Supabase project URL | Supabase dashboard → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (admin access) | Supabase dashboard → Project Settings → API |
| `OPENAI_API_KEY` | OpenAI API key for GPT-4o-mini | platform.openai.com → API keys |
| `FRONTEND_URL` | Frontend URL for CORS | `http://localhost:3000` for local, Vercel URL for production |

---

## Notes

- `NEXT_PUBLIC_` prefix means the variable is exposed to the browser — never put secrets with this prefix
- `SUPABASE_SERVICE_ROLE_KEY` is a secret admin key — backend only, never expose to frontend
- For production, set these in Vercel and Railway dashboards instead of `.env` files