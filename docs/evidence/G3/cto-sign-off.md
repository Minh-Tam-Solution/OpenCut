# G3 Gate — CTO Sign-Off

**Gate:** G3 — Security Hardening Complete  
**Date:** 2026-05-19  
**Verdict:** ✅ APPROVED WITH CONDITIONS  

---

## OWASP ASVS L2 Scorecard

| Result | Count |
|--------|-------|
| PASS | 21 |
| DEFERRED | 7 (V7.1.1, V7.1.2, V8.1.3, V10.1.1, V10.2.1, V11.1.2, V13.2.1) |
| N/A | 8 |

Full evidence: `docs/05-test/owasp-asvs-l2-plan.md`

## Security Hardening Implemented

| Control | Implementation | Commit |
|---------|---------------|--------|
| HSTS | `max-age=31536000; includeSubDomains` on all routes | `dbf2238f` |
| CSP | Editor: `wasm-unsafe-eval`, workers, blobs. Non-editor: strict | `dbf2238f` |
| X-Frame-Options | `DENY` on all routes | `dbf2238f` |
| X-Content-Type-Options | `nosniff` on all routes | `dbf2238f` |
| Referrer-Policy | `strict-origin-when-cross-origin` | `dbf2238f` |
| Permissions-Policy | Camera denied, mic self-only, geo denied | `dbf2238f` |
| COOP/COEP | `/editor/*` only (SharedArrayBuffer isolation) | `e4e2291d` |
| Password policy | `minPasswordLength: 12` | `1af4563c` |
| Session expiry | 7 days, daily refresh (`updateAge`) | `1af4563c` |
| Rate limiting | Upstash Redis secondary storage on auth endpoints | Pre-existing |
| Health endpoint | DB connectivity check (`SELECT 1`), returns 503 on failure | `53d87d78` |

## CI Pipeline Quality Gates

| Step | Job | Fail-on-error |
|------|-----|--------------|
| Lint | build (matrix) | ✅ Yes |
| TypeScript strict | build (matrix) | ✅ Yes |
| Unit tests | build (matrix) | ✅ Yes |
| Rust tests | build (matrix) | ✅ Yes |
| Integration tests (auth roundtrip) | integration (ubuntu + DB) | ✅ Yes |

## CTO Findings Fixed

| # | Finding | Severity | Fix |
|---|---------|----------|-----|
| 1 | V7.1.2 falsely claimed PASS (no ErrorBoundary exists) | Medium | Corrected to DEFERRED, consistent with V7.1.1 |
| 2 | No G3 evidence artifact | Low | Created this file |
| 3 | `continue-on-error` regression in build job | Carried from sprint | Re-removed at `dd93c75d` |

## Conditions (Non-Blocking, Required Before G-Deploy)

1. Add React `<ErrorBoundary>` around editor root and PreviewPanel (V7.1.1 + V7.1.2) — Sprint 2
2. GDPR account deletion UI (V8.1.3) — Sprint 3
3. `bun audit` in CI (V10.1.1) — Sprint 2

---

*Signed: CTO (2026-05-19)*
