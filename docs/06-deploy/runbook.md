---
spec_id: SPEC-06DEPLOY-002
title: "Runbook"
spec_version: "1.0.0"
status: active
tier: STANDARD
stage: "06-deploy"
owner: "@devops"
created: 2026-05-19
gate: G-Deploy
---

# OpenCut — Operations Runbook

Operational procedures for on-call engineers. Covers incident response, database operations, and routine maintenance.

> **Companion docs:** [Deploy Guide](./deploy-guide.md) · [Architecture (`02-design/`)](../02-design/) · [Test suite (`05-test/`)](../05-test/)

---

## Incident Severity Matrix

| Sev | User impact | Response time | Escalation |
|-----|-------------|---------------|-----------|
| P0  | Site fully down (5xx ≥ 50%) | < 15 min | Page on-call + CTO |
| P1  | Auth/critical flow broken | < 30 min | Page on-call |
| P2  | Editor partially broken | < 2 h | Slack #incidents |
| P3  | Cosmetic / non-blocking | < 24 h | GitHub issue |

---

## P0 — App Down (5xx / connection refused)

### 1. Triage
```bash
# Self-hosted
docker compose ps
docker compose logs --tail=200 web

# Cloudflare
wrangler tail
# Or check Cloudflare dashboard → Workers → opencut → Logs
```

### 2. Common causes & fixes

#### 2a. DB down
```bash
curl -s http://localhost:3100/api/health
# {"status":"error","db":"unavailable"}  ⇒ DB unreachable

# Self-hosted: restart PG
docker compose restart db
docker compose logs --tail=100 db   # check for OOM / disk full / corruption

# Wait for healthy, then verify
sleep 15 && curl -s http://localhost:3100/api/health
```

#### 2b. Redis / rate-limit bridge down
```bash
docker compose exec redis redis-cli ping   # expect: PONG
docker compose restart redis serverless-redis-http
```

#### 2c. Web container crashed
```bash
docker compose logs --tail=200 web | grep -iE "error|fatal|panic"
docker compose restart web

# If repeat crash, capture core dump and rollback (see deploy-guide#rollback)
```

#### 2d. Cloudflare Worker errored
```bash
wrangler deployments list
wrangler rollback   # rolls back to previous version
```

### 3. Confirm recovery
```bash
curl -sI http://localhost:3100 | head -1   # expect: HTTP/1.1 200 OK
curl -s  http://localhost:3100/api/health  # expect: {"status":"ok","db":"connected"}
```

### 4. Post-incident
- File a P0 post-mortem within 24h (template: `docs/06-deploy/post-mortems/<date>.md`).
- Add a regression test to `05-test/` if a code path was implicated.

---

## P1 — Auth Failures (5xx on `/api/auth/*`)

### Symptom: signup/signin returns 500

```bash
docker compose logs web 2>&1 | grep -iE "better-auth|users.*relation" | tail -30
```

#### 1. DB schema missing
```
relation "users" does not exist
```
⇒ Database schema not pushed. Run:
```bash
cd apps/web
DATABASE_URL="postgresql://opencut:opencut@localhost:5432/opencut" \
NODE_ENV=production bunx drizzle-kit push --force
```

#### 2. `BETTER_AUTH_SECRET` rotated mid-session
- Existing sessions become invalid (HMAC mismatch). Users must re-login.
- **Never** rotate the secret without an announced maintenance window.
- If you must rotate, communicate the forced re-login in advance.

#### 3. Rate limit triggered
- Better-auth integrates with Upstash; 5 failed sign-ins per 60s trigger lockout.
- Check:
  ```bash
  docker compose exec redis redis-cli KEYS "*ratelimit*" | head
  docker compose exec redis redis-cli FLUSHDB   # nuclear; wipes all rate-limit state
  ```

#### 4. Verify `BETTER_AUTH_SECRET` ≥ 32 chars
```bash
docker compose exec web printenv BETTER_AUTH_SECRET | wc -c   # should be > 32
```

---

## P2 — Editor Not Loading

### Checklist

```bash
# 1. COOP/COEP present?
curl -sI http://localhost:3100/editor/test | grep -iE "cross-origin-(opener|embedder)-policy"
# Expect:
#   Cross-Origin-Opener-Policy: same-origin
#   Cross-Origin-Embedder-Policy: require-corp

# 2. CSP allows WASM?
curl -sI http://localhost:3100/editor/test | grep -i content-security-policy | grep wasm-unsafe-eval

# 3. WASM bundle reachable?
curl -sI http://localhost:3100/_next/static/wasm/opencut_wasm_bg.wasm 2>&1 | head -1
```

### Common issues

1. **Browser console: "ReferenceError: SharedArrayBuffer is not defined"**
   → COOP/COEP headers stripped by proxy. Inspect reverse proxy config; do NOT override these on `/editor/*`.
2. **"WebGPU not supported"** in Firefox / Safari
   → Expected on browsers without WebGPU. Editor falls back to WebGL/CPU paths automatically.
3. **WASM 404**
   → `apps/web/.next/static/wasm/*` missing from the runner stage. Ensure the Dockerfile copies `.next/static/` (line 36 of `apps/web/Dockerfile`).

---

## P3 — Export Failing

Exports are **client-side only**; the server is not involved.

1. Ask user for browser console + memory (`performance.memory` in Chrome DevTools).
2. Suggest closing other tabs to free GPU memory.
3. Check IndexedDB quota:
   - Chrome: `chrome://quota-internals/` (per origin)
   - Firefox: `about:storage`
4. Large exports (> 1080p, > 5 min) may exceed 4 GB browser limits — recommend splitting into segments.
5. Cosmetic: web container shows `(unhealthy)` because the Alpine image lacks `curl`. Fix planned by adding `apk add --no-cache curl` to the runner stage of `apps/web/Dockerfile`. The app is healthy regardless.

---

## Database Operations

### Schema migration (Drizzle push)

OpenCut uses `drizzle-kit push` (no migration files; schema is the source of truth).

```bash
# Local development DB
cd apps/web && bun run db:push:local

# Production
cd apps/web && bun run db:push:prod
# Or, against a running compose stack:
DATABASE_URL="postgresql://opencut:opencut@localhost:5432/opencut" \
NODE_ENV=production bunx drizzle-kit push --force
```

> `--force` skips the interactive confirm (needed in CI / non-TTY shells).

### Backup

```bash
# Hot backup via pg_dump
docker compose exec -T db pg_dump -U opencut --format=custom opencut \
  > backup-$(date +%Y%m%d-%H%M).dump

# Plain SQL (human-readable)
docker compose exec -T db pg_dump -U opencut opencut \
  > backup-$(date +%Y%m%d).sql
```

### Restore

```bash
# From custom format
docker compose exec -T db pg_restore -U opencut -d opencut --clean < backup-20260519.dump

# From plain SQL
docker compose exec -T db psql -U opencut opencut < backup-20260519.sql
```

### Inspect

```bash
# Open psql
docker compose exec db psql -U opencut -d opencut

# Useful queries
\dt                                       -- list tables
SELECT COUNT(*) FROM users;               -- user count
SELECT COUNT(*) FROM sessions
  WHERE expires_at > now();               -- active sessions
SELECT pid, state, query FROM pg_stat_activity
  WHERE datname='opencut';                -- live connections
```

### Vacuum / analyze

```bash
docker compose exec db psql -U opencut opencut -c "VACUUM ANALYZE;"
```

---

## Redis Operations

```bash
# Connectivity
docker compose exec redis redis-cli ping              # PONG

# Stats
docker compose exec redis redis-cli INFO stats | head -20

# Inspect rate-limit keys
docker compose exec redis redis-cli KEYS "*ratelimit*"

# Reset all rate limits (USE WITH CAUTION)
docker compose exec redis redis-cli FLUSHDB
```

---

## Scheduled Maintenance

### Daily (automated)

- [ ] PG backup → off-site storage (s3, B2, etc.)
- [ ] Log rotation (Docker daemon `--log-opt max-size=10m`)

### Weekly

- [ ] `docker compose ps` — verify all containers healthy
- [ ] Review Cloudflare analytics dashboard for error spikes (>1% 5xx)
- [ ] `docker system df` — check disk usage, prune if > 70% full
- [ ] Review GitHub Dependabot alerts (if enabled)

### Monthly

- [ ] `bun update` and run full test suite (`bun run test`)
- [ ] `bun audit` — review security advisories
- [ ] Review PG connection pool stats (`pg_stat_database`); tune `max_connections` if needed
- [ ] Rotate Cloudflare API tokens
- [ ] Re-verify smoke tests against staging (see [deploy-guide § Verification Checklist](./deploy-guide.md#verification-checklist-post-deploy))

### Quarterly

- [ ] Rotate `BETTER_AUTH_SECRET` (in a maintenance window — invalidates all sessions)
- [ ] Upgrade PostgreSQL minor version (`postgres:17.x`)
- [ ] DR drill: restore PG from a recent backup into a staging DB

---

## Quick Reference Commands

```bash
# Status
docker compose ps
docker compose logs --tail=100 -f web

# Restart full stack
docker compose down && docker compose up -d

# Restart only web (after code change, requires rebuild)
docker compose build web && docker compose up -d web

# Drop the stack + volumes (DESTRUCTIVE)
docker compose down -v

# Exec into web container
docker compose exec web sh

# Tail Cloudflare worker logs
wrangler tail

# Cloudflare deploy / rollback
bun run deploy
wrangler rollback
wrangler deployments list
```

---

## Contacts & Escalation

| Role | Contact | When |
|------|---------|------|
| On-call DevOps | rotating (`@devops`) | P0/P1 |
| CTO | `@cto` | P0 > 1 h or data-loss risk |
| Security | `@sec-team` | suspected breach, leaked secret |
| Engineering Lead | `@eng-lead` | repeated P1, code rollback |

---

## References

- [Deploy guide](./deploy-guide.md)
- [G-Deploy evidence](../evidence/G-Deploy/)
- [Better-auth docs](https://www.better-auth.com/docs)
- [Drizzle Kit push](https://orm.drizzle.team/kit-docs/commands#push)
- [opennextjs-cloudflare](https://opennext.js.org/cloudflare)
