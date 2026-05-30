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
| Deploy | Vercel (frontend) + Koyeb (API) |
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
| 3.5 | Chat agent UI | ⏳ Pending |
| 3.6 | Email ingestion | ⏳ Pending |
| 3.7 | Multi-currency | ⏳ Pending |
| 3.8 | Export & reports | ⏳ Pending |
| 3.9 | Audit log | ⏳ Pending |
| 3.10 | Créditos bancarios | ✅ Done — track bank loans on dashboard; shows cuotas paid/remaining and amount already paid per credit and per cuota row |

### Phase 4 — Deploy & Mobile

| # | Task | Status |
|---|---|---|
| 4.1 | Production deployment | ✅ Done (Vercel + Koyeb) |
| 4.2 | Monitoring | ⏳ Pending |
| 4.3–4.5 | Mobile (React Native) | ⏳ Pending |

### Backlog — High Priority

| Task | Notes |
|---|---|
| Edit statement type after upload | Today requires delete + re-upload if wrong type selected |
| Monthly budget per category | Set a spending limit per category with progress bar and alert |
| Notification when statement finishes processing | Currently user must refresh to know when parsing is done |

### Backlog — Medium Priority

| Task | Notes |
|---|---|
| Edit charge description | Clean up cryptic bank names (e.g. "TRF 0000123456" → "Netflix") |
| Recurring charges | Mark a charge as fixed (rent, internet) to auto-appear each month |
| Global search | Search across all charges from all months in one place |
| Filter charges by "Sin categoría" | ✅ Done — added as option in category filter dropdown |

---

## CI / Quality

- **GitHub Actions** runs on every push to `main`
- Jobs: API lint (ruff), API type check (mypy), API tests (pytest), Web build, Web type check + lint, E2E tests (Playwright), Security audit
- **Ruff** config: `line-length = 120`, rules E/F/I/N/W/UP, `known-first-party` includes all local packages
- **Mypy**: `check_untyped_defs = true`, `warn_unused_ignores = true` — this means any unnecessary `# type: ignore` will cause CI to fail
- Mock repos in tests inherit from the ABC interfaces — do not add untyped mocks

---

## Deployment

- **Frontend**: Vercel, auto-deploy on push to `main`
- **API**: Koyeb, Docker-based, auto-deploy on push to `main`
- **`ALLOWED_EMAILS`** in Koyeb env controls who can log in during beta
- **`ENABLE_DEBUG_ENDPOINTS`** must NOT be set in production (debug routes return 404 without it)

See `BETA_LAUNCH.md` for full deployment guide and ops runbook.

---

## Environment Variables

| Variable | Where |
|---|---|
| `VITE_API_URL` | Vercel |
| `APP_ANTHROPIC_API_KEY` | Koyeb |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY` | Koyeb |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Koyeb |
| `GOOGLE_LOGIN_REDIRECT_URI`, `GOOGLE_REDIRECT_URI` | Koyeb |
| `JWT_SECRET` | Koyeb |
| `FRONTEND_URL` | Koyeb |
| `ALLOWED_EMAILS` | Koyeb |
