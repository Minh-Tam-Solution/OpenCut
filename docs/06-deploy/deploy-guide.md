---
spec_id: SPEC-06DEPLOY-001
title: "Deploy Guide"
spec_version: "1.0.0"
status: active
tier: STANDARD
stage: "06-deploy"
owner: "@devops"
created: 2026-05-19
gate: G-Deploy
---

# OpenCut — Deploy Guide

This guide covers both deployment paths supported by OpenCut.

---

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Docker + Docker Compose | v2+ (Docker Engine 25+) | Self-hosted deployment (Option A) |
| Bun | >= 1.2.18 | Package manager (both options) |
| Node.js | >= 20 (LTS) | Cloudflare/OpenNext build runtime |
| wrangler | >= 4.77.0 | Cloudflare CLI (Option B only) |
| Rust toolchain + wasm-pack | latest | WASM build (only if building `opencut-wasm` locally; published version is pulled from npm by default) |
| PostgreSQL | 17+ | Database backend (matched by `postgres:17` image) |
| Redis | 7+ | Rate-limiting / Upstash bridge |

---

## Option A: Docker Compose (Self-Hosted)

### A.1 Quick Start

```bash
# 1. Clone repo
git clone https://github.com/OpenCut-app/OpenCut.git
cd OpenCut

# 2. (Optional) Configure freesound + marble keys
cat > .env <<EOT
FREESOUND_CLIENT_ID=<your-id>
FREESOUND_API_KEY=<your-key>
MARBLE_WORKSPACE_KEY=<your-key>
NEXT_PUBLIC_MARBLE_API_URL=https://api.marblecms.com
EOT

# 3. Build + start full stack
docker compose up -d --build

# 4. Wait ~2 min for the web image to compile, then push DB schema
DATABASE_URL="postgresql://opencut:opencut@localhost:5432/opencut" \
  bunx drizzle-kit push --force  # (run inside apps/web/)
# Alternatively: docker compose exec web bun run db:push:prod

# 5. Smoke test
curl -sI http://localhost:3100 | head -3
curl -s  http://localhost:3100/api/health
```

Result: web is reachable on `http://localhost:3100`, all four containers `Up (healthy)` except `web` which reports `unhealthy` until step 4 succeeds (see [Note: Healthcheck](#note-web-container-healthcheck)).

### A.2 Services in `docker-compose.yml`

| Service | Image | Port (host:container) | Healthcheck |
|---------|-------|----------------------|-------------|
| `db` | `postgres:17` | 5432:5432 | `pg_isready -U opencut` |
| `redis` | `redis:7-alpine` | 6379:6379 | `redis-cli ping` |
| `serverless-redis-http` | `hiett/serverless-redis-http:latest` | 8079:80 | `wget --spider http://127.0.0.1:80` |
| `web` | built from `apps/web/Dockerfile` | 3100:3000 | `curl -f http://localhost:3000/api/health` |

Network: `opencut-network` (driver bridge). Volume: `postgres_data` (named volume for PG data).

### A.3 Environment Variables

| Var | Where set | Default in `docker-compose.yml` | Production action |
|-----|-----------|---------------------------------|-------------------|
| `DATABASE_URL` | `web` env | `postgresql://opencut:opencut@db:5432/opencut` | Rotate password, point to managed PG if external |
| `BETTER_AUTH_SECRET` | `web` env | `your-production-secret-key-here` (placeholder) | **Replace with `openssl rand -base64 32` (≥ 32 chars)** |
| `UPSTASH_REDIS_REST_URL` | `web` env | `http://serverless-redis-http:80` | Keep, or swap to Upstash hosted URL |
| `UPSTASH_REDIS_REST_TOKEN` | `web` env | `example_token` | **Rotate to strong token** |
| `NEXT_PUBLIC_SITE_URL` | `web` env | `http://localhost:3100` | Set to actual public URL (e.g. `https://opencut.example.com`) |
| `NEXT_PUBLIC_MARBLE_API_URL` | build arg + env | `https://api.marblecms.com` | Override only if using self-hosted Marble |
| `MARBLE_WORKSPACE_KEY` | build arg + env | `build-placeholder` | Set to real workspace key |
| `FREESOUND_CLIENT_ID` / `FREESOUND_API_KEY` | build arg + env | empty | Optional — required only for sound search |
| `NODE_ENV` | `web` env | `production` | Keep |

> The `web` image is built with **build-time stubs** for `DATABASE_URL`, `BETTER_AUTH_SECRET`, `UPSTASH_*` so Zod validation passes during `next build`. Runtime values come from `docker-compose.yml`.

### A.4 Database Schema Push (first run / migrations)

OpenCut uses **Drizzle ORM** with `db:push`-style schema sync (no migration files):

```bash
# Local (DB on host)
cd apps/web
bun run db:push:prod   # = NODE_ENV=production drizzle-kit push

# From host against compose stack
DATABASE_URL="postgresql://opencut:opencut@localhost:5432/opencut" \
NODE_ENV=production \
bunx drizzle-kit push --force
```

Tables created: `users`, `sessions`, `accounts`, `verifications`, `feedback` (5 tables — verified in G-Deploy evidence).

### A.5 Production Hardening Checklist

- [ ] Rotate `BETTER_AUTH_SECRET` to a 32+ char random value (`openssl rand -base64 32`)
- [ ] Replace placeholder PG credentials in `docker-compose.yml` (or use Docker secrets)
- [ ] Set `NEXT_PUBLIC_SITE_URL` to the real HTTPS origin
- [ ] Rotate `UPSTASH_REDIS_REST_TOKEN`
- [ ] Put the web service **behind a TLS terminator** (nginx, caddy, traefik)
  - HSTS header is already set by the app (`max-age=31536000`), but it is only honored over HTTPS
- [ ] Mount `postgres_data` to a backed-up host path / volume snapshot schedule
- [ ] Set restart policies (already `unless-stopped` by default)
- [ ] Pin image tags (e.g. `postgres:17.2`) for reproducibility
- [ ] Configure log rotation (`--log-opt max-size=10m --log-opt max-file=3`)
- [ ] Enable container resource limits (`mem_limit`, `cpus`) for the `web` service
- [ ] Open only port 3100 (or 443 via reverse proxy) to the public — keep 5432/6379/8079 internal

### A.6 Note: web container healthcheck

The `web` Dockerfile is `oven/bun:alpine` and does **not** ship `curl`. The compose healthcheck uses `curl -f`, so the container is marked **unhealthy** even though the app is healthy. This is cosmetic only.

**Recommended fix** (already documented as P3 in runbook): add `RUN apk add --no-cache curl` to the runner stage of `apps/web/Dockerfile`, OR switch the healthcheck to `wget --spider -q http://localhost:3000/api/health`.

---

## Option B: Cloudflare Workers (Production)

### B.1 Prerequisites

- Cloudflare account with Workers Paid plan (free plan works for low traffic; Paid required for CPU > 50 ms)
- `wrangler` CLI authenticated: `wrangler login`
- An external PostgreSQL (Workers cannot host a stateful DB)

### B.2 Build & Deploy

```bash
cd apps/web
bun install

# Build only (artifacts to .open-next/)
bunx opennextjs-cloudflare build

# Build + deploy (uses wrangler.jsonc at repo root)
bun run deploy
```

`wrangler.jsonc` at the repo root defines the worker:

```jsonc
{
  "name": "opencut",
  "main": ".open-next/worker.js",
  "compatibility_date": "2025-04-01",
  "compatibility_flags": ["nodejs_compat", "global_fetch_strictly_public"],
  "assets": { "directory": ".open-next/assets", "binding": "ASSETS" },
  "services": [{ "binding": "WORKER_SELF_REFERENCE", "service": "opencut" }]
}
```

### B.3 Known issue: `bun install` + esbuild + fdir

On macOS with **Bun 1.3.x's isolated module store** (`node_modules/.bun/<pkg>@<ver>+<hash>/...`), the OpenNext bundling step can fail at `fdir@6.5.0/dist/index.mjs` with:

```
✘ [ERROR] Expected ";" but found "..."
  fdir/dist/index.mjs:443:3
```

This is a known interaction between Bun's isolated linker and esbuild's ESM parser. **The Next.js build itself succeeds** (all 18 routes generate, `.next/standalone/` is fully populated). Workarounds:

1. **Use the hoisted linker** for the Cloudflare build:
   ```bash
   bun install --linker=hoisted
   bun run deploy
   ```
2. **Build in a clean container** (matches CI):
   ```bash
   docker run --rm -v "$PWD:/app" -w /app/apps/web oven/bun:1.2.18 sh -c "bun install && bun run deploy"
   ```
3. **CI/CD path** (recommended): GitHub Actions uses npm/yarn or a hoisted bun install; the issue does not reproduce there.

### B.4 Environment Variables (Cloudflare Dashboard → Workers → Settings → Variables)

| Var | Type | Notes |
|-----|------|-------|
| `DATABASE_URL` | Secret | External PG (Neon / Supabase) — use connection pooler URL |
| `BETTER_AUTH_SECRET` | Secret | 32+ chars, `openssl rand -base64 32` |
| `UPSTASH_REDIS_REST_URL` | Plain | Upstash REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | Secret | Upstash REST token |
| `NEXT_PUBLIC_SITE_URL` | Plain | Public origin, e.g. `https://opencut.app` |
| `NEXT_PUBLIC_MARBLE_API_URL` | Plain | `https://api.marblecms.com` |
| `MARBLE_WORKSPACE_KEY` | Secret | Marble CMS workspace key |
| `FREESOUND_CLIENT_ID` | Secret | Optional |
| `FREESOUND_API_KEY` | Secret | Optional |

### B.5 Database options for Cloudflare deploys

| Provider | Tier | Notes |
|----------|------|-------|
| **Neon** (recommended) | Free tier (0.5 GB / 191 h) | Serverless PG, built-in connection pooler, works great with Workers |
| **Supabase** | Free (500 MB, 2-week pause) | Managed PG + Studio UI |
| **Cloudflare Hyperdrive + own PG** | Pay-per-use | Lower latency, requires existing PG |
| **Self-hosted PG** | Variable | Use pooled connection (PgBouncer / Supavisor) |

Set `DATABASE_URL` to the **pooled** connection string (Workers create a fresh connection per request). After deploy, push the schema once:

```bash
DATABASE_URL="<production-url>" NODE_ENV=production bun run db:push:prod
```

---

## Rollback Procedure

### Docker

```bash
# Re-tag previous image (taken before deploy)
docker tag opencut-web:previous opencut-web:latest
docker compose up -d --force-recreate web

# Or, if using compose pulls
docker compose down
docker compose up -d
```

### Cloudflare

```bash
# Rollback to the previous Worker version
wrangler rollback

# Or specify a version (UUID from `wrangler deployments list`)
wrangler rollback <version-id>
```

For schema rollback, Drizzle uses `db:push` (no down-migrations). Restore from PG dump:

```bash
docker compose exec -T db psql -U opencut opencut < backup-<date>.sql
```

---

## Monitoring & Observability

- **`/api/health`** — DB connectivity check
  - `200` + `{"status":"ok","db":"connected"}` ⇒ OK
  - `503` + `{"status":"error","db":"unavailable"}` ⇒ DB down
- **Cloudflare Workers analytics** — request count, error rate, p50/p95/p99 latency, CPU time
- **PostgreSQL** — track `pg_stat_activity` (idle/active connections), `pg_stat_database` (xact_commit/rollback)
- **Application logs** — `docker compose logs -f web` (self-hosted) or `wrangler tail` (Cloudflare)
- **Security headers** — verifiable with: `curl -sI <url> | grep -iE "x-content-type|x-frame|strict-transport|content-security|cross-origin"`

---

## Verification Checklist (post-deploy)

```bash
HOST=http://localhost:3100   # or https://your-domain

# 1. Homepage 200
curl -sI $HOST | head -1

# 2. DB connected
curl -s $HOST/api/health
# expect: {"status":"ok","db":"connected"}

# 3. Security headers present
curl -sI $HOST | grep -iE "x-content-type-options|x-frame-options|strict-transport-security|referrer-policy|content-security-policy"

# 4. Editor COOP/COEP + WASM CSP
curl -sI $HOST/editor/test | grep -iE "cross-origin-(opener|embedder)-policy|wasm-unsafe-eval"

# 5. Auth roundtrip (signup → signin)
curl -s -X POST $HOST/api/auth/sign-up/email \
  -H 'Content-Type: application/json' \
  -d '{"email":"verify@opencut.local","password":"VerifyPass123!","name":"Verify"}' | head -c 200

curl -s -X POST $HOST/api/auth/sign-in/email \
  -H 'Content-Type: application/json' \
  -d '{"email":"verify@opencut.local","password":"VerifyPass123!"}' | head -c 200
```

All checks ≥ HTTP 200 (with non-empty body for auth) ⇒ deploy verified.

---

## References

- [`docker-compose.yml`](../../docker-compose.yml)
- [`apps/web/Dockerfile`](../../apps/web/Dockerfile)
- [`wrangler.jsonc`](../../wrangler.jsonc)
- [Runbook](./runbook.md) — incident response, DB ops, scheduled maintenance
- [G-Deploy evidence](../evidence/G-Deploy/)
