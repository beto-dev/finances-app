# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

**Finances** — A family personal finance organizer. Users upload bank statements (PDF/Excel/CSV), the app parses and AI-categorizes charges, and syncs results to a shared Google Spreadsheet. Web-first, then React Native mobile.

---

## Recommended Stack

| Layer | Choice |
|---|---|
| Backend | Python + FastAPI |
| Frontend (Web) | React + TypeScript + Vite |
| Mobile (later) | React Native + Expo |
| Database | PostgreSQL + Alembic migrations |
| Auth + Storage | Supabase (Auth + Storage) |
| AI Agent | Claude API + MCP (custom MCP server) |
| Monorepo | Turborepo |
| Infra | Docker + docker-compose |

Architecture: **Clean Architecture** — `domain/` → `application/` → `infrastructure/` → `presentation/`, applied to both the Python backend and the React frontend (feature-based folders).

---

## Monorepo Structure

```
apps/
  api/        # Python FastAPI backend
  web/        # React + TypeScript frontend
  mobile/     # React Native + Expo (Phase 4)
packages/
  shared-types/  # TypeScript types shared between web and mobile
```

---

## Development Plan

### Phase 1 — Setup

| # | Task | Description | Complexity |
|---|---|---|---|
| 1.1 | **Monorepo scaffold** | Init Turborepo with `apps/web`, `apps/api`, `packages/shared-types`. Configure workspaces, TypeScript paths, shared ESLint/Prettier. | S |
| 1.2 | **Backend skeleton** | FastAPI app with Clean Architecture folder structure: `domain/`, `application/`, `infrastructure/`, `presentation/`. Add Alembic for migrations. | M |
| 1.3 | **Frontend skeleton** | React + TypeScript + Vite app. Feature-based folder structure (`features/upload`, `features/charges`, `features/sheets`). Add React Router, Tanstack Query. | M |
| 1.4 | **Database setup** | PostgreSQL via Docker. Define initial schema: `users`, `families`, `statements`, `charges`, `categories`, `google_sheet_configs`. | M |
| 1.5 | **Auth integration** | Supabase Auth in both backend (JWT middleware) and frontend. Support email/password + Google OAuth. Family invite system via shared `family_id`. | M |
| 1.6 | **Dev environment** | `docker-compose.yml` for Postgres + Redis + API + Web. `.env.example` with all required keys. One-command `make dev` startup. | S |
| 1.7 | **CI pipeline** | GitHub Actions: lint, type-check, and test on every PR for both `apps/api` and `apps/web`. | S |

---

### Phase 2 — Core Features

| # | Task | Description | Complexity |
|---|---|---|---|
| 2.1 | **File upload API** | Endpoint to receive PDF/Excel/CSV files. Store in Supabase Storage. Track upload metadata in DB (source bank hint, upload date, family, uploader). | M |
| 2.2 | **Bank statement parser — PDF** | Use `pdfplumber` + `camelot` to extract tables from PDF bank statements. Since every bank formats PDFs differently, build a parser pipeline with pluggable bank adapters (strategy pattern). Output: normalized list of `{date, description, amount, currency}`. | L |
| 2.3 | **Bank statement parser — Excel/CSV** | Use `openpyxl`/`pandas` to parse Excel and CSV exports. Same adapter pattern as PDF. Handle different column orderings, date formats, decimal separators (important for Spanish-language banks). | M |
| 2.4 | **AI-powered charge categorization** | Use Claude API to classify each charge into categories (e.g., Food, Transport, Subscriptions, Health). Send batch of charges with context. Store category suggestions; user confirms or overrides. Learn from corrections per family. | L |
| 2.5 | **MCP server for AI agent** | Build a custom MCP server that exposes tools: `parse_statement`, `categorize_charges`, `get_monthly_summary`, `update_spreadsheet`. This lets Claude act as a financial agent — users can chat with it to query and manipulate their data. | L |
| 2.6 | **Charge review UI** | Web screen showing parsed charges in a table. User can: confirm category, edit category, merge duplicates, flag as unknown. Bulk actions. Real-time save via optimistic updates. | M |
| 2.7 | **Google Sheets integration** | OAuth2 flow to connect user's Google account. On first use, create a new spreadsheet with monthly tabs. On each sync, append/update that month's categorized charges. Idempotent — re-running doesn't duplicate rows. | L |
| 2.8 | **Family workspace** | One family = one shared data space. Invite members by email. All members see the same statements, charges, and spreadsheet. Role: Owner can manage members and Google Sheet config. | M |
| 2.9 | **Monthly dashboard** | Summary view: total spent by category per month, comparison vs previous month, breakdown by account type (checking, credit card, credit line). Recharts-based. | M |

---

### Phase 3 — Polish

| # | Task | Description | Complexity |
|---|---|---|---|
| 3.1 | **Persistent category memory** | Store user-confirmed charge→category mappings per family. Auto-apply them on future uploads (e.g., "Apple" → always "Subscriptions" for this family). | S |
| 3.2 | **Chat agent UI** | Conversational interface backed by MCP. User asks: "What did we spend on restaurants in January?" or "Add this charge to Food". Claude uses MCP tools to answer. | M |
| 3.3 | **Email ingestion (optional input)** | Allow user to forward bank emails to a unique inbox address. Backend parses the email body/attachments automatically, skipping the manual upload step. | L |
| 3.4 | **Multi-currency support** | Detect currency per charge. Convert to base family currency using historical exchange rates (e.g., Open Exchange Rates API). Display in both original and base currency. | M |
| 3.5 | **Export & reports** | Export monthly summary as PDF or Excel directly from the app (in addition to Google Sheets). | S |
| 3.6 | **Audit log** | Track who uploaded what, who changed which category, when Google Sheets was last synced. Visible to family owner. | S |

---

### Phase 4 — Deploy & Mobile

| # | Task | Description | Complexity |
|---|---|---|---|
| 4.1 | **Production deployment** | Deploy API to Railway or Fly.io (containerized). Deploy frontend to Vercel. Managed PostgreSQL (Supabase or Neon). Set up secrets, SSL, domain. | M |
| 4.2 | **Monitoring & error tracking** | Integrate Sentry (both frontend and backend). Add structured logging (structlog). Health check endpoint. | S |
| 4.3 | **React Native app scaffold** | New `apps/mobile` in monorepo using Expo. Reuse `packages/shared-types` and API client. Auth via Supabase native SDK. | M |
| 4.4 | **Mobile core screens** | Port Upload, Charge Review, Dashboard, and Chat Agent screens to React Native. Use Expo Camera for scanning receipts as a bonus input method. | L |
| 4.5 | **App store prep** | App signing, privacy policy, app store listings for Google Play and Apple App Store. | M |

---

## Critical Path

`1.2 → 2.2/2.3 → 2.4 → 2.5 → 2.7`

The bank statement parser + AI categorization + MCP server + Google Sheets sync chain is the heart of the product. Everything else feeds into or depends on that pipeline.

---

## Key Domain Concepts

- **Family**: The top-level grouping. All data is scoped to a family. One Google Sheet per family.
- **Statement**: An uploaded file from a bank. Has a type (checking account / credit card / credit line).
- **Charge**: A single line item parsed from a statement. Has date, description, amount, currency, and a category.
- **Category**: User-confirmed or AI-suggested label (e.g., Food, Transport, Subscriptions).
- **Category Rule**: A persisted mapping from charge description pattern → category, scoped per family.
- **MCP Server**: Exposes financial data and actions as tools for Claude to use as an AI agent.
