# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

**Finances** — A family personal finance organizer. Users upload bank statements (PDF/Excel/CSV), the app parses and AI-categorizes charges. Currently in **private beta**.

---

## Stack

| Layer | Choice |
|---|---|
| Backend | Python + FastAPI (Clean Architecture) |
| Frontend | React + TypeScript + Vite + Tailwind CSS |
| Database | PostgreSQL + Alembic migrations |
| Auth + Storage | Supabase (Auth + Storage) |
| AI | Claude API (charge categorization) |
| Infra | Docker + docker-compose (dev); Coolify (self-hosted VPS) for staging |
| Deploy | **Staging**: Coolify, internal-only services, no public domain (called by [Núcleo](https://github.com/beto-dev/nucleo) server-to-server). **Production**: still Vercel (frontend) + Koyeb (API) — frozen, no auto-deploy, migration to Coolify in progress (see Deployment section) |
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
| `manage_family.py` | Invite members, manage roles |
| `chat_with_data.py` | Chat AI agent — Claude tool-calling loop over monthly summary, charges, category breakdown, trend |

---

## Key Domain Concepts

- **Family**: Top-level grouping. All data is family-scoped.
- **Statement**: An uploaded file. Has type (checking / credit_card / credit_line / manual). Type is required at upload — no default. Bank is optional (selected from a fixed list of 21 Chilean banks, no free text).
- **Charge**: A single line item. Fields: date, description, amount, currency, category_id, `is_shared` (was `is_confirmed` — renamed).
- **amount sign convention**: positive = expense / debit / charge; negative = income / credit (salary, deposit, incoming transfer, refund). The parser enforces this; the UI displays income in green with `+` prefix.
- **is_shared**: Whether a charge is visible to the whole family in the family view. Manual charges default to `is_shared=False`.
- **Category**: AI-suggested or user-confirmed label. System categories include both expense categories (Alimentación, Transporte, etc.) and income categories (Remuneración, Abono, Transferencia recibida, Devolución / Reembolso — added in migration 0008).
- **CategoryRule**: Persisted description→category mapping per family (auto-apply on future uploads). Pattern is extracted by stripping trailing noise tokens (IDs, numbers, codes) from the description — e.g. "UBER TRIP A1B2C" → "UBER TRIP". Matching uses PostgreSQL `ILIKE`.
- **Credit (Crédito Bancario)**: A bank loan or credit being tracked manually. Fields: description, bank, cuota_monto, cuota_numero, cuota_total. Visible on the dashboard with progress and amount already paid.

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
| 2.7 | Google Sheets integration | 🗑️ Removed — not migrated to Coolify, feature not in use |
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
| 4.1 | Production deployment | 🟡 Frozen — Vercel (frontend) + Koyeb (API) + standalone Supabase project, no auto-deploy since 2026-09-01; receives manual redeploys only. Being migrated to Coolify (internal-only, same as staging), see Deployment section. |
| 4.1b | Staging environment | ✅ Done — migrated from Railway to **Coolify** (internal services, no public domain) on 2026-08-27; Núcleo is the only public frontend, calling this API server-to-server. `VITE_DEV_AUTO_LOGIN` no longer applies (no standalone frontend in staging). |
| 4.2 | Monitoring | ⏳ Pending — would have caught two Supabase auto-pause outages (2026-10-15, 2026-11-23) sooner |
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

- **Being retired in favor of Supabase Auth.** This API's own login (`/api/auth/register`, `/login`, `/google`, `/google/callback`) is deprecated — Núcleo + Supabase Auth (Google OAuth, JWKS/ES256) is the real login path now. This API verifies Supabase JWTs directly (`infrastructure/auth/supabase_middleware.py`), with its own legacy HS256 verification kept only as a fallback while `apps/web` (this repo's standalone React frontend) is still in use. The whole `auth.py` login surface gets deleted once `apps/web` is retired — not before, since active sessions there still depend on it.
- **Google OAuth** (legacy, `apps/web` only): OAuth app is published (External, no test user restriction). Authorized redirect URIs in Google Console include the production (Koyeb) callback URL; the old staging (Railway) callback URL is stale and should be cleaned up.
- **Email/password** (legacy, `apps/web` only): secondary login, available via hidden link on the login page.
- **`ALLOWED_EMAILS`**: backend env var that restricts which emails can log in regardless of auth method.

---

## CI / Quality

- **GitHub Actions** runs on every push to `main` and `staging`
- Jobs: API lint (ruff), API type check (mypy), API tests (pytest), Web build, Web type check + lint, E2E tests (Playwright), Security audit
- **Ruff** config: `line-length = 120`, rules E/F/I/N/W/UP, `known-first-party` includes all local packages
- **Mypy**: `check_untyped_defs = true`, `warn_unused_ignores = true` — this means any unnecessary `# type: ignore` will cause CI to fail
- Mock repos in tests inherit from the ABC interfaces — do not add untyped mocks

---

## Deployment

> 🚧 **Mid-migration.** Staging is fully cut over to Coolify. Production is not yet — it's still Vercel+Koyeb, frozen (no auto-deploy) and kept alive with occasional manual redeploys, pending a delta data migration and a dedicated Coolify `production` environment. Status tracked in the Obsidian vault: `Núcleo/Status — migración a Núcleo (VPS).md`.

### Branch strategy

```
feature/* ──PR──▶ staging ──auto-deploy──▶ Coolify (finances-app-api, internal only)
                      │
                      └──(PR manual)──▶ main ──(manual redeploy, not automatic)──▶ Koyeb + Vercel
```

- **`staging` branch** → Coolify — auto-deploy on push (verified end-to-end via webhook)
- **`main` branch** → the old Vercel+Koyeb production — no longer auto-deploys; requires a manual "Redeploy" in each platform's dashboard after merging

### Platform config

| Component | Staging (Coolify, internal) | Production (old, frozen) |
|-----------|---------|------------|
| Frontend | none — Núcleo (`nucleo-staging.alberto-tejos.cl`) is the only frontend, calls this API server-to-server | Vercel (`finances-app-pi.vercel.app`), this repo's `apps/web` |
| API | `finances-app-api` Coolify service, no public domain | Koyeb (`annoyed-janice-beto-dev-org-80e2dfa8.koyeb.app`) |
| Database | Supabase shared project `sexqvaebanfvrknsmbmr` (`finances-app-beta`), shared with Núcleo | standalone Supabase project `cittnwuoacvipjyillsr` — on the free plan, auto-pauses after ~7 days idle; has caused two production outages (2026-10-15, 2026-11-23) |

- **`ALLOWED_EMAILS`** controls who can log in (set separately per environment)
- **`ENABLE_DEBUG_ENDPOINTS`** must NOT be set in production (debug routes return 404 without it)
- Both Supabase projects are on the free plan — the standalone one pausing from inactivity is a known, recurring failure mode until the production cutover happens and it can be deleted
- **RLS is enabled** on all 12 tables in the shared Supabase project

---

## Environment Variables

| Variable | Production (Koyeb, frozen) | Staging (Coolify) |
|---|---|---|
| `VITE_API_URL` | Vercel (Production env) | n/a — no standalone frontend; Núcleo reaches this API via internal Docker network |
| `APP_ANTHROPIC_API_KEY` | ✅ | ✅ same value |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY` | standalone project (`cittnwuoacvipjyillsr`) | shared project (`sexqvaebanfvrknsmbmr`) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | ✅ (legacy login, `apps/web` only) | ✅ same value |
| `GOOGLE_LOGIN_REDIRECT_URI` | Koyeb callback URL | n/a |
| `JWT_SECRET` | ✅ (legacy HS256 fallback) | ✅ same value |
| `FRONTEND_URL` | `https://finances-app-pi.vercel.app` | n/a |
| `ALLOWED_EMAILS` | production list | staging list |
| `DATABASE_URL` | standalone Supabase (Session pooler) | shared Supabase (Session pooler) |
