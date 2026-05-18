---
adr_id: ADR-002
title: "Analytics Instrumentation Strategy"
status: Accepted
tier: STANDARD
stage: "02-design"
owner: "@architect"
created: 2026-05-17
last_updated: 2026-05-17
gate: G2
authority:
  proposer: "@architect"
  countersigners:
    - actor: "@cto"
      date: "2026-05-17"
      reference: "G2-review-v2"
  trigger: "OI-001 deferred from G1"
---

# ADR-002: Analytics Instrumentation Strategy

## Status

**Accepted** — CTO countersigned 2026-05-17 (G2 Approved).

---

## Context

OI-001 was deferred from G1 with the rationale: "Implementation detail; architecture scope. Does not block requirements definition." Now that requirements are locked and architecture is being detailed, we must decide how OpenCut instruments user behavior without violating the project's core privacy invariant (NFR-001: Zero Video Egress).

Analytics for a video editor are high-value:
- **Export funnel:** How many users start an export vs complete it? Where do they drop off?
- **Feature adoption:** Which effects, transitions, and tools are used most?
- **Performance telemetry:** Real-world frame render times, export durations, crash rates.
- **Session quality:** Time-to-interactive, undo depth, project complexity (track count, clip count).

However, OpenCut's brand promise is privacy. Any analytics solution must be architecturally incapable of leaking video data or PII beyond what `better-auth` already stores for account management.

---

## Decision

OpenCut adopts a **dual-track, privacy-first analytics strategy**:

### Track A — Product Analytics (Client-Side, Cookie-Free)

**Provider:** [Plausible Analytics](https://plausible.io/) (self-hosted or managed)

**Rationale:**
- Plausible is cookie-free, GDPR-compliant by design, and does not use persistent identifiers.
- It collects only aggregate pageviews and custom events — no user profiling, no cross-site tracking.
- The lightweight script (~1 KB) has negligible impact on LCP.
- Self-hosted option (Plausible CE via Docker) eliminates third-party data sharing entirely.

**Metrics collected:**

| Event | Properties | Purpose |
|-------|-----------|---------|
| `pageview` | `path`, `referrer` | Basic traffic (landing, editor, auth) |
| `export_start` | `format`, `quality`, `has_audio` | Export funnel entry |
| `export_complete` | `format`, `duration_seconds`, `file_size_mb` | Export funnel success |
| `export_error` | `error_type` | Export failure diagnosis |
| `effect_applied` | `effect_name` | Feature adoption |
| `mask_applied` | `mask_type` | Feature adoption |
| `caption_generated` | `language`, `duration_seconds` | Auto-caption usage |
| `project_saved` | `clip_count`, `track_count`, `has_effects` | Project complexity proxy |

**Privacy constraints:**
- NO video file names, NO thumbnail data, NO pixel dimensions of user footage.
- NO user email, name, or `better-auth` user ID sent to Plausible.
- IP addresses are anonymized (`1.2.3.0`) before storage.

**Implementation:**
- Script loaded via `next/script` with `strategy="lazyOnload"`.
- Events dispatched via `window.plausible('event_name', { props: { ... } })`.
- If self-hosted: deployed as a separate Docker service (`plausible` + `plausible-db` + `plausible-events-db`) on a subdomain `analytics.opencut.dev`.

### Track B — Operational Telemetry (Edge-Side, No Client PII)

**Provider:** Cloudflare Analytics (built into Workers + Pages)

**Rationale:**
- Already included in Cloudflare deployment (FR-013). No additional bundle size.
- Captures edge-side metrics: request latency, error rates, cache hit ratio, Worker CPU time.
- Cannot access client-side state (timelines, media), so it is privacy-safe by construction.

**Metrics collected:**

| Metric | Source | Purpose |
|--------|--------|---------|
| Auth API p95 latency | Cloudflare Workers analytics | NFR-002 compliance check |
| Auth API error rate | Cloudflare Workers analytics | NFR-003 compliance check |
| Cache hit ratio | Cloudflare Pages analytics | FR-13 deployment health |
| Worker CPU time | Cloudflare Workers analytics | Capacity planning |

**Privacy constraints:**
- No custom event properties that reference user IDs or project IDs.
- Aggregate only — per-request logs are sampled at 1% and purged after 7 days.

### Track C — Performance Telemetry (Client-Side, Opt-In)

**Provider:** Custom, stored in IndexedDB and batched

**Rationale:**
- Frame render times and WASM performance are too granular for Plausible or Cloudflare.
- We need real-world GPU performance data to validate NFR-002 targets.
- Must be strictly opt-in to respect user trust.

**Metrics collected (opt-in only):**

| Metric | Source | Aggregation |
|--------|--------|-------------|
| `render_frame_ms` | `rust/wasm/src/perf.rs` | p50, p95, p99 per session |
| `export_fps` | `SceneExporter` | Average FPS during export |
| `webgpu_adapter` | `wgpu` info | Vendor, backend (Vulkan/Metal/DX12/WebGL2) |
| `project_clip_count` | `TimelineManager` | Binned: 1–10, 11–50, 51–200, 200+ |

**Implementation:**
- On app startup, a non-blocking dialog asks: "Help improve OpenCut by sharing anonymous performance data?"
- If accepted, metrics are written to a dedicated IndexedDB store (`opencut-telemetry`).
- Once per session (or on app close), a `navigator.sendBeacon()` POST sends a batch to a Cloudflare Worker endpoint `/api/telemetry`.
- The Worker stores aggregated histograms in Cloudflare Analytics (not a database) — no individual session is recoverable.

---

## Consequences

### Positive

- **Privacy by design:** Track A is cookie-free and GDPR-compliant without a banner. Track B is edge-side and cannot leak video data. Track C is opt-in and anonymized.
- **No vendor lock-in:** Plausible is open-source (AGPL). Self-hosting eliminates dependency on a proprietary analytics platform.
- **Actionable product insights:** Export funnel and feature adoption metrics directly inform sprint prioritization.
- **Performance validation:** Track C provides the real-world GPU data needed to verify NFR-002 targets across device classes.

### Negative / Risks

- **Self-hosting overhead:** If Plausible is self-hosted, it adds 3 containers to the Docker Compose stack. The PM must decide managed vs self-hosted based on budget.
- **Opt-in bias:** Track C data will skew toward power users who are more likely to opt in. This is acceptable for performance trend analysis but not for user-behavior research.
- **Ad-blockers:** Plausible is blocked by some aggressive filter lists (though less than Google Analytics). This understates traffic by ~5–15% — acceptable for trend analysis.

---

## Alternatives Considered

### Alternative A — Google Analytics 4

**Rejected:**
- Requires cookie consent banner in EU/UK (GDPR).
- Data is processed in the US, creating Schrems II legal risk for EU users.
- Heavier script (~40 KB) impacts LCP.
- Conflicts with OpenCut's privacy-first brand.

### Alternative B — PostHog (Product OS)

**Not chosen:**
- PostHog offers session replay and feature flags, which are valuable.
- However, session replay inherently captures UI state that might include project titles or thumbnail previews. This creates a privacy review burden.
- PostHog Cloud is US-hosted; self-hosted requires ClickHouse + Kafka, which is excessive for a team of this size.
- **Fallback position:** If Plausible proves insufficient for product analytics depth, PostHog self-hosted is the designated fallback. No code changes required — both use `window.posthog` / `window.plausible` event dispatch patterns.

### Alternative C — No Analytics

**Rejected:**
- We cannot validate the export funnel, measure feature adoption, or verify NFR-002 performance targets without instrumentation.
- "No analytics" would block data-driven product decisions and make capacity planning guesswork.

---

## Implementation Checklist

- [ ] Add Plausible script to `apps/web/src/app/layout.tsx` (lazyOnload)
- [ ] Create `apps/web/src/analytics/` module with type-safe `trackEvent()` wrapper
- [ ] Instrument export flow: `export_start`, `export_complete`, `export_error`
- [ ] Instrument effect application: `effect_applied`
- [ ] Instrument auto-captions: `caption_generated`
- [ ] Create `/api/telemetry` Cloudflare Worker route for Track C (opt-in batch)
- [ ] Add opt-in dialog to `apps/web/src/components/` (dismissable, remembered in `localStorage`)
- [ ] Document privacy policy update (GDPR Article 13/14 notice for Track A + C)

---

## References

- [Requirements](../../01-planning/requirements.md) — OI-001 (deferred from G1), FR-013 (Cloudflare deployment)
- [ADR-001](./ADR-001-initial-architecture.md) — Layer 3 edge surface constraints
- Plausible docs: https://plausible.io/docs
- Cloudflare Analytics docs: https://developers.cloudflare.com/analytics/
