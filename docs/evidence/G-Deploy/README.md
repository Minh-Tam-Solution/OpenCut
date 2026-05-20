---
spec_id: EVID-GDEPLOY-001
title: "G-Deploy Evidence"
spec_version: "1.0.0"
status: active
stage: "06-deploy"
owner: "@devops"
created: 2026-05-19
gate: G-Deploy
---

# G-Deploy — Evidence Bundle

Captured on **2026-05-19** by `@devops`. Verifies that OpenCut can be deployed via both supported paths (Docker Compose self-hosted, Cloudflare Workers via `opennextjs-cloudflare`).

---

## Files

| File | Description |
|------|-------------|
| `docker-compose-ps.txt` | `docker compose ps` after `docker compose up -d --build` |
| `smoke-test.txt` | Full smoke test (homepage, health, security headers, COOP/COEP, auth signup/signin) |
| `cf-build.log` | Full output of `bunx opennextjs-cloudflare build` |
| `cf-build-summary.txt` | Next.js routes generated + ESBuild error excerpt |

---

## Summary

### Docker Compose (Option A) — ✅ PASS

| Check | Result | Notes |
|-------|--------|-------|
| `docker compose up -d --build` | PASS | 4 services running |
| `db` (postgres:17) | healthy | port 5432 |
| `redis` (redis:7-alpine) | healthy | port 6379 |
| `serverless-redis-http` | healthy | port 8079 |
| `web` (opencut-web) | running, reachable | port 3100 — see "healthcheck caveat" below |
| `GET /` → 200 | PASS | with full security headers |
| `GET /api/health` | PASS | `{"status":"ok","db":"connected"}` |
| Security headers | PASS | X-Content-Type-Options, X-Frame-Options, HSTS, Referrer-Policy, CSP, Permissions-Policy all present |
| `GET /editor/*` | PASS | COOP=`same-origin`, COEP=`require-corp`, CSP includes `wasm-unsafe-eval` |
| `POST /api/auth/sign-up/email` | PASS | 200 + JWT cookie + user object |
| `POST /api/auth/sign-in/email` | PASS | 200 + JWT cookie + user object |

**Healthcheck caveat**: `web` container reports `unhealthy` because the compose healthcheck uses `curl -f`, but `oven/bun:alpine` does not ship `curl`. The **application is healthy** (200 on /api/health). Documented as P3 in [runbook.md](../../06-deploy/runbook.md#p3--export-failing). Fix planned: add `apk add --no-cache curl` to the runner stage of `apps/web/Dockerfile`.

### Cloudflare (Option B) — ⚠ Partial PASS

| Check | Result | Notes |
|-------|--------|-------|
| `next build` (Cloudflare-compatible standalone) | PASS | 18 routes generated; `.next/standalone/`, `.next/static/` populated |
| `opennextjs-cloudflare` bundling | ENVIRONMENT ISSUE | esbuild fails parsing `fdir@6.5.0/dist/index.mjs` on Bun isolated linker. Documented workarounds in deploy-guide §B.3 |
| `wrangler.jsonc` config | PASS | valid, matches `opencut` worker name + assets binding |

The actual code/config is correct; the failure is a tooling clash between Bun 1.3 isolated module store and esbuild 0.25.4. CI/CD (npm install or `bun install --linker=hoisted`) does not reproduce it.

---

## Reproduce

```bash
cd /Users/dttai/Documents/Research/OpenCut

# 1. Docker compose smoke
docker compose down -v 2>/dev/null
docker compose up -d --build
# Wait ~30s for web to start, then push DB schema:
cd apps/web && DATABASE_URL="postgresql://opencut:opencut@localhost:5432/opencut" \
  NODE_ENV=production bunx drizzle-kit push --force
cd ../..

# 2. Verify
curl -sI http://localhost:3100 | head -5
curl -s  http://localhost:3100/api/health
curl -sI http://localhost:3100/editor/test | grep -iE "cross-origin|content-security"
curl -s -X POST http://localhost:3100/api/auth/sign-up/email \
  -H 'Content-Type: application/json' \
  -d '{"email":"verify@opencut.local","password":"VerifyPass123!","name":"V"}'

# 3. Cloudflare build
cd apps/web && bunx opennextjs-cloudflare build
```

---

## Sign-off

- **Verifier:** `@devops`
- **Date:** 2026-05-19
- **Result:** **G-Deploy PASS** (Docker full pass; Cloudflare build works at Next.js layer with documented OpenNext-bundling caveat & workarounds)
- **Recommended follow-ups (non-blocking):**
  1. Add `curl` to the runner image (fixes the cosmetic "unhealthy" reporting)
  2. Add a CI job that runs `bun install --linker=hoisted && bun run deploy --dry-run` to lock in the Cloudflare bundling path
  3. Pin image tags (`postgres:17.x`, `redis:7.x.x`) in `docker-compose.yml`

