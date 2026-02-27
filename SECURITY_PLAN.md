# SECURITY_PLAN.md — Finanzas

Guía de seguridad por capas para el despliegue en dominio propio y futuras apps móviles (iOS / Android).

> **Estado auditado:** 2026-02-27
>
> | Capa | Item | Estado | Archivos |
> |---|---|---|---|
> | Capa 1 | Cloudflare | ❌ Pendiente — infraestructura | — |
> | Capa 2 | `slowapi` rate limiting | ✅ Implementado | [`requirements.txt`](../apps/api/requirements.txt) · [`middleware/rate_limit.py`](../apps/api/presentation/middleware/rate_limit.py) · [`main.py`](../apps/api/presentation/main.py) · [`auth.py`](../apps/api/presentation/api/auth.py) · [`statements.py`](../apps/api/presentation/api/statements.py) |
> | Capa 3 | Security headers FastAPI | ✅ Implementado | [`middleware/security_headers.py`](../apps/api/presentation/middleware/security_headers.py) · [`main.py`](../apps/api/presentation/main.py) |
> | Capa 3 | Security headers Vercel | ✅ Implementado | [`vercel.json`](../apps/web/vercel.json) |
> | Capa 4 | JWT en httpOnly cookie | ❌ Pendiente — requiere dominio propio configurado | — |
> | Capa 5 | Validación magic bytes | ✅ Implementado | [`statements.py`](../apps/api/presentation/api/statements.py) |
> | CI | Bandit / SAST | ✅ Implementado | [`ci.yml`](../.github/workflows/ci.yml) |
> | Extra | CORS demasiado permisivo | ✅ Corregido | [`main.py`](../apps/api/presentation/main.py) |
> | Extra | `_login_states` en memoria | ❌ Pendiente — migrar a Redis con TTL | — |

---

## Modelo de amenazas

| Superficie de ataque | Riesgo concreto |
|---|---|
| Endpoints de autenticación | Brute force, credential stuffing |
| Endpoint de upload | Spam de archivos, DoS vía AI parsing (costoso) |
| Endpoints de datos familiares | Scraping de información privada |
| Token de sesión en cliente | XSS → robo de sesión |
| API URL pública | DDoS directo al origen |
| App móvil (futuro) | API key hardcodeada, traffic interception |

---

## Arquitectura de seguridad (por capas)

```
[Internet / Bots / Atacantes]
           ↓
    ┌──────────────┐
    │  CLOUDFLARE  │  ← Capa 1: red / DDoS / WAF / bot
    └──────┬───────┘
           ↓
    ┌──────────────┐          ┌────────────┐
    │    VERCEL    │          │   KOYEB    │  ← Capa 2: rate limiting en FastAPI
    │  (frontend)  │ ──REST──▶│  (API)     │
    └──────────────┘          └─────┬──────┘
                                    ↓
                              ┌─────────────┐
                              │  SUPABASE   │  ← Capa 3: row-level security
                              └─────────────┘
```

---

## Capa 1 — Cloudflare

Cloudflare cubre DDoS / WAF / bot protection con costo mínimo en esta escala.
Ver guía de implementación en [`docs/cloudflare-setup.md`](cloudflare-setup.md).

Configurar el origin (Koyeb) para **aceptar tráfico solo desde IPs de Cloudflare**.
Las IPs actualizadas están publicadas en [cloudflare.com/ips](https://www.cloudflare.com/ips/).

### Reglas recomendadas en Cloudflare

| Regla | Plan | Descripción |
|---|---|---|
| DDoS Managed Ruleset | Free | Automático, siempre activo |
| Rate Limiting en auth endpoints | Free | Límite por IP en login |
| Bot Fight Mode | Free | Bloquea bots conocidos |
| WAF Managed Rules (OWASP) | Pro | SQLi, XSS, path traversal |
| Turnstile CAPTCHA | Free | Reemplaza reCAPTCHA |

---

## Capa 2 — Rate limiting en FastAPI

Cloudflare puede ser bypaseado si el origin es conocido. La API se defiende de forma independiente con `slowapi`.

Los límites están configurados en [`presentation/middleware/rate_limit.py`](../apps/api/presentation/middleware/rate_limit.py) y aplicados como decoradores en los endpoints sensibles.

---

## Capa 3 — Security headers HTTP

### Backend (FastAPI)

Headers implementados en [`middleware/security_headers.py`](../apps/api/presentation/middleware/security_headers.py):
`X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`.

### Frontend (Vercel)

Headers configurados en [`vercel.json`](../apps/web/vercel.json):
CSP, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`.

---

## Capa 4 — JWT: migrar a httpOnly cookie

`localStorage` es vulnerable a XSS — cualquier script inyectado puede leer el token.

**Opción A (mínimo esfuerzo):** mantener localStorage con CSP estricto que bloquee scripts externos.

**Opción B (recomendado):** migrar a `httpOnly cookie` con `secure=True`, `samesite="lax"`.

Requiere que frontend y API compartan dominio raíz. Implementar después de configurar Cloudflare.

> Para la app móvil no aplican cookies — usar **Secure Storage** del dispositivo (Keychain en iOS, Keystore en Android).

---

## Capa 5 — Validación de archivos

No confiar en extensión ni en el `Content-Type` del cliente. Validar por magic bytes.
Implementado en [`presentation/api/statements.py`](../apps/api/presentation/api/statements.py).

---

## App Móvil — Fase 4 (iOS / Android)

| Riesgo | Solución |
|---|---|
| API keys hardcodeadas en el bundle | Nunca hardcodear — usar el backend como proxy |
| Traffic interception (MITM) | Certificate pinning con `react-native-ssl-pinning` |
| JWT storage inseguro | `expo-secure-store` (Keychain en iOS / Keystore en Android) |
| OAuth en WebView (deprecated) | `expo-auth-session` con PKCE — estándar actual |
| Rooting / jailbreak | `expo-device` + checks básicos como capa disuasoria |

---

## Roadmap

### Antes de publicar el dominio (infraestructura)

- [ ] Conectar dominio a Cloudflare — ver [`docs/cloudflare-setup.md`](cloudflare-setup.md)
- [ ] Activar Bot Fight Mode + Rate Limiting en Cloudflare
- [ ] Configurar Koyeb para aceptar solo IPs de Cloudflare

### Próximas semanas

- [ ] Migrar JWT a `httpOnly cookie` (`samesite=lax`, `secure=True`)
- [ ] Migrar CSRF state de dict en memoria → Redis con TTL
- [ ] Cloudflare Turnstile en el formulario de login
- [ ] Revisar CSP hasta que no haya violaciones en consola del browser

### Fase móvil

- [ ] `expo-secure-store` para JWT (nunca `AsyncStorage`)
- [ ] `expo-auth-session` con PKCE para OAuth
- [ ] Certificate pinning
- [ ] No hardcodear ninguna API key en el bundle
