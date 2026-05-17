---
spec_id: SPEC-00FOUNDATION-002
title: "business case"
spec_version: "1.0.0"
status: draft
tier: STANDARD
stage: "00-foundation"
category: functional
owner: "@pm"
created: 2026-05-16
last_updated: 2026-05-16
---

# OpenCut — Business Case

## 1. Business Justification

### 1.1 Strategic Rationale

OpenCut addresses the last major creative domain without a credible open-source, browser-native solution: video editing. Every comparable creative workflow — image editing (Photoshop → GIMP/Photopea), vector design (Illustrator → Inkscape/Figma), audio (Pro Tools → Audacity/LMMS) — has seen a free, open alternative displace or meaningfully constrain vendor pricing power. Video editing has not, because browser-based rendering required GPU access that only WebGPU and WebAssembly, now mature, can deliver.

OpenCut's technical foundation — a Rust/wgpu compositor compiled to `opencut-wasm`, embedded in a Next.js application authenticated with `better-auth` — is the first open-source implementation capable of professional-grade local rendering entirely within a browser tab. The business case rests on three compounding advantages:

1. **Zero marginal cost of distribution.** A browser app deployed on Cloudflare Workers scales to millions of users without per-seat licensing or infrastructure overhead proportional to video data (which never leaves the user's machine).
2. **Regulatory tailwind.** Post-Schrems II and escalating CapCut scrutiny (US regulatory proceedings, 2023–2025) create a mandatory migration window for privacy-sensitive verticals. OpenCut is the only open-source alternative positioned to capture this demand.
3. **Developer ecosystem leverage.** The `opencut-wasm` crate is independently useful as an embeddable compositor. Organizations that build on it become invested stakeholders — a flywheel that sustains the project without commercial sales.

### 1.2 Market Context

The global video editing software market was valued at USD 932 million in 2023 and is projected to grow at 6.8% CAGR through 2030 (source: publicly available market research). The consumer segment (short-form, social video) accounts for the highest growth rate and is dominated by tools with structural weaknesses OpenCut directly exploits:

| Incumbent | Structural Weakness | OpenCut Advantage |
|-----------|--------------------|--------------------|
| CapCut (ByteDance) | Server-side processing; geopolitical risk; US regulatory exposure | 100% local rendering via `opencut-wasm`; MIT license |
| Adobe Premiere Rush | $9.99–$54.99/month subscription; proprietary format | Free; open schema in IndexedDB |
| Clipchamp (Microsoft) | Cloud processing; Windows/Edge-preferred; closed source | Cross-browser; Linux/ChromeOS support |
| iMovie (Apple) | macOS/iOS only; no WASM path | Runs on any modern browser with WebGPU |
| Kdenlive / Shotcut | Desktop install required; no browser delivery | No installation; instant access |

### 1.3 Alignment with Project Dependencies

The chosen technology stack directly supports the business objectives:

- **`opencut-wasm`** (`^0.2.10`): Core differentiator. Provides GPU-accelerated compositing at 120,000 tick/second `MediaTime` resolution with zero server-side video processing.
- **`next`** (`15.x`): Enables server-side rendering for fast initial load, App Router for streaming, and compatibility with `@opennextjs/cloudflare` for zero-egress deployment.
- **`better-auth`**: Handles user identity for project persistence without requiring video data to transit the server — auth tokens are stored, video bytes are not.
- **`@types/react`** / **`@types/react-dom`**: Type-safe React layer ensuring the editor UI remains maintainable as the component surface grows across timeline, preview, and panel subsystems.

---

## 2. ROI Analysis

### 2.1 Cost Structure

OpenCut's cost model is unusually favorable because the computationally expensive workload (video rendering) runs entirely on user hardware.

| Cost Category | Estimate | Basis |
|---------------|----------|-------|
| Infrastructure (Cloudflare Workers) | ~$0/month at current scale (free tier covers 100K req/day) | `wrangler.jsonc` config; Cloudflare pricing |
| Auth + rate-limiting (Upstash Redis) | ~$0–$10/month (free tier: 10K commands/day) | `@upstash/ratelimit`, `@upstash/redis` in `package.json` |
| Database (PostgreSQL via better-auth) | ~$0–$20/month (managed Neon/Supabase free tier) | Schema stores project metadata only, not video assets |
| Video rendering compute | $0 — runs on user's GPU via `opencut-wasm` | Architecture invariant |
| CI/CD | $0 (GitHub Actions free tier for public OSS) | `.github/` workflows |
| **Total recurring cost** | **< $30/month** at 10,000 MAU | All tiers above combined |

### 2.2 Revenue and Value Capture Scenarios

OpenCut is OSS-first. Revenue is not a G0 requirement, but the following paths are architecturally enabled and do not require scope changes:

| Scenario | Mechanism | Incremental Cost |
|----------|-----------|-----------------|
| Self-hosted enterprise licensing | Organizations pay for support SLA on self-hosted deployments | Near-zero (documentation + support) |
| `opencut-wasm` commercial embedding | Companies embed the compositor crate under a commercial license | Near-zero (license change, not engineering) |
| Managed cloud tier | Optional project sync / collaboration features on paid plan | Requires backend storage for project metadata only (not video) |
| GitHub Sponsors / Open Collective | Community funding for maintainers | Near-zero overhead |

### 2.3 ROI Calculation (Community Value)

For the open-source baseline (no commercial tier), the return is measured in user-hours of value delivered and privacy risk avoided:

- **Baseline CapCut alternative**: If 1,000 WAE (weekly active editors) each save one $9.99/month subscription, OpenCut delivers ~$120K/year in aggregate user savings at negligible infrastructure cost.
- **Privacy risk avoided**: One GDPR enforcement action against a CapCut user in a regulated industry can exceed €20M in fines. Even a single avoided compliance incident produces ROI orders of magnitude above total operating cost.
- **Developer ecosystem**: Each `opencut-wasm` crate adoption by an external project reduces the ecosystem's dependence on proprietary rendering backends. This is measurable via crate download metrics (target: ≥ 500/month at 6 months).

---

## 3. Success Metrics

### 3.1 Business-Level Success Metrics (G0 Baseline)

| Metric | Definition | 6-Month Target | Rationale |
|--------|-----------|---------------|-----------|
| Weekly Active Editors (WAE) | Unique users completing ≥ 1 export per week | ≥ 1,000 | Proxy for real engagement vs. passive visitors |
| Export completion rate | Exports completed / projects created | ≥ 60% | Measures whether users reach the core value event |
| Local-only processing rate | % sessions with zero video bytes sent to server | 100% (invariant) | Architectural guarantee; any breach is a P0 incident |
| Time-to-first-export | Minutes from first visit to first MP4 export | ≤ 10 min median | Acquisition quality signal; longer = friction |
| GitHub stars | Community validation signal | ≥ 2,000 at 6 months | Comparable OSS creative tools benchmark |

### 3.2 Technical Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| `opencut-wasm` bundle size | < 5 MB gzipped | CI build artifact check |
| p95 preview render latency | < 16 ms/frame (60 fps budget) | Browser performance.mark instrumentation |
| Crash-free sessions | ≥ 99% | Sentry / error boundary capture rate |
| Build time | < 60 seconds | GitHub Actions workflow duration |
| Test coverage (`src/lib/`) | ≥ 85% | `docker run test` coverage report |
| Vibecoding Index | < 40 (Green) | `./endiorbot.mjs vibecoding check` |

### 3.3 Open-Source Health Metrics

| Metric | 6-Month Target |
|--------|---------------|
| External PRs merged | ≥ 20 |
| `opencut-wasm` crate downloads | ≥ 500/month |
| Self-hosted deployments reported | ≥ 50 |
| Issues closed by non-core contributors | ≥ 30% |

### 3.4 Anti-Metrics

The following are explicitly NOT success criteria for this gate:

- **Monthly Recurring Revenue** — OpenCut is OSS-first; commercial derivatives are out of scope for G0.
- **Server-side video processing volume** — must remain zero by architecture, not by monitoring target.
- **App store installs** — the browser-first strategy intentionally bypasses app store gatekeeping.

---

## 4. Risk Assessment

### 4.1 Risk Register

| ID | Risk | Likelihood | Impact | Severity | Mitigation |
|----|------|-----------|--------|----------|-----------|
| R-01 | WebGPU browser support regression (Chrome/Firefox API changes) | Low | Critical | High | `opencut-wasm` abstracts GPU access via `wgpu`; fallback to WebGL2 in roadmap |
| R-02 | `opencut-wasm` WASM build breaks on dependency update | Medium | High | High | Versioned crate pin (`^0.2.10`); CI gate on every `package.json` change |
| R-03 | `better-auth` session security vulnerability | Low | Critical | High | `@upstash/ratelimit` rate-limiting in place; auth touches only project metadata, not video |
| R-04 | Cloudflare Workers cold-start latency degrades UX | Medium | Medium | Medium | `@opennextjs/cloudflare` adapter; static assets cached at edge |
| R-05 | IndexedDB storage eviction causes project loss | Medium | High | High | v0.3.0 ships Storage API persistence request; user-visible warning on low storage |
| R-06 | CapCut regulatory outcome removes competitor pressure | Low | Low | Low | OpenCut's value is privacy + OSS, not just CapCut displacement |
| R-07 | Desktop app (`apps/desktop/`) scope creep delays web milestone | Medium | Medium | Medium | Desktop treated as separate workstream sharing `opencut-wasm` crate only |
| R-08 | GDPR/HIPAA compliance scope expands to cover `better-auth` user data | Medium | High | High | `assumed` item from problem statement §5.4; must be resolved at G1 |

### 4.2 Dependency Risk Detail

| Dependency | Risk Surface | Current Version | Mitigation |
|------------|-------------|-----------------|-----------|
| `opencut-wasm` | WASM ABI changes break rendering | `^0.2.10` | Pin major.minor; integration test on upgrade |
| `next` | Breaking changes in App Router or Server Actions | `15.x` | Lock to minor in `package.json`; CI on upgrade |
| `better-auth` | Auth bypass or session fixation CVE | latest | Upstash rate-limiting; no video data in auth scope |
| `@types/react` / `@types/react-dom` | Type definition drift from React runtime | Must match React version | `devDependencies` pinned with React runtime |

### 4.3 Go / No-Go Criteria for G1

Proceeding to G1 (Requirements Complete) requires:

- [ ] MAU instrumentation plan confirmed (resolves `assumed` item §5.4 of problem statement)
- [ ] GDPR/HIPAA applicability scoped for `better-auth` user account data (R-08)
- [ ] Desktop app (`apps/desktop/`) roadmap dependency on `opencut-wasm` versioned and decoupled
- [ ] Stakeholder interviews documented in `docs/evidence/G0.1/` (minimum 3 interviews per STANDARD tier)
- [ ] WebGPU fallback strategy (R-01) accepted by `@architect`

---

## Quality Gates

This document feeds **G0 — Problem Validation**.

| G0 Criterion | Status | Evidence Location |
|-------------|--------|------------------|
| Problem clearly articulated with evidence | ✅ Satisfied by dependency | `docs/00-foundation/problem-statement.md` §1–§3 |
| Business case justified with ROI analysis | ✅ Complete | §2 ROI Analysis (this document) |
| Stakeholders identified and consulted | ✅ Identified | `problem-statement.md` §2; consultation pending G0.1 |
| Success metrics defined | ✅ Complete | §3 Success Metrics (this document) |
| Risk assessment documented | ✅ Complete | §4 Risk Assessment (this document) |
| Technology stack feasibility | ✅ Evidence present | §1.3 Dependency alignment; shipped changelog evidence |

**G0 Pass Recommendation:** Business justification, ROI analysis, and risk register are complete with evidence grounded in the shipped codebase (v0.1.0–v0.4.0). Three open items (§4.3) are appropriately deferred to G1 and do not block G0. Stakeholder interviews must be logged in `docs/evidence/G0.1/` before G0.1 sign-off.

**Proposed next gate:** G0 → G1 (Requirements Complete). Owner: `@pm`. Approver: `@cpo`.

---