# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

**Finances** — A family personal finance organizer. Users upload bank statements (PDF/Excel/CSV), the app parses and AI-categorizes charges. Currently in **private beta**.

---

## Stack

| Layer | Choice |
|---|---|
| Backend | Python + FastAPI (Clean Architecture) — **this repo has no frontend of its own anymore** (see note below) |
| Database | PostgreSQL + Alembic migrations |
| Auth + Storage | Supabase (Auth + Storage) |
| AI | Claude API (charge categorization) |
| Infra | Docker + docker-compose (dev); Coolify (self-hosted VPS) for both staging and production |
| Deploy | **Staging** and **Production**: both Coolify, internal-only services, no public domain (called by [Núcleo](https://github.com/beto-dev/nucleo) server-to-server) |
| CI | GitHub Actions |

> **No standalone frontend.** `apps/web` (the original React app) was retired 2026-11-26 — [Núcleo](https://github.com/beto-dev/nucleo) is the only frontend now, calling this API server-to-server over the internal Docker network. Vercel + Koyeb (the old hosting for `apps/web` + this API) were fully decommissioned the same day — both projects deleted outright (not just paused), and the stale Koyeb/Vercel/Railway redirect URIs removed from the Google OAuth client, leaving only the one Supabase's own login flow uses. The standalone Supabase project (`cittnwuoacvipjyillsr`) is separate and still exists — see the Obsidian vault for that decommission step.

Architecture: **Clean Architecture** — `domain/` → `application/` → `infrastructure/` → `presentation/`

---

## Monorepo Structure

```
apps/
  api/        # Python FastAPI backend — the only app in this repo
    domain/          # entities + repository interfaces (ABCs)
    application/     # use cases
    infrastructure/  # SQLAlchemy repos, AI, parsers, Supabase
    presentation/    # FastAPI routes + dependencies
    tests/           # pytest unit + integration tests
```

`apps/web` and `apps/e2e` (the original React frontend and its Playwright suite) were deleted 2026-11-26 — see the Authentication and Deployment sections below. Equivalent functionality lives in [Núcleo](https://github.com/beto-dev/nucleo) (`src/app/(app)/finanzas/`), a separate repo.

---

## API Endpoints

| Route | File | Description |
|---|---|---|
| `/api/health` | health.py | Health check |
| `/api/auth/me` | auth.py | Current user's id/email/full_name — the only surviving route in this file; called by Núcleo's Familia pages. `register`/`login`/`google`/`google/callback` were deleted 2026-11-26 along with `apps/web` (the only thing that used them) |
| `/api/charges/*` | charges.py | Charges CRUD, bulk confirm/unshare, categories |
| `/api/statements/*` | statements.py | Upload + parse bank statements |
| `/api/families/*` | families.py | Family management |
| `/api/chat` | chat.py | Chat AI agent — natural-language Q&A over the user's charges (Claude tool-calling) |
| `/api/debug/*` | debug.py | Debug endpoints (disabled in prod — 404 without `ENABLE_DEBUG_ENDPOINTS`) |

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
| 4.1 | Production deployment | ✅ Done (2026-11-26) — dedicated `production` environment in Coolify for `finances-app-api`, internal-only, deploying from `main` (now reconciled with `staging`, see Deployment section). Data fully migrated to the shared Supabase project. Old Vercel+Koyeb production is redundant, pending decommission. |
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

- **Supabase Auth only, via Núcleo.** Núcleo (the frontend) handles login entirely through `supabase.auth.signInWithOAuth({provider: "google"})` — a single fixed callback (`https://<shared-supabase-project>.supabase.co/auth/v1/callback`) that Supabase manages in its own dashboard, not in this repo. This API verifies the resulting Supabase JWTs directly (`infrastructure/auth/supabase_middleware.py`, JWKS/ES256).
- **This API's own login is gone** (2026-11-26, along with `apps/web`): `register`, `login`, `google`, `google/callback` in `auth.py` were deleted — they were only ever used by the now-retired standalone React frontend. `GET /api/auth/me` survives because Núcleo itself calls it (`getMe()` in its `src/lib/finances/client.ts`, used by the Familia pages).
- The legacy HS256 JWT fallback in `supabase_middleware.py` is kept only because `/api/debug/dev-login` (disabled in prod) still uses `create_access_token` for local/staging convenience.
- **`ALLOWED_EMAILS`**: backend env var that restricts which emails can reach the API, set per Coolify environment. Enforced in `_check_allowed_email` (`infrastructure/auth/supabase_middleware.py`), called from `_resolve_supabase_user` for every Supabase-verified request — **this is new as of 2026-11-26**. The check previously only existed inside the now-deleted `google_callback`, which only ever gated `apps/web`'s own login; the real Núcleo/Supabase-JWT path had no email gate at all until now. Empty env var = allow any authenticated email (same fallback behavior as before).

---

## CI / Quality

- **GitHub Actions** runs on every push to `main` and `staging`
- Jobs: API lint (ruff), API type check (mypy), API tests (pytest), Security audit (pip-audit + bandit) — the `web-*` jobs (type-check+lint, build, E2E/Playwright) were removed 2026-11-26 along with `apps/web`
- **Ruff** config: `line-length = 120`, rules E/F/I/N/W/UP, `known-first-party` includes all local packages
- **Mypy**: `check_untyped_defs = true`, `warn_unused_ignores = true` — this means any unnecessary `# type: ignore` will cause CI to fail
- Mock repos in tests inherit from the ABC interfaces — do not add untyped mocks

---

## Deployment

> ✅ **Both environments on Coolify — Vercel and Koyeb are gone.** `staging` and `main` were reconciled 2026-11-26 (PR #25: staging's 17-commit lead merged into `main`, including the one real migration-revision collision — see `apps/api/alembic/versions/`). `main` now has its own dedicated Coolify `production` environment for `finances-app-api`, cloned from the staging resource (same internal-only pattern, no public domain). Vercel and Koyeb were deleted outright the same day, once `apps/web` and this API's own legacy login were retired (PR #26). Status tracked in the Obsidian vault: `Núcleo/Status — migración a Núcleo (VPS).md`.

### Branch strategy

```
feature/* ──PR──▶ staging ──auto-deploy──▶ Coolify "staging" env (finances-app-api, internal only)
                      │
                      └──PR──▶ main ──auto-deploy──▶ Coolify "production" env (finances-app-api, internal only)
```

- **`staging` branch** → Coolify `staging` environment — auto-deploy on push
- **`main` branch** → Coolify `production` environment — auto-deploy on push (verified via the PR #25 and #26 merges, both deployed cleanly)
- Vercel + Koyeb — **deleted outright 2026-11-26**, not just disconnected. There is no fallback deploy target anymore; `main` → Coolify `production` is the only path.

### Platform config

| Component | Staging (Coolify) | Production (Coolify) |
|-----------|---------|---|
| Frontend | none — Núcleo (`nucleo-staging.alberto-tejos.cl`) is the only frontend, calls this API server-to-server | none — Núcleo (`nucleo.alberto-tejos.cl`) calls this API server-to-server |
| API | `finances-app-api` Coolify service, internal network alias `finances-app-api-staging`, no public domain | `finances-app-api` Coolify service, internal network alias `finances-app-api`, no public domain |
| Database | Supabase shared project `sexqvaebanfvrknsmbmr` (`finances-app-beta`), shared with Núcleo | same shared project `sexqvaebanfvrknsmbmr` |

Vercel (old `apps/web` hosting) and Koyeb (old API hosting) were deleted outright 2026-11-26 — not paused, not disconnected, gone. The standalone Supabase project (`cittnwuoacvipjyillsr`) is a separate, still-pending step (deleting it is irreversible, so it's gated behind its own explicit confirmation) — see the Obsidian vault (`Núcleo/Status — migración a Núcleo (VPS).md`) for the cutover log and what's left.

- **`ALLOWED_EMAILS`** controls who can log in — enforced in `supabase_middleware.py` (see Authentication), set separately per Coolify environment
- **`ENABLE_DEBUG_ENDPOINTS`** and **`DEV_USER_EMAIL`** must NOT be set in production (debug routes return 404 without `ENABLE_DEBUG_ENDPOINTS`)
- The shared Supabase project is on the free plan — a `pg_cron` keep-alive job (added 2026-11-25) prevents it auto-pausing from inactivity
- **RLS is enabled** on all tables in the shared Supabase project
- Known cosmetic issue: the `production` Coolify resource for `finances-app-api` had an auto-generated public `*.sslip.io` domain left over from cloning it from staging — removed 2026-11-26 via the Coolify REST API (the web form for clearing a domain didn't persist the change; a known, previously-documented Coolify UI bug)

---

## Environment Variables

| Variable | Staging (Coolify) | Production (Coolify) |
|---|---|---|
| `APP_ANTHROPIC_API_KEY` | ✅ | ✅ same value |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY` | shared project (`sexqvaebanfvrknsmbmr`) | shared project (`sexqvaebanfvrknsmbmr`) |
| `JWT_SECRET` | ✅ (legacy HS256 fallback, only reachable via `/api/debug/dev-login`) | ✅ same value |
| `ALLOWED_EMAILS` | staging list | production list — must cover every real Núcleo user, now actually enforced (see Authentication) |
| `ENABLE_DEBUG_ENDPOINTS`, `DEV_USER_EMAIL` | set (dev convenience) | unset |
| `DATABASE_URL` | shared Supabase (Session pooler) | shared Supabase (Session pooler) |

`VITE_API_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_LOGIN_REDIRECT_URI`, `FRONTEND_URL`, `BACKEND_URL` were all removed 2026-11-26 — they only existed for `apps/web` and the legacy login flow, both now deleted.
