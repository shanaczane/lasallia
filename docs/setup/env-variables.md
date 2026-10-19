# Environment Variables

Never commit actual values to GitHub. Get the values from the lead dev.

---

## Frontend — `apps/web/.env.local`

| Variable | Description | Where to get |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Supabase dashboard → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase public anon key | Supabase dashboard → Project Settings → API |
| `NEXT_PUBLIC_API_URL` | FastAPI backend URL | `http://localhost:8000` for local, the Railway URL for production (staging uses the Railway `dev` environment's URL) |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Optional. The Google OAuth **Web client ID** (the same one in Supabase → Authentication → Providers → Google). When set, the login page uses Google's own sign-in button on our domain instead of redirecting through Supabase. | Google Cloud Console → APIs & Services → Credentials |

---

## Backend — `apps/api/.env`

| Variable | Description | Where to get |
|---|---|---|
| `SUPABASE_URL` | Supabase project URL | Supabase dashboard → Project Settings → API |
| `SUPABASE_ANON_KEY` | Supabase public anon key. Required: the API won't start without it | Supabase dashboard → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (admin access) | Supabase dashboard → Project Settings → API |
| `OPENAI_API_KEY` | OpenAI API key for the chatbot, search embeddings and AI summaries. Optional: those features are off without it | platform.openai.com → API keys |
| `RESEND_API_KEY` | Resend API key for notification emails. Optional: without it, notifications are in-app only | resend.com → API Keys |
| `FRONTEND_URL` | Frontend URL for CORS | `http://localhost:3000` for local, `https://www.lasallia.com` for production |
| `FRONTEND_ORIGIN_REGEX` | Optional. Extra allowed frontend origins as a regex (e.g. Vercel preview URLs) | — |

---

## Notes

- `NEXT_PUBLIC_` prefix means the variable is exposed to the browser — never put secrets with this prefix
- `SUPABASE_SERVICE_ROLE_KEY` is a secret admin key — backend only, never expose to frontend
- For production, set these in Vercel and Railway dashboards instead of `.env` files