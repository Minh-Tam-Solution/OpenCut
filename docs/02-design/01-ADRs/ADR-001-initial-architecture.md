---
adr_id: ADR-001
title: "Initial Architecture — Browser-Native Video Editor"
status: Proposed
tier: STANDARD
stage: "02-design"
owner: "@architect"
created: 2026-05-16
last_updated: 2026-05-16
gate: G2
---

# ADR-001: Initial Architecture — Browser-Native Video Editor

## Status

**Proposed** — pending G2 (Design Approval) countersign by `@cto`.

---

## Context

OpenCut must deliver a production-grade, open-source video editor that runs entirely in the browser with **zero video-data egress** to any server. The dominant consumer editors (CapCut, Adobe Rush, Clipchamp) all route footage through proprietary cloud infrastructure, creating privacy, regulatory, and vendor-lock-in risks documented in the [Problem Statement](../../00-foundation/problem-statement.md).

The architecture must satisfy three non-negotiable invariants established in the requirements phase:

1. **Local rendering only** — video bytes must never leave the user's machine (see [Requirements §Scope](../../01-planning/requirements.md)).
2. **GPU-accelerated compositing** — real-time preview at up to 60 fps requires GPU compute; CPU-only approaches cannot meet the latency target.
3. **Zero installation** — the editor must run in a standard browser tab without plugins, extensions, or native installers.

Historically, browser-based video processing was limited by the lack of low-level GPU access. That constraint is now resolved: **WebGPU** exposes GPU compute to browsers, and **Rust** compiles to **WebAssembly (WASM)** with near-native performance. This architecture exploits both capabilities.

The chosen dependency set (`next`, `@types/react`, `@types/react-dom`, `better-auth`, `opencut`, `opencut-wasm`) implies a clear layered boundary: the React/Next.js shell handles UI orchestration and user sessions, while the Rust/WASM core owns all media processing. Conflating these layers would compromise both performance and maintainability.

---

## Decision

OpenCut adopts a **three-layer browser-native architecture** with a strict processing boundary between the UI layer and the compositor layer:

### Layer 1 — Shell (Next.js + React)

**Package:** `opencut` (the main web application)
**Dependencies:** `next`, `@types/react`, `@types/react-dom`, `better-auth`

The Next.js shell is responsible for:

- **Routing and page structure** — App Router with server components for static shells; client components for interactive editor panels.
- **Authentication** — `better-auth` backed by Drizzle ORM and PostgreSQL. Only session tokens and user metadata cross the network; no media data is involved in any auth flow.
- **Project persistence** — Browser-side IndexedDB via the Storage API. Project files (timelines, metadata, thumbnails) are stored locally. Server state holds only identity and project manifests (titles, timestamps), never video bytes.
- **Asset management** — Media assets (video, audio, image) are referenced by `File` handles obtained via the File System Access API. No upload is performed; the WASM layer receives `ArrayBuffer` slices directly from the browser's file system sandbox.
- **Timeline UI** — React components for the track editor, clip inspector, keyframe editor, and effects panel. All timeline mutations are dispatched as pure state updates; rendering decisions are delegated to Layer 2.
- **Export orchestration** — The export flow drives the WASM compositor frame-by-frame, collects encoded `ArrayBuffer` chunks, and muxes them client-side into MP4 using `@ffmpeg/ffmpeg` (WASM build) without invoking any server endpoint.
- **Auto-captions** — On-device speech-to-text via `@huggingface/transformers` (WebWorker). The audio track is never sent to a remote ASR service.
- **Cloudflare edge deployment** — `@opennextjs/cloudflare` adapts Next.js output for Cloudflare Pages + Workers. The deployment surface is limited to the static shell and auth API routes; the compositor runs 100% in the client.

### Layer 2 — Compositor (`opencut-wasm`)

**Package:** `opencut-wasm` (Rust crate compiled to WASM)
**Runtime:** WebGPU via `wgpu`; OffscreenCanvas for frame delivery to the shell

The WASM compositor is responsible for:

- **Frame compositing** — Each video frame is decoded, composited with overlays and effects, and written to an `OffscreenCanvas` that the shell reads for preview or export.
- **Effects pipeline** — Per-clip visual effects (color grading, blur, transitions) are implemented as `wgpu` compute shaders in the Rust `effects` crate. Running on the GPU avoids JavaScript execution overhead entirely.
- **Mask compositing** — Layer masking with Jump Flood Algorithm (JFA) feathering, implemented in the Rust `masks` crate. JFA runs as a multi-pass GPU compute pipeline.
- **Synchronization** — The compositor exposes a `render_frame(timeline_state, pts)` WASM-bindgen binding. The shell drives this call in a `requestAnimationFrame` loop for preview and sequentially for export.
- **Memory model** — Video frames are transferred as `SharedArrayBuffer` or `ArrayBuffer` between the shell and the WASM linear memory. No copying through the JavaScript heap for large frame data; `postMessage` with `Transferable` semantics is used where applicable.

### Layer 3 — Auth & Project API (Edge Functions)

**Runtime:** Cloudflare Workers (via `@opennextjs/cloudflare`)

The server surface is intentionally minimal:

- `POST /api/auth/*` — `better-auth` handlers for sign-up, sign-in, session refresh, and sign-out.
- `GET/POST /api/projects` — CRUD for project manifests (title, duration, thumbnail URL, created/updated timestamps). The manifest references assets by their client-side `FileSystemHandle` ID, not by server-stored bytes.
- No video-processing endpoints exist or will be added. Any future server-side capability (e.g., collaborative cursors) must be implemented without creating a video-data upload path.

### Module Boundaries (summary)

| Module | Package | Responsibility | Data crossing boundary |
|--------|---------|---------------|------------------------|
| Shell UI | `opencut` (Next.js) | Timeline state, routing, auth, export orchestration | Session tokens, project manifests |
| Compositor | `opencut-wasm` | GPU compositing, effects, masks | `ArrayBuffer` frame slices (never persisted server-side) |
| Edge API | Cloudflare Worker | Auth, project manifests | JSON (no video bytes) |
| Auth store | PostgreSQL (via Drizzle) | Users, sessions | Hashed credentials, session metadata |

---

## Consequences

### Positive

- **Privacy by construction** — The three-layer boundary makes server-side video access architecturally impossible, not merely policy-prohibited. Auditors can verify this by inspecting network calls: no endpoint accepts `multipart/form-data` with video content.
- **Horizontal scalability** — All compute-intensive work runs on the user's GPU. Server load is limited to auth and manifest operations, which are small and cacheable at the CDN edge.
- **Open auditability** — Both the shell (`opencut`) and compositor (`opencut-wasm`) are open-source. The rendering pipeline is fully inspectable, which is a key differentiator over commercial tools.
- **Offline capability** — Once the WASM bundle is cached via the Service Worker, editing and export work without any network connectivity.
- **WebGPU performance** — GPU compute shaders in `wgpu` deliver near-native rendering speed. The 60 fps real-time preview target is achievable on mid-range hardware with WebGPU support.

### Negative / Risks

- **Browser compatibility** — WebGPU is broadly supported in Chrome 113+ and Edge 113+, but is still behind a flag in some Firefox versions and absent in Safari until 18+. A software fallback (`wgpu` `WebGL2` adapter) is required for broader reach; this must be validated before G3.
- **WASM bundle size** — The Rust compositor with `wgpu` and all effect shaders will produce a large WASM bundle (estimate: 3–8 MB gzipped). Initial load time is a UX risk. Mitigation: lazy-load the WASM module only when the editor route is first entered; use Cloudflare's edge caching and HTTP/2 push for the bundle.
- **`SharedArrayBuffer` constraints** — `SharedArrayBuffer` requires `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` headers. These affect iframe embedding and third-party scripts. The Cloudflare deployment must set these headers on the editor route only.
- **IndexedDB storage limits** — Browsers impose quota limits on IndexedDB (typically 50–80% of available disk, but origin-specific limits vary). Large projects with many media files will approach limits. The File System Access API path (persisted handles) mitigates this for assets but not for rendered thumbnails.
- **`better-auth` maturity** — `better-auth` is a relatively new library. Its session management and CSRF protection must be validated against OWASP ASVS L2 before G2 is closed. If gaps are found, migration to Auth.js (NextAuth) is the fallback.

---

## Alternatives Considered

### Alternative A — Server-Side FFmpeg Rendering

Upload video assets to a server and process with FFmpeg. Standard SaaS video editing approach (Descript, Kapwing, Veed.io).

**Rejected because:**
- Directly violates the zero-egress privacy invariant.
- Imposes server compute costs that scale linearly with render volume; unsustainable for an open-source project without commercial backing.
- Replicates the exact model OpenCut is designed to replace.

### Alternative B — Electron Desktop App (no browser target)

Package the editor as a desktop app using Electron + native FFmpeg binaries.

**Rejected because:**
- Eliminates the zero-installation browser-native requirement.
- Desktop packaging requires OS-specific builds and update infrastructure.
- `apps/desktop/` is an explicitly out-of-scope workstream for G0.1 ([Requirements §Out-of-Scope](../../01-planning/requirements.md)).
- The `opencut-wasm` compositor can still power a desktop shell post-G1, so the WASM investment is not wasted.

### Alternative C — WebCodecs + Canvas 2D (no WebGPU / WASM)

Use the browser-native `WebCodecs` API for decoding and `Canvas2D` for compositing, avoiding Rust/WASM entirely.

**Rejected because:**
- `Canvas2D` compositing is CPU-bound and cannot meet the 60 fps preview target for multi-track timelines with effects.
- GPU effects (color grading, blur, masking) would require hand-written WebGL2 shaders instead of leveraging `wgpu`'s cross-backend abstraction, multiplying maintenance surface.
- WASM/WebGPU provides a cleaner performance ceiling and a path to native (desktop) reuse via the same Rust crate.
- `WebCodecs` is still used for decoding inside the WASM layer; this alternative is not mutually exclusive with the chosen approach at the decoding stage.

### Alternative D — Next.js with Auth.js (NextAuth) instead of `better-auth`

Use the established `next-auth` / Auth.js library for authentication.

**Not chosen (provisional):**
- `better-auth` offers a cleaner Drizzle-native adapter and first-class TypeScript types without the callback-heavy configuration model of NextAuth v4.
- The risk is library maturity (see Consequences). If `better-auth` fails the OWASP validation, Auth.js is the designated fallback and requires no architectural changes — both libraries implement the same session-cookie pattern.

---

## Quality Gates

This ADR is evidence for **G2 — Design Approved**. The following checklist must be satisfied before `@cto` countersigns:

- [ ] Architecture reviewed by `@architect` — module boundaries documented above.
- [ ] Technology stack justified — rationale provided for Next.js, `opencut-wasm`, `better-auth`, and Cloudflare deployment in the Decision section.
- [ ] All code modules covered — `opencut` (shell), `opencut-wasm` (compositor), Edge API (auth + manifests), PostgreSQL (auth store).
- [ ] Security considerations identified — CORS headers, `SharedArrayBuffer` constraints, `better-auth` OWASP validation pending.
- [ ] Non-functional requirements addressed — 60 fps target, WASM bundle size risk, offline capability, browser compatibility matrix.
- [ ] No server-side video-processing path exists or is proposed — confirmed by module boundary table.

---

## References

- [Problem Statement](../../00-foundation/problem-statement.md) — Core privacy and portability problems this architecture solves; §1.2 root cause analysis that establishes WebGPU + WASM as the enabling technology.
- [Business Case](../../00-foundation/business-case.md) — Cost model (zero server compute for rendering) and open-source sustainability argument that constrain the server surface to auth + manifests only.
- [Requirements](../../01-planning/requirements.md) — FR-001 (`opencut-wasm` compositor), FR-008 (authentication via `better-auth`), FR-009 (IndexedDB persistence), FR-011 (auto-captions on-device), and Out-of-Scope table (server-side processing explicitly excluded).