---
spec_id: SPEC-01PLANNING-001
title: "requirements"
spec_version: "1.0.0"
status: draft
tier: STANDARD
stage: "01-planning"
category: functional
owner: "@pm"
created: 2026-05-16
last_updated: 2026-05-16
---

# OpenCut — Requirements

## Scope

### In-Scope (G0.1)

| Area | Description |
|------|-------------|
| WASM compositor | GPU-accelerated rendering via `opencut-wasm` running entirely in-browser |
| Timeline editing | Multi-track timeline with clips, keyframes, trimming, and split operations |
| Canvas preview | Real-time composited preview at up to 60 fps using OffscreenCanvas |
| Media ingestion | Local file import for video, audio, and image assets (no server upload) |
| Effects pipeline | Visual effects applied per-clip via the Rust `effects` crate |
| Mask compositing | Layer masking with JFA-based feathering via the Rust `masks` crate |
| Text & graphics | Animated text overlays and graphic elements on the timeline |
| MP4 export | Client-side MP4 export with audio mux |
| Authentication | Email/password sign-in via `better-auth` + Drizzle + PostgreSQL |
| Project persistence | Browser-side IndexedDB project storage with Storage API durability request |
| Auto-captions | On-device speech-to-text via `@huggingface/transformers` |
| Keybindings | Configurable keyboard shortcuts with persistence |
| Cloudflare deployment | Edge deployment via `@opennextjs/cloudflare` with zero video data egress |

### Out-of-Scope (G0.1)

| Area | Reason |
|------|--------|
| Server-side video processing | Architectural invariant — video bytes must never leave the user's machine |
| Real-time collaboration / multiplayer editing | Deferred; requires server-side project state sync |
| Desktop app GA (`apps/desktop/`) | Separate workstream sharing only the `opencut-wasm` crate |
| Paid / commercial tier | OpenCut is OSS-first; commercial extensions are post-G1 scope |
| Mobile native apps | Browser delivery covers mobile; dedicated apps are out of scope for this release |
| AI-generated video or image synthesis | Not part of the core compositing mission |

---

## 1. Functional Requirements

### FR-001 — WASM Compositor Module (`opencut-wasm`)

**User Story**
As a content creator, I want the editor to render composited video frames entirely on my GPU without sending any footage to a server, so that my private or professionally sensitive footage is never exposed to third parties.

**Acceptance Criteria**

