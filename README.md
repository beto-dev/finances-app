# Finanzas

Family personal finance organizer. Upload bank statements, get AI-categorized charges, and sync to a shared Google Spreadsheet.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          GitHub                                  │
│  beto-dev/finances-app (monorepo: apps/api + apps/web)          │
│                                                                  │
│  Push to main → CI (GitHub Actions) → deploy to Vercel + Koyeb │
└───────────────┬──────────────────────────┬──────────────────────┘
                │                          │
                ▼                          ▼
    ┌───────────────────┐      ┌───────────────────────┐
    │      Vercel        │      │        Koyeb           │
    │  React + Vite SPA  │      │  Python FastAPI (API)  │
    │  (apps/web/)       │◄────►│  (apps/api/)           │
    │                    │ REST │                        │
    │  Auto-deploy on    │      │  Docker container,     │
    │  push to main      │      │  auto-deploy on push   │
    └───────────────────┘      └──────────┬────────────┘
                                           │
                           ┌───────────────┼───────────────┐
                           ▼               ▼               ▼
                    ┌──────────┐   ┌──────────────┐  ┌──────────┐
                    │ Supabase │   │  Claude API  │  │  Google  │
                    │ Postgres │   │  (Anthropic) │  │  Sheets  │
                    │ + Auth   │   │  Groq/Gemini │  │   API    │
                    │ + Storage│   │              │  │          │
                    └──────────┘   └──────────────┘  └──────────┘
```

---

## What each service does

### GitHub — Source of truth + CI/CD trigger

- Hosts the monorepo (`apps/api/` + `apps/web/`)
- **GitHub Actions** (`ci.yml`) runs on every push to `main`:
  - API: ruff lint → mypy type-check → pytest tests
  - Web: TypeScript type-check → ESLint → Vite build → Playwright E2E
  - Security: pip-audit + npm audit
- On CI pass, both Vercel and Koyeb auto-deploy

### Vercel — Frontend hosting

- Serves the React + TypeScript + Vite SPA (`apps/web/`)
- Auto-deploys on every push to `main` (connected via GitHub integration)
- Injects `VITE_API_URL` at build time so the frontend knows where the API is
- Handles routing via `vercel.json` rewrites (all paths → `index.html`)
- URL: your Vercel project URL (e.g. `finances-app.vercel.app`)

### Koyeb — API hosting

- Runs the Python FastAPI backend (`apps/api/`) as a Docker container
- Auto-deploys on every push to `main` (connected via GitHub integration)
- Build: uses `Dockerfile` at the repo root with build context `/`
- Startup: `entrypoint.sh` runs `alembic upgrade head` then starts `uvicorn`
- Health check: `GET /api/health` → `{"status": "ok"}`
- URL: your Koyeb service URL (e.g. `finances-api-xxx.koyeb.app`)

### Supabase — Database + Auth + Storage

- **PostgreSQL**: stores all app data (users, families, statements, charges, categories)
- **Auth**: JWT-based authentication; user sessions are validated by the API on every request
- **Storage**: stores uploaded bank statement files (PDF/Excel/CSV)

### Claude / Groq / Gemini — AI parsing + categorization

- **PDF/Excel/CSV parsing**: extracts transaction lines from bank statements using LLM
- **Categorization**: suggests a category for each charge (e.g. "Food", "Transport")
- Falls back across providers: Groq (free, fast) → Gemini (free) → Claude (paid)

### Google Sheets API — Export

- Pushes confirmed family charges to a shared Google Spreadsheet
- OAuth flow managed by the API; credentials stored per family in the database

---

## Monorepo structure

```
apps/
  api/                       # Python FastAPI (Clean Architecture)
    domain/                  # entities + repository interfaces (ABCs)
    application/use_cases/   # business logic
    infrastructure/          # SQLAlchemy repos, AI parsers, Google, Supabase
    presentation/            # FastAPI routes + dependency injection
    alembic/                 # DB migrations
    tests/                   # pytest unit + integration tests
  web/                       # React + TypeScript + Vite
    src/
      features/              # auth, charges, dashboard, family, upload, …
      shared/                # Layout, ProtectedRoute, API client, types
      app/                   # router, App.tsx
  e2e/                       # Playwright end-to-end tests
```

---

## Local development

### Prerequisites

- Docker + docker-compose
- Node 20+, Python 3.12+

### Start everything

```bash
docker-compose up
```

This starts the API (port 8000) and the database (port 5432).

```bash
cd apps/web && npm install && npm run dev
```

Frontend runs at `http://localhost:5173`.

### Environment variables

Copy `.env.example` to `.env` in `apps/api/` and fill in:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret for signing JWTs |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_KEY` | Supabase service role key |
| `APP_ANTHROPIC_API_KEY` | Claude API key (optional) |
| `GROQ_API_KEY` | Groq API key (optional, free) |
| `GEMINI_API_KEY` | Gemini API key (optional, free) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GOOGLE_LOGIN_REDIRECT_URI` | OAuth callback for login |
| `GOOGLE_REDIRECT_URI` | OAuth callback for Sheets |
| `FRONTEND_URL` | Frontend URL (for CORS + redirects) |
| `ALLOWED_EMAILS` | Comma-separated allowlist for beta |

---

## Deployment

Both Vercel and Koyeb auto-deploy when you push to `main` and CI passes.

### Manual steps (first-time setup only)

1. Connect the GitHub repo to Vercel (root: `apps/web`, framework: Vite)
2. Connect the GitHub repo to Koyeb (Dockerfile: `apps/api/Dockerfile`, build context: `/`)
3. Add all environment variables in each platform's dashboard
4. Set Koyeb health check path to `/api/health`

See `BETA_LAUNCH.md` for the full setup guide.
