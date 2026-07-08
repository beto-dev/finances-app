# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

**Finances** — A family personal finance organizer. Users upload bank statements (PDF/Excel/CSV), the app parses and AI-categorizes charges, and syncs results to a shared Google Spreadsheet. Currently in **private beta**.

---

## Stack

| Layer | Choice |
|---|---|
| Backend | Python + FastAPI (Clean Architecture) |
| Frontend | React + TypeScript + Vite + Tailwind CSS |
| Database | PostgreSQL + Alembic migrations |
| Auth + Storage | Supabase (Auth + Storage) |
| AI | Claude API (charge categorization) |
| Infra | Docker + docker-compose (dev) |
| Deploy | Vercel (frontend) + Koyeb (API prod) + Railway (API staging) |
| CI | GitHub Actions |

Architecture: **Clean Architecture** — `domain/` → `application/` → `infrastructure/` → `presentation/`

---

## Monorepo Structure

```
apps/
  api/        # Python FastAPI backend
    domain/          # entities + repository interfaces (ABCs)
    application/     # use cases
    infrastructure/  # SQLAlchemy repos, AI, parsers, Google, Supabase
    presentation/    # FastAPI routes + dependencies
    tests/           # pytest unit + integration tests
  web/        # React + TypeScript frontend
    src/
      features/
        auth/        # login, register, OAuth callback
        charges/     # personal charges + family charges views
        contributions/ # contributions view
        dashboard/   # monthly summary
        expenses/    # quick expense entry
        family/      # family management (owner only)
        sheets/      # Google Sheets sync UI
        upload/      # file upload
      app/           # router, App.tsx
      shared/        # Layout, ProtectedRoute, Spinner, etc.
  e2e/        # Playwright E2E tests
```

---

## API Endpoints

| Route | File | Description |
|---|---|---|
| `/api/health` | health.py | Health check |
| `/api/auth/*` | auth.py | Login, register, Google OAuth |
| `/api/charges/*` | charges.py | Charges CRUD, bulk confirm/unshare, categories |
| `/api/statements/*` | statements.py | Upload + parse bank statements |
| `/api/families/*` | families.py | Family management |
| `/api/google/*` | google.py | Google Sheets OAuth + sync |
| `/api/chat` | chat.py | Chat AI agent — natural-language Q&A over the user's charges (Claude tool-calling) |
| `/api/debug/*` | debug.py | Debug endpoints (disabled in prod — 404 without `ENABLE_DEBUG_ENDPOINTS`) |

---

## Frontend Routes

| Path | Component | Notes |
|---|---|---|
| `/` | → `/resumen` | Redirect |
| `/resumen` | DashboardPage | Monthly summary |
| `/cargar` | UploadPage | Upload bank statement |
| `/gastos` | ChargesPage | Personal charges |
| `/gastos-familia` | FamilyChargesPage | Shared family charges |
| `/aportes` | ContributionsPage | Contributions view |
| `/familia` | FamilyPage | Family management (owner only, redirects members) |
| `/hojas` | SheetsPage | Google Sheets sync |
| `/nuevo-gasto` | QuickExpensePage | Quick manual charge entry |
| `/cuotas` | CuotasPage | Installment tracker (cuotas grupales) |
| `/categorias` | CategoriesPage | Category management + budget limits (admin only) |
| `/chat` | ChatPage | Chat AI agent — ask questions about your charges in natural language |
| `/login` | LoginPage | Auth |
| `/auth/callback` | AuthCallbackPage | OAuth callback |

---

## Use Cases

| File | Purpose |
|---|---|
| `upload_statement.py` | Receive file, store in Supabase, create Statement record |
| `parse_statement.py` | Parse PDF/Excel/CSV → list of Charge records |
| `categorize_charges.py` | Claude API categorization |
| `review_charges.py` | Update category, bulk confirm, learn rules |
| `sync_to_sheets.py` | Push confirmed charges to Google Sheets |
| `manage_family.py` | Invite members, manage roles |
| `chat_with_data.py` | Chat AI agent — Claude tool-calling loop over monthly summary, charges, category breakdown, trend |

---

## Key Domain Concepts

- **Family**: Top-level grouping. All data is family-scoped. One Google Sheet per family.
- **Statement**: An uploaded file. Has type (checking / credit_card / credit_line / manual). Type is required at upload — no default. Bank is optional (selected from a fixed list of 21 Chilean banks, no free text).
- **Charge**: A single line item. Fields: date, description, amount, currency, category_id, `is_shared` (was `is_confirmed` — renamed).
- **amount sign convention**: positive = expense / debit / charge; negative = income / credit (salary, deposit, incoming transfer, refund). The parser enforces this; the UI displays income in green with `+` prefix.
- **is_shared**: Whether a charge is visible to the whole family in the family view and Google Sheets sync. Manual charges default to `is_shared=False`.
- **Category**: AI-suggested or user-confirmed label. System categories include both expense categories (Alimentación, Transporte, etc.) and income categories (Remuneración, Abono, Transferencia recibida, Devolución / Reembolso — added in migration 0008).
- **CategoryRule**: Persisted description→category mapping per family (auto-apply on future uploads). Pattern is extracted by stripping trailing noise tokens (IDs, numbers, codes) from the description — e.g. "UBER TRIP A1B2C" → "UBER TRIP". Matching uses PostgreSQL `ILIKE`.
- **Credit (Crédito Bancario)**: A bank loan or credit being tracked manually. Fields: description, bank, cuota_monto, cuota_numero, cuota_total. Visible on the dashboard with progress and amount already paid.

---

## Chat AI Agent

Natural-language Q&A over the user's charges (`/chat`, roadmap 3.5). Key files: [chat_with_data.py](apps/api/application/use_cases/chat_with_data.py) (use case), [chat.py](apps/api/presentation/api/chat.py) (route), [useChat.ts](apps/web/src/features/chat/useChat.ts) (frontend state).

### How it works

- **Stateless — no training, no persistent memory.** Each request is a fresh prompt to Claude (`claude-haiku-4-5-20251001`). There's no conversation table, no fine-tuning, no vector store. "Memory" between messages is just the conversation history the frontend resends each time.
- **Conversation history lives only in the browser.** `useChat.ts` keeps it in React state — lost on page reload or "Limpiar". Only the last 10 messages are sent as context per request (`MAX_HISTORY_MESSAGES`), so a long conversation doesn't keep growing the token cost per turn indefinitely.
- **Tool-calling loop, not a single call.** One user message can trigger up to 5 rounds of Claude ↔ backend exchanges: Claude requests a tool (e.g. `get_monthly_summary`), the backend executes it against Postgres and returns the result, and Claude either asks for another tool or produces the final text reply. The round cap exists to prevent infinite loops if the model never settles.
- **Available tools**: `get_monthly_summary` (totals + top 5 categories for a month), `get_charges` (filtered charge list, optionally by category), `get_category_breakdown` (expenses/income per category for a period), `get_trend` (monthly expenses/income over N months back).

### Data scoping

- All tools call `ChargeRepository.get_personal(user_id, ...)`, so a user can never see another family member's data — this is enforced at the query level, not by prompt instructions.
- **Known limitation**: `get_personal` only returns charges from the synthetic "Gastos Manuales" statement (manual entries from `/nuevo-gasto`). It does **not** include the user's own uploaded bank statement charges (those live under `get_by_family(family_id, uploaded_by_filter=user_id)`, same as `/gastos` combines both — see [charges.py:35-41](apps/api/presentation/api/charges.py#L35-L41)), nor the family-shared pool (`get_confirmed_by_family`). In practice the chat currently can't answer about charges from uploaded statements — only manually-entered ones.

### Cost guardrails

- **Rate limit**: 30 requests/hour on `POST /api/chat`, keyed by IP (`slowapi`, same pattern as `auth`/`statements`) — not per-user, so it's a shared budget for anyone behind the same address.
- **Capped tool inputs**: `get_charges`'s `limit` and `get_trend`'s `months_back` are clamped server-side (`_MAX_CHARGES_LIMIT = 50`, `_MAX_MONTHS_BACK = 24`) regardless of what the model requests, so a single tool call can't balloon the context.
- **Prompt caching**: the system prompt and tool definitions are identical on every round, so both are marked with `cache_control: {"type": "ephemeral"}` — repeat calls within the same tool-calling loop (or within ~5 min) are billed at the cached rate instead of full price.
- **Trimmed history**: see above — only the last 10 messages are resent per request.

---

## Development Plan Status

### Phase 1 — Setup ✅ COMPLETE

All tasks done: monorepo, backend skeleton, frontend skeleton, database, auth, dev environment, CI.

### Phase 2 — Core Features ✅ MOSTLY COMPLETE

| # | Task | Status |
|---|---|---|
| 2.1 | File upload API | ✅ Done |
| 2.2 | PDF parser | ✅ Done |
| 2.3 | Excel/CSV parser | ✅ Done |
| 2.4 | AI categorization | ✅ Done |
| 2.5 | MCP server | ⏳ Pending |
| 2.6 | Charge review UI | ✅ Done |
| 2.7 | Google Sheets integration | ✅ Done |
| 2.8 | Family workspace | ✅ Done |
| 2.9 | Monthly dashboard | ✅ Done |

### Phase 3 — Polish

| # | Task | Status |
|---|---|---|
| 3.1 | Persistent category memory | ✅ Done — CategoryRule auto-applies on future uploads; interactive bulk-apply UI: after categorizing a charge, prompts "Apply to N similar charges?" using smart pattern extraction |
| 3.2 | Income support | ✅ Done — negative amounts = income; income categories (migration 0008); dashboard shows Gastos / Ingresos / Balance neto; charges page filter by type |
| 3.3 | Bank combobox on upload | ✅ Done — searchable dropdown with 21 Chilean banks, no free text allowed |
| 3.4 | Statement type required on upload | ✅ Done — no default; drop zone disabled until type is selected |
| 3.5 | Chat agent UI | ✅ Done — natural-language Q&A over monthly summary, charges, category breakdown and trend via Claude tool-calling; nav entry desktop + mobile *(julio 2026)* |
| 3.6 | Email ingestion | ⏳ Pending |
| 3.7 | Multi-currency | ⏳ Pending |
| 3.8 | Export & reports | ⏳ Pending |
| 3.9 | Audit log | ⏳ Pending |
| 3.10 | Créditos bancarios | ✅ Done — track bank loans on dashboard; shows cuotas paid/remaining and amount already paid per credit and per cuota row |
| 3.11 | Monthly budget per category | ✅ Done — per-category spending limit set in CategoriesPage; dashboard shows progress bar + alert at 80% and 100% |
| 3.12 | Statement processing notification | ✅ Done — toast in Layout via `useStatementNotifier`; shows success/error with link to charges when parsing completes |
| 3.13 | UX Redesign "Family Warmth" | ✅ Done (beta) — violet brand `#7C3AED`, zinc palette, tonal KPI cards (Material You pattern), horizontal category bars with per-category colors, donut chart with center label |

### Phase 4 — Deploy & Mobile

| # | Task | Status |
|---|---|---|
| 4.1 | Production deployment | ✅ Done — Vercel (frontend) + Koyeb (API) + Supabase production |
| 4.1b | Staging environment | ✅ Done — Vercel Preview (frontend) + **Railway** (API) + Supabase beta project. `VITE_DEV_AUTO_LOGIN=true` bypasses login in staging. |
| 4.2 | Monitoring | ⏳ Pending |
| 4.3–4.5 | Mobile (React Native) | ⏳ Pending |

### Backlog — High Priority

| Task | Notes |
|---|---|
| Edit statement type after upload | Today requires delete + re-upload if wrong type selected |

### Backlog — Medium Priority

| Task | Notes |
|---|---|
| Edit charge description | Clean up cryptic bank names (e.g. "TRF 0000123456" → "Netflix") |
| Recurring charges | Mark a charge as fixed (rent, internet) to auto-appear each month |
| Global search | Search across all charges from all months in one place |
| Filter charges by "Sin categoría" | ✅ Done — added as option in category filter dropdown |

---

## Authentication

- **Google OAuth**: primary login method. OAuth app is published (External, no test user restriction). Authorized redirect URIs in Google Console include production (Koyeb) and staging (Railway) callback URLs.
- **Email/password**: secondary login, available via hidden link on the login page ("Iniciar sesión con email"). Useful for staging where Google OAuth redirect URI is environment-specific.
- **`ALLOWED_EMAILS`**: backend env var that restricts which emails can log in regardless of auth method.

---

## CI / Quality

- **GitHub Actions** runs on every push to `main` and `beta`
- Jobs: API lint (ruff), API type check (mypy), API tests (pytest), Web build, Web type check + lint, E2E tests (Playwright), Security audit
- **Ruff** config: `line-length = 120`, rules E/F/I/N/W/UP, `known-first-party` includes all local packages
- **Mypy**: `check_untyped_defs = true`, `warn_unused_ignores = true` — this means any unnecessary `# type: ignore` will cause CI to fail
- Mock repos in tests inherit from the ABC interfaces — do not add untyped mocks

---

## Deployment

### Branch strategy

```
feature/* ──PR──▶ beta ──auto-deploy──▶ staging (Railway API + Vercel Preview)
                      │
                      └──(PR manual)──▶ main ──auto-deploy──▶ producción (Koyeb + Vercel)
```

- **`beta` branch** → staging — auto-deploy on push
- **`main` branch** → production — auto-deploy, triggered manually by merging `beta` → `main` via PR

### Promoting to production

```bash
gh pr create --base main --head beta --title "Release: <descripción>"
# Review, approve, merge → production auto-deploys
```

### Platform config

| Component | Staging | Production |
|-----------|---------|------------|
| Frontend | Vercel Preview (`finances-app-git-beta-*.vercel.app`) | Vercel (`finances-app-pi.vercel.app`) |
| API | Railway (`finances-app-production-f04d.up.railway.app`) | Koyeb (`annoyed-janice-beto-dev-org-80e2dfa8.koyeb.app`) |
| Database | Supabase beta project | Supabase production project |

- **`ALLOWED_EMAILS`** controls who can log in (set separately in Railway and Koyeb)
- **`ENABLE_DEBUG_ENDPOINTS`** must NOT be set in production (debug routes return 404 without it)
- **Google OAuth redirect URI** for staging: `https://finances-app-production-f04d.up.railway.app/api/auth/google/callback` — registered in Google Cloud Console
- **Railway note**: uses `PORT=8080` env var injected automatically; Dockerfile builder must be set explicitly (not Railpack); build context must be repo root (not `apps/api`)
- **Supabase staging DB**: use Session pooler URL (`aws-1-us-east-2.pooler.supabase.com:5432`) — Railway doesn't support IPv6 (Direct connection resolves to IPv6)

---

## Environment Variables

| Variable | Production (Koyeb) | Staging (Railway) |
|---|---|---|
| `VITE_API_URL` | Vercel (Production env) | Vercel (Preview env) |
| `VITE_DEV_AUTO_LOGIN` | — (not set) | `true` — bypasses login screen for testing |
| `APP_ANTHROPIC_API_KEY` | ✅ | ✅ same value |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY` | production project | beta project |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | ✅ | ✅ same value |
| `GOOGLE_LOGIN_REDIRECT_URI` | Koyeb callback URL | Railway callback URL |
| `GOOGLE_REDIRECT_URI` | ✅ | ✅ |
| `JWT_SECRET` | ✅ | ✅ same value |
| `FRONTEND_URL` | `https://finances-app-pi.vercel.app` | Vercel beta preview URL |
| `ALLOWED_EMAILS` | production list | staging list |
| `DATABASE_URL` | Supabase production (Session pooler) | Supabase beta (Session pooler) |
