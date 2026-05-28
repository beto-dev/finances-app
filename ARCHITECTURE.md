# Arquitectura, Infraestructura y Deployment

Este documento describe cómo está organizado el proyecto, qué servicios externos usa, y cómo se mueve el código desde el repositorio hasta producción.

---

## 1. Vista general

```
┌─────────────────────────────────────────────────────────────────┐
│                        Usuario / Browser                        │
└───────────────────────────────┬─────────────────────────────────┘
                                │ HTTPS
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                 Vercel (CDN global)                             │
│           React + TypeScript + Vite (SPA)                       │
│           apps/web  →  vercel.json                             │
└───────────────────────────────┬─────────────────────────────────┘
                                │ REST / JSON  (VITE_API_URL)
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Koyeb (contenedor)                           │
│              FastAPI + Python 3.12 (apps/api)                  │
│              uvicorn  |  Alembic migrations                     │
└──────┬───────────┬──────────────┬──────────┬───────────────────┘
       │           │              │          │
       ▼           ▼              ▼          ▼
  PostgreSQL   Supabase       Claude /    Google APIs
  (Supabase    Auth /        Groq /      (Sheets + OAuth)
   o Neon)     Storage       Gemini
```

---

## 2. Arquitectura del backend (Clean Architecture)

El backend sigue **Clean Architecture** con cuatro capas. Las dependencias siempre apuntan hacia adentro: la capa de dominio no conoce nada de infraestructura.

```
apps/api/
├── domain/              ← Capa 1: reglas de negocio puras
│   ├── entities/        #  Charge, Statement, Family, User, Category
│   ├── repositories/    #  interfaces (ABCs) — nunca implementaciones
│   └── value_objects/   #  Money
│
├── application/         ← Capa 2: casos de uso
│   ├── use_cases/       #  upload_statement, parse_statement,
│   │                    #  categorize_charges, review_charges,
│   │                    #  sync_to_sheets, manage_family
│   └── services/        #  parser_service, categorization_service
│
├── infrastructure/      ← Capa 3: implementaciones concretas
│   ├── database/        #  SQLAlchemy models + conexión asyncpg
│   ├── ai/              #  claude_categorizer, claude_parser,
│   │                    #  gemini_parser, groq_parser
│   ├── parsers/         #  csv_parser, excel_parser, base_parser
│   ├── google/          #  sheets_client, oauth_client
│   └── auth/            #  supabase_middleware (JWT validation)
│
└── presentation/        ← Capa 4: HTTP
    ├── main.py          #  FastAPI app + CORS + routers
    ├── api/             #  endpoints por feature
    ├── schemas/         #  Pydantic request/response models
    ├── middleware/       #  logging, error handling
    └── dependencies.py  #  inyección de dependencias (repositorios)
```

### Flujo de una petición

```
HTTP Request
    ↓
presentation/api/<router>.py   (valida esquema Pydantic)
    ↓
application/use_cases/*.py     (orquesta la lógica)
    ↓
domain/repositories/*.py       (interfaz abstracta)
    ↓
infrastructure/database/*.py   (SQLAlchemy + asyncpg → PostgreSQL)
```

---

## 3. Arquitectura del frontend (Feature-based)

```
apps/web/src/
├── app/              ← router, providers, layout global
├── features/         ← una carpeta por dominio funcional
│   ├── auth/         #  login, Google OAuth callback
│   ├── charges/      #  tabla de cargos, revisión, filtros
│   ├── contributions/#  aportes entre miembros de la familia
│   ├── dashboard/    #  resumen mensual (Recharts)
│   ├── expenses/     #  vista de gastos
│   ├── family/       #  gestión de miembros e invitaciones
│   ├── sheets/       #  conexión y sync con Google Sheets
│   └── upload/       #  subida de estados de cuenta
└── shared/           ← componentes y utilidades reutilizables
```

**Stack frontend:**

| Pieza | Librería |
|---|---|
| Framework | React 18 + TypeScript |
| Build | Vite 6 |
| Routing | React Router v7 |
| Datos remotos | TanStack Query v5 |
| HTTP client | Axios |
| Charts | Recharts |
| Estilos | Tailwind CSS |
| Tests unitarios | Vitest |
| Tests E2E | Playwright |

---

## 4. Servicios externos

### 4.1 Supabase
- **Auth**: maneja el registro, login con email/password y Google OAuth. El backend valida el JWT de Supabase en cada petición protegida (`supabase_middleware.py`).
- **Storage**: almacena los archivos de estados de cuenta (PDF, Excel, CSV) subidos por el usuario.
- **Nota**: la base de datos PostgreSQL puede ser la de Supabase o una instancia separada (Neon) — ambas son compatibles vía `DATABASE_URL`.

### 4.2 Claude API (Anthropic) / Groq / Gemini
- **Parser primario**: `claude_parser.py` usa Claude para extraer cargos de extractos bancarios en texto.
- **Categorizador**: `claude_categorizer.py` clasifica cada cargo (Comida, Transporte, Suscripciones, etc.).
- **Fallback chain**: si Claude falla o no está configurado → Groq → Gemini.
- La clave se inyecta vía `APP_ANTHROPIC_API_KEY`.

### 4.3 Google APIs
- **OAuth2 (login)**: flujo separado del de Supabase, para vincular la cuenta de Google del usuario y obtener permisos de Sheets.
- **Google Sheets**: `sheets_client.py` crea y actualiza la planilla mensual de la familia con los cargos categorizados. La sincronización es idempotente.

---

## 5. Deployment

### 5.1 GitHub → CI antes del merge

Cada push o PR a `main` dispara el pipeline en **GitHub Actions** (`.github/workflows/ci.yml`):

```
Push / PR a main
    │
    ├── api-lint          ruff check apps/api/
    ├── api-type-check    mypy apps/api/
    ├── api-test          pytest con Postgres real (service container)
    │
    ├── web-check         tsc --noEmit + eslint
    ├── web-build         npm run build (smoke test)
    ├── web-e2e           Playwright (Chromium)
    │
    └── security-scan     pip-audit + bandit + npm audit
```

El código solo llega a producción si todos los jobs pasan.

### 5.2 Backend → Koyeb

**Koyeb** es una plataforma de contenedores serverless que despliega a partir de la imagen Docker del API.

```
GitHub (main)
    │  push detectado
    ▼
Koyeb build runner
    │  docker build -f apps/api/Dockerfile .
    │  (instala ghostscript, poppler, dependencias Python)
    ▼
Koyeb service (contenedor corriendo)
    │  entrypoint.sh:
    │    1. alembic upgrade head   ← migraciones automáticas al arrancar
    │    2. uvicorn presentation.main:app --host 0.0.0.0 --port 8000
    ▼
HTTPS público  →  https://api.<proyecto>.koyeb.app
```

**Variables de entorno en Koyeb** (configuradas en el panel, nunca en el repo):

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | PostgreSQL (Supabase o Neon) |
| `SUPABASE_URL` / `_ANON_KEY` / `_SERVICE_KEY` | Auth y Storage |
| `APP_ANTHROPIC_API_KEY` | Claude API |
| `GROQ_API_KEY` / `GEMINI_API_KEY` | Parsers de fallback |
| `GOOGLE_CLIENT_ID` / `_SECRET` | OAuth2 + Sheets |
| `GOOGLE_REDIRECT_URI` / `GOOGLE_LOGIN_REDIRECT_URI` | Callbacks en producción |
| `JWT_SECRET` | Firma de tokens internos |
| `FRONTEND_URL` | Usado en CORS y redirects |
| `BACKEND_URL` | Self-reference para callbacks |
| `ALLOWED_EMAILS` | Lista blanca de acceso (beta) |

### 5.3 Frontend → Vercel

**Vercel** sirve el SPA de React como archivos estáticos desde una CDN global.

```
GitHub (main)
    │  push detectado por Vercel
    ▼
Vercel build
    │  npm ci && npm run build
    │  (tsc -b && vite build  →  dist/)
    ▼
Vercel CDN (edge nodes globales)
    │  vercel.json configura:
    │    - SPA rewrites: todo /* → /index.html
    │    - Security headers: X-Frame-Options, CSP, etc.
    ▼
HTTPS público  →  https://<proyecto>.vercel.app
```

**Variable de entorno en Vercel:**

| Variable | Descripción |
|---|---|
| `VITE_API_URL` | URL pública del backend en Koyeb |

> Las variables `VITE_*` se inlinean en el bundle en build time — no son secretos en runtime.

---

## 6. Desarrollo local

Con **Docker Compose** se levanta todo el stack sin instalar nada extra:

```bash
docker compose up
```

```
docker-compose.yml
├── db       postgres:16-alpine  →  localhost:5432
├── api      Dockerfile (apps/api)  →  localhost:8000
│              volumen: ./apps/api:/app (hot reload)
│              comando: alembic upgrade head && uvicorn --reload
└── web      Dockerfile (apps/web)  →  localhost:5173
               volumen: ./apps/web:/app (Vite HMR)
```

Variables locales se leen desde `.env` en la raíz (copiar de `.env.example`).

---

## 7. Base de datos y migraciones

- **ORM**: SQLAlchemy 2 (async con asyncpg)
- **Migraciones**: Alembic, versionadas en `apps/api/alembic/versions/`
- En **local**: las migraciones corren automáticamente al levantar el contenedor `api`
- En **Koyeb**: `entrypoint.sh` ejecuta `alembic upgrade head` antes de iniciar uvicorn
- En **CI**: el job `api-test` corre las migraciones contra un contenedor Postgres efímero

Historial de migraciones actual:

| Versión | Cambio |
|---|---|
| 0001 | Esquema inicial (users, families, statements, charges, categories) |
| 0002 | Aportes entre miembros de familia |
| 0003 | Campo `is_active` en miembros |
| 0004 | Rename rol `owner` |
| 0005 | `family_id` nullable en statements |
| 0006 | Rename `is_confirmed` → `is_shared` en charges |

---

## 8. Flujo completo de datos

```
1. Usuario sube PDF/Excel/CSV
       ↓  POST /api/statements/upload
2. API guarda el archivo en Supabase Storage
       ↓
3. Parser (pdfplumber / openpyxl / pandas) extrae filas
       ↓
4. Claude AI categoriza cada cargo
       ↓
5. Cargos se guardan en PostgreSQL (estado: pending review)
       ↓
6. Usuario revisa en /gastos — confirma, edita, descarta
       ↓
7. POST /api/sheets/sync  →  sheets_client escribe en Google Sheets
```

---

## 9. Seguridad

- **Auth**: JWT de Supabase validado en cada endpoint protegido por `supabase_middleware.py`
- **Lista blanca**: `ALLOWED_EMAILS` restringe el acceso durante la beta
- **CORS**: solo permite origen `FRONTEND_URL`
- **Headers**: Vercel inyecta `X-Frame-Options`, `CSP`, `X-Content-Type-Options`, etc. (`vercel.json`)
- **Secretos**: nunca en el repositorio — siempre en el panel de Koyeb / Vercel / GitHub Secrets
- **CI Security**: `pip-audit` + `bandit` + `npm audit` en cada PR
