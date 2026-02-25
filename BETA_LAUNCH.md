# Beta Privada — Guía de Setup y Workflow Diario

## 1. Requisitos previos

- [ ] Cuenta en GitHub (repo ya creado)
- [ ] Cuenta en Vercel (frontend)
- [ ] Cuenta en Koyeb (API)
- [ ] Cuenta en Supabase (auth + storage)

---

## 2. Setup único — Conectar plataformas a GitHub

### Vercel (frontend)

1. Ir a [vercel.com](https://vercel.com) → Import Project
2. Conectar GitHub → seleccionar este repo
3. Framework: Vite | Root Directory: `apps/web`
4. Settings → Environment Variables → agregar:
   ```
   VITE_API_URL=https://tu-api.koyeb.app
   ```
5. Branch `main` → auto-deploy activado por defecto ✅

### Koyeb (API)

1. Ir a [koyeb.com](https://koyeb.com) → Create Service → Docker
2. Conectar GitHub → seleccionar este repo
3. Configuración:
   - **Build context:** `/` (raíz del repo, no `apps/api/`)
   - **Dockerfile path:** `apps/api/Dockerfile`
   - **Branch:** `main` → auto-deploy on push ✅
4. Environment Variables → agregar todas las del `.env.example` **excepto** `ENABLE_DEBUG_ENDPOINTS`

### Variables de entorno en producción

Copiar todos los valores del `.env.example` a Vercel y Koyeb según corresponda:

| Variable | Vercel | Koyeb |
|---|---|---|
| `VITE_API_URL` | ✅ | — |
| `APP_ANTHROPIC_API_KEY` | — | ✅ |
| `GROQ_API_KEY` | — | ✅ |
| `GEMINI_API_KEY` | — | ✅ |
| `SUPABASE_URL` | — | ✅ |
| `SUPABASE_ANON_KEY` | — | ✅ |
| `SUPABASE_SERVICE_KEY` | — | ✅ |
| `GOOGLE_CLIENT_ID` | — | ✅ |
| `GOOGLE_CLIENT_SECRET` | — | ✅ |
| `GOOGLE_LOGIN_REDIRECT_URI` | — | ✅ (URL de producción) |
| `GOOGLE_REDIRECT_URI` | — | ✅ (URL de producción) |
| `JWT_SECRET` | — | ✅ (valor seguro, no el default) |
| `FRONTEND_URL` | — | ✅ (URL de Vercel) |
| `ALLOWED_EMAILS` | — | ✅ |

> **Nota:** `ENABLE_DEBUG_ENDPOINTS` NO va en producción. Sin esa variable, los endpoints `/api/debug/*` devuelven 404.

---

## 3. Cómo agregar/quitar testers

Editar la variable `ALLOWED_EMAILS` en Koyeb → Environment Variables:

```
ALLOWED_EMAILS=tester1@gmail.com,tester2@gmail.com,familiar@outlook.com
```

- Vacío (`ALLOWED_EMAILS=`) = sin restricción (cuidado en beta)
- La API lee la variable en tiempo de ejecución — Koyeb reinicia el servicio automáticamente al guardar

---

## 4. Workflow desde iPhone

### Apps necesarias

| App | Precio | Uso |
|---|---|---|
| [Working Copy](https://workingcopyapp.com) | $20 USD | Git client completo en iOS |
| [GitHub Mobile](https://github.com/mobile) | Gratis | Ver CI status, reviews |

### Pasos para un fix desde iPhone

1. **Working Copy** → abrir repo → navegar al archivo → editar → guardar
2. Working Copy → Changes → seleccionar archivo → Commit → escribir mensaje → **Push** a `main`
3. **GitHub Mobile** → pestaña Actions → ver los 2 jobs corriendo (~2 min)
4. Si CI pasa ✅:
   - **Vercel** (Safari) → deployment automático en ~1 min
   - **Koyeb** (Safari) → build automático en ~3-5 min
5. Compartir link a testers ✅

### Para fixes de código complejos desde iPhone

Usar **GitHub Codespaces** en Safari (VS Code completo en browser):

1. github.com → tu repo → presionar `.` (punto) → abre VS Code web
2. O ir a github.com/codespaces → New codespace → seleccionar repo
3. Terminal integrada, extensiones, todo incluido — gratis con GitHub

---

## 5. Workflow desde Mac (fallback)

```bash
# 1. Hacer el fix en tu editor
# 2. Commit y push
git add apps/...archivo-modificado...
git commit -m "fix: descripción breve del fix"
git push origin main

# 3. Ver CI en GitHub
# → github.com/tu-usuario/tu-repo/actions

# 4. Vercel y Koyeb despliegan automáticamente al pasar CI
```

**Links útiles:**
- GitHub Actions: `github.com/tu-usuario/tu-repo/actions`
- Vercel dashboard: `vercel.com/dashboard`
- Koyeb dashboard: `app.koyeb.com`

---

## 6. Qué hacer cuando algo falla

### CI falla (GitHub Actions)

1. GitHub Mobile o github.com → Actions → click en el job rojo
2. Ver el log — generalmente es un error de lint o type-check
3. Corregir el error → nuevo commit → push → CI corre de nuevo

### Deploy de Vercel falla

1. Vercel dashboard → Deployments → click en el deploy fallido → ver logs
2. Casi siempre es una variable de entorno faltante o un build error de TypeScript
3. Si es variable de entorno: Settings → Environment Variables → agregar → Redeploy

### Deploy de Koyeb falla

1. Koyeb dashboard → tu servicio → Deployments → click en el deployment → ver logs
2. Si es error de Docker build: revisar `apps/api/Dockerfile`
3. Si es error de startup (crash al iniciar): revisar variables de entorno — probablemente falta una clave

### La API funciona pero responde 500

1. Koyeb → tu servicio → Logs (runtime, no build)
2. Buscar el traceback de Python
3. Si dice `APP_ANTHROPIC_API_KEY` not set o similar → agregar la variable en Koyeb

### Un tester no puede hacer login

1. Verificar que su email esté en `ALLOWED_EMAILS` en Koyeb
2. Koyeb → Environment Variables → editar `ALLOWED_EMAILS` → guardar
3. El servicio reinicia solo (~30 seg) → tester puede intentar de nuevo

---

## 7. Verificación post-deploy

- [ ] `https://tu-frontend.vercel.app` carga sin errores
- [ ] Login con Google funciona
- [ ] `https://tu-api.koyeb.app/api/health` devuelve `{"status": "ok"}`
- [ ] `https://tu-api.koyeb.app/api/debug/parse-all-tables` devuelve **404** (endpoints debug deshabilitados)
- [ ] Subir un estado de cuenta prueba y ver que parsea correctamente
