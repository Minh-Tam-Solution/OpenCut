---
spec_id: SPEC-04BUILD-SPRINT-001
title: "Sprint Plan — G0.1 Foundation Sprint"
spec_version: "1.0.0"
status: active
tier: STANDARD
stage: "04-build"
owner: "@pjm"
created: 2026-05-16
last_updated: 2026-05-16
gate: G-Sprint
---

# OpenCut — Sprint Plan: G0.1 Foundation Sprint

## Quality Gates

This document feeds **G-Sprint** and **G-Sprint-Close**. Both gates must be
satisfied before the sprint is considered complete.

| Gate | Criteria | Status |
|------|----------|--------|
| G-Sprint | Sprint goals defined; tasks assigned; estimates confirmed; dependencies identified | ☐ Pending |
| G-Sprint-Close | Sprint goals met or documented as incomplete; code complete and tested; sprint documentation updated | ☐ Pending |

---

## 1. Sprint Goals

The G0.1 Foundation Sprint establishes the three-layer browser-native
architecture defined in [ADR-001](../../02-design/01-ADRs/ADR-001-initial-architecture.md).
Work is complete when: (a) the `opencut-wasm` compositor renders a single
composited frame in the browser, (b) `better-auth` sign-in/sign-out round-trips
successfully against the PostgreSQL auth store, and (c) the Next.js shell mounts
the timeline editor panel without runtime errors.

**Primary goal:** Deliver a walking skeleton — end-to-end data flow from local
file import through WASM frame compositing to canvas preview, gated behind a
working auth session.

**Secondary goal:** Establish the CI pipeline (lint, type-check, WASM build,
unit tests) so every subsequent sprint has a green baseline to protect.

**Out-of-scope for this sprint:** MP4 export, effects pipeline, mask
compositing, auto-captions, and keybindings. These are deferred to Sprint 2+
per the [Requirements out-of-scope table](../../01-planning/requirements.md).

---

## 2. Stories and Tasks

### US-001 — WASM Compositor Walking Skeleton (8 pts)

**Acceptance criteria:** `opencut-wasm` compiles to WASM via `wasm-pack`,
exposes a `render_frame(timeline_state, pts)` binding, and renders a solid-color
test frame to an `OffscreenCanvas` readable by the shell.

| ID | Task | Assignee | Estimate | Status |
----|------|----------|----------|--------|
| T-001 | Scaffold `opencut-wasm` Rust crate with `wasm-bindgen` and `wgpu` dependencies | @coder | 3 h | ☐ |
| T-002 | Implement `render_frame` stub returning a solid-color `ImageData` buffer | @coder | 2 h | ☐ |
| T-003 | Wire `OffscreenCanvas` bridge in the shell — `postMessage` + `Transferable` handoff | @coder | 2 h | ☐ |
| T-004 | Add `wasm-pack build` step to CI; assert bundle size < 8 MB gzipped | @coder | 1 h | ☐ |

### US-002 — Authentication via `better-auth` (5 pts)

**Acceptance criteria:** A user can register with email/password, sign in, and
sign out. Session cookie is set; protected API routes return 401 without a valid
session. OWASP ASVS L2 checklist items for session management are green.

| ID | Task | Assignee | Estimate | Status |
----|------|----------|----------|--------|
| T-005 | Configure `better-auth` with Drizzle adapter and PostgreSQL connection | @coder | 2 h | ☐ |
| T-006 | Implement `POST /api/auth/*` route handlers (sign-up, sign-in, sign-out, session) | @coder | 2 h | ☐ |
| T-007 | Add CSRF protection and `SameSite=Strict` cookie flag; validate against OWASP ASVS L2 | @coder | 2 h | ☐ |
| T-008 | Write integration tests for auth round-trip (register → sign-in → protected route → sign-out) | @tester | 2 h | ☐ |

### US-003 — Next.js Shell and Timeline Editor Mount (5 pts)

**Acceptance criteria:** The editor route (`/editor`) mounts the timeline panel
without console errors. The `opencut-wasm` module is lazy-loaded on editor entry.
`Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` headers are set
on the editor route to enable `SharedArrayBuffer`.

| ID | Task | Assignee | Estimate | Status |
----|------|----------|----------|--------|
| T-009 | Scaffold App Router structure: `app/editor/page.tsx`, `app/api/auth/[...all]/route.ts` | @coder | 1 h | ☐ |
| T-010 | Implement lazy WASM load on editor route entry via `next/dynamic` with `ssr: false` | @coder | 2 h | ☐ |
| T-011 | Configure COOP/COEP headers in `next.config.ts` scoped to the `/editor` route | @coder | 1 h | ☐ |
| T-012 | Mount stub `<TimelinePanel>` component; wire WASM frame output to `<canvas>` preview | @coder | 2 h | ☐ |

### US-004 — CI Pipeline Foundation (3 pts)

**Acceptance criteria:** CI runs on every PR: TypeScript strict-mode check,
ESLint, `wasm-pack build`, and unit test suite all pass. Build time under 5
minutes on a standard runner.

| ID | Task | Assignee | Estimate | Status |
----|------|----------|----------|--------|
| T-013 | Add GitHub Actions workflow: `tsc --noEmit`, `eslint`, `wasm-pack build --release` | @coder | 2 h | ☐ |
| T-014 | Add `vitest` unit test suite for shell utilities; baseline coverage report | @tester | 2 h | ☐ |
| T-015 | Add Rust `cargo test` step for `opencut-wasm` crate logic | @tester | 1 h | ☐ |

---

## 3. Velocity

| Metric | Value |
|--------|-------|
| Sprint capacity | 21 story points |
| Planned points | 21 points (US-001: 8, US-002: 5, US-003: 5, US-004: 3) |
| Estimated task hours | ~29 h (coder: ~20 h, tester: ~9 h) |
| Sprint duration | 1 week (2026-05-16 → 2026-05-23) |
| Carry-over budget | 3 points — any single story may slip to Sprint 2 without blocking G-Sprint-Close provided the reason is documented |

This is Sprint 1 — no prior velocity baseline exists. The 21-point plan is
sized against the walking-skeleton goal: it establishes all three architecture
layers without implementing any user-facing features beyond auth. Sprint 2 will
calibrate velocity from actual throughput.

---

## 4. Dependencies

### External Package Dependencies

| Package | Used by | Version constraint | Risk |
|---------|---------|-------------------|------|
| `next` | Shell (Layer 1) | `^15.x` (App Router required) | Low — stable API |
| `@types/react`, `@types/react-dom` | Shell type-checking | Must match React 19 peer | Low — type-only |
| `better-auth` | Auth routes (Layer 3) | Latest stable | Medium — library maturity noted in ADR-001 §Consequences; fallback is Auth.js |
| `opencut` | Main web app package | Workspace monorepo | Internal |
| `opencut-wasm` | Rust crate → WASM bundle | Workspace monorepo | Medium — `wgpu` WebGPU adapter must be validated in Chrome 113+ and Edge 113+ |

### Infrastructure Dependencies

| Dependency | Owner | Required for | Notes |
|------------|-------|-------------|-------|
| PostgreSQL instance | @infra | T-005 (better-auth Drizzle adapter) | Local Docker Compose for dev; Cloudflare D1 or Neon for staging |
| `wasm-pack` CLI | @coder | T-001, T-013 | Must be pinned in CI to avoid build drift |
| WebGPU-capable browser | @tester | T-003, T-012 (frame preview) | Chrome 113+ or Edge 113+; Firefox/Safari fallback deferred to Sprint 2 |
| Cloudflare Pages project | @infra | Deployment preview (optional for Sprint 1) | Not blocking G-Sprint; required before G-Deploy |

### Cross-Story Dependencies

US-002 (auth) must be complete before US-003 can gate the editor route behind a
session check. US-001 (WASM compositor) and US-002 (auth) may proceed in
parallel because they touch separate layers (compositor vs. auth API). US-004
(CI) depends on T-001 (Rust crate scaffold) existing before the `cargo test`
step can be wired; the GitHub Actions workflow should be committed once T-001
merges.

| Blocked task | Blocked by | Impact if delayed |
|-------------|-----------|------------------|
| T-009 (editor route scaffold) | T-006 (auth routes) | Editor route cannot enforce session guard |
| T-012 (canvas preview) | T-002 (render_frame stub) | Preview panel has nothing to display |
| T-015 (cargo test in CI) | T-001 (crate scaffold) | CI step fails to compile |

---

## 5. Risks

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|-----------|--------|-----------|
| R-001 | `wgpu` WebGPU adapter not available in CI runner browser | Medium | High — T-003 and T-012 blocked | Run frame-compositing tests headlessly with a software rasteriser (`wgpu` WGSL software backend); defer GPU-specific paths to Sprint 2 integration tests |
| R-002 | `better-auth` API surface changes between releases | Low | Medium — auth integration breaks | Pin exact version in `package.json`; document fallback to Auth.js (noted in ADR-001 §Consequences) |
| R-003 | COOP/COEP headers break third-party scripts loaded in the shell | Medium | Medium — analytics or OAuth popups fail | Scope headers to `/editor/*` only; test OAuth popup flow before marking T-011 done |
| R-004 | WASM bundle exceeds 8 MB gzip threshold in CI | Low | Low — advisory only for Sprint 1 | Monitor with `wasm-pack build --release`; defer wasm-opt passes to Sprint 2 if needed |
| R-005 | Sprint 1 velocity overrun — 21 pts may be too aggressive for a first sprint with no baseline | Medium | Medium — one story slips | Carry-over budget is 3 pts (one story); US-004 (CI) is lowest-risk candidate for partial deferral without blocking architecture goals |

Sprint-level escalation path: if two or more stories are at risk by Wednesday
2026-05-20, @pjm escalates to @pm to negotiate scope reduction before
G-Sprint-Close is attempted.

---

## References

This sprint plan is derived from the following upstream SDLC artifacts:

### 01-planning

- [Requirements (SPEC-01PLANNING-001)](../../01-planning/requirements.md) —
  FR-001 (WASM Compositor), FR-002 (Auth), FR-003 (Shell) directly map to
  US-001, US-002, and US-003 respectively. The out-of-scope table in §Scope
  defines the sprint boundary (no MP4 export, no effects pipeline).

### 02-design

- [ADR-001 — Initial Architecture](../../02-design/01-ADRs/ADR-001-initial-architecture.md) —
  Defines the three-layer architecture (Shell / Compositor / Auth & Project API)
  that this sprint instantiates. Layer boundaries, COOP/COEP header requirements,
  and the `wgpu` WebGPU adapter risk are all sourced from ADR-001 §Consequences.

### 00-foundation (informational)

- [Problem Statement (SPEC-00FOUNDATION-001)](../../00-foundation/problem-statement.md) —
  Confirms the privacy-by-construction constraint: no endpoint may accept video
