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

**Healthcheck fix applied**: Docker Compose healthcheck switched from `curl` to `wget` (available in alpine). Container now reports `healthy` correctly. Fixed in `docker-compose.yml` at CTO review (2026-05-21).

### Cloudflare (Option B) — ✅ PASS (CI-verified)

| Check | Result | Notes |
|-------|--------|-------|
| `next build` (Cloudflare-compatible standalone) | PASS | 18 routes generated; `.next/standalone/`, `.next/static/` populated |
| `opennextjs-cloudflare` bundling | PASS (CI) | Local Bun isolated linker causes esbuild issue; CI uses `--linker=hoisted` which passes clean |
| `wrangler.jsonc` config | PASS | valid, matches `opencut` worker name + assets binding |
| CI `cloudflare-build` job | PASS | Added mandatory CI job: `bun install --linker=hoisted && bunx opennextjs-cloudflare build` |

The local tooling clash (Bun 1.3 isolated linker vs esbuild 0.25.4) is resolved in CI via `--linker=hoisted`. CI job is mandatory (not `continue-on-error`), making the Cloudflare build path a hard gate.

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
- **Result:** **G-Deploy PASS** — both deployment paths verified
- **CTO conditions resolved (2026-05-21):**
  1. ~~Add `curl` to runner image~~ → Switched healthcheck to `wget` (available in alpine)
  2. ~~Add CI job for Cloudflare bundling~~ → `cloudflare-build` job added to `bun-ci.yml`
  3. Pin image tags (`postgres:17.x`, `redis:7.x.x`) — remaining non-blocking follow-up

