---
spec_id: SPEC-01PLANNING-001
title: "requirements"
spec_version: "2.0.0"
status: review
tier: STANDARD
stage: "01-planning"
category: functional
owner: "@pm"
created: 2026-05-16
last_updated: 2026-05-17
gate: G1
---

# OpenCut — Requirements

> **Status:** `review` — submitted for G1 (Requirements Complete) CTO/CPO sign-off.  
> **Previous:** `draft` (FR-001 stub only). Updated 2026-05-17 by @pm post G0.1 PASS.  
> **Evidence basis:** G0.1 full-stack execution report (`docs/00-foundation/execution-report-g0.1.md`), problem statement, business case.

---

## Scope

### In-Scope (G1)

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

### Out-of-Scope (G1)

| Area | Reason |
|------|--------|
| Server-side video processing | Architectural invariant — video bytes must never leave the user's machine |
| Real-time collaboration / multiplayer | Deferred; requires server-side project state sync |
| Desktop app GA (`apps/desktop/`) | Separate workstream; shares `opencut-wasm` crate only |
| Paid / commercial tier | OSS-first; commercial extensions are post-G1 scope |
| Mobile native apps | Browser delivery covers mobile for this release |
| AI-generated video/image synthesis | Not part of core compositing mission |
| WebGPU fallback to WebGL2 | Deferred; documented as R-01 in business-case risk register |

---

## 1. Functional Requirements

### FR-001 — WASM Compositor Module (`opencut-wasm`)

**Priority:** Must Have

**User Story**
```
As a content creator,
I want the editor to render composited video frames entirely on my GPU
without sending any footage to a server,
so that my private or professionally sensitive footage is never exposed to third parties.
```

**Acceptance Criteria**

```gherkin
Given a user has imported local video assets into the timeline
When the preview canvas renders a frame
Then the frame is composited via opencut-wasm running in a WebWorker/OffscreenCanvas
And zero bytes of video content are transmitted over the network
And the rendered frame appears in the preview within 16ms of the requested timestamp

Given opencut-wasm version 0.2.x is loaded
When the compositor renders a frame at MediaTime precision
Then timing resolution is 120,000 ticks/second (no floating-point drift)
And the output frame dimensions match the project canvas settings

Given a user's browser does not support WebGPU
When they open the editor
Then a clear warning is displayed ("WebGPU not supported — preview disabled")
And the rest of the UI remains functional (timeline editing, export via CPU fallback)
```

**Success Metrics**
- p95 frame render time < 16ms on WebGPU-capable hardware
- WASM bundle size < 5 MB gzipped
- Zero network requests containing video data in any session

---

### FR-002 — Timeline Editing

**Priority:** Must Have

**User Story**
```
As a video editor,
I want to arrange, trim, split, and reorder clips on a multi-track timeline,
so that I can compose my video non-destructively without re-encoding source files.
```

**Acceptance Criteria**

```gherkin
Given a user has imported at least one media file
When they drag a clip onto the timeline
Then the clip appears on the correct track at the drop position
And the timeline ruler updates to reflect the new project duration
And the source file is not modified or re-encoded

Given a clip exists on the timeline
When the user drags the left or right edge of a clip
Then the clip is trimmed (in-point or out-point adjusted) non-destructively
And the preview updates to reflect the trim in real-time

Given a clip exists on the timeline
When the user invokes "Split at Playhead" (keyboard or context menu)
Then the clip is split into two independent clips at the playhead position
And both resulting clips retain their original source references

Given multiple clips on multiple tracks
When the user drags a clip to a new track or position
Then clip order updates immediately with no frame drop in preview
And undo (Ctrl/Cmd+Z) restores the previous arrangement

Given a keyframe exists on a clip property
When the user scrubs the timeline
Then the property value interpolates correctly between keyframes
And the preview reflects the interpolated value at each frame
```

**Success Metrics**
- Drag-and-drop response < 100ms (no jank on timelines with ≤ 20 clips)
- Undo/redo stack depth ≥ 50 operations

---

### FR-003 — Canvas Preview (Real-Time)

**Priority:** Must Have

**User Story**
```
As a video editor,
I want to see a real-time composited preview of my timeline at up to 60 fps,
so that I can evaluate visual quality without exporting.
```

**Acceptance Criteria**

```gherkin
Given a project with multiple video and graphic tracks
When the user presses Play
Then the preview renders at the project frame rate (default 30fps, configurable to 60fps)
And frame delivery uses OffscreenCanvas to avoid blocking the main UI thread
And the preview plays back in sync with the audio track (within ±1 frame drift)

Given the user moves the playhead to any position
When the scrub completes (mouseup)
Then the preview displays the composited frame at that timestamp within 100ms

Given an effect (blur, color grade) is applied to a clip
When the preview renders that clip
Then the effect is applied via GPU compute shader
And the rendered output matches the effect parameters in the effects panel
```

**Success Metrics**
- Playback frame rate ≥ 30fps for projects ≤ 3 tracks on reference hardware (M1 MacBook / Chrome)
- Scrub-to-frame latency p95 < 100ms

---

### FR-004 — Media Ingestion (Local File Import)

**Priority:** Must Have

**User Story**
```
As a content creator,
I want to import video, audio, and image files from my local device
without uploading them to any server,
so that my files remain private and on my machine.
```

**Acceptance Criteria**

```gherkin
Given the user clicks "Import" or drags files onto the media panel
When files are selected (MP4, MOV, WebM, MP3, WAV, PNG, JPEG, GIF)
Then the files are loaded via the File System Access API or <input type="file">
And NO file bytes are transmitted to any server endpoint
And a thumbnail/waveform is generated locally and displayed in the media panel within 2 seconds

Given the user imports a video file larger than 1 GB
When the file is loaded
Then the editor remains responsive (main thread not blocked)
And the file is accessed via a local object URL or file handle

Given the user refreshes the page after importing files
When the project is restored from IndexedDB
Then previously imported file handles are presented for re-confirmation (File System Access API re-grant)
And the user can re-attach files with a single click
```

**Success Metrics**
- Import UI response (file picker → thumbnail visible) < 2 seconds for files ≤ 500 MB
- Zero server-side file upload requests in browser network log

---

### FR-005 — Effects Pipeline

**Priority:** Must Have

**User Story**
```
As a video editor,
I want to apply visual effects (blur, color grading, transitions) to clips
with parameters I can adjust in real-time,
so that I can achieve professional-quality output without external software.
```

**Acceptance Criteria**

```gherkin
Given a clip on the timeline
When the user selects an effect from the effects panel and applies it
Then the effect appears in the clip's effect stack
And the preview reflects the effect immediately using GPU compute shaders (WGSL)
And the effect parameters are exposed as adjustable controls in the properties panel

Given multiple effects applied to the same clip
When the preview renders that clip
Then effects are applied in stack order (top → bottom)
And each effect pass uses the GPU output of the previous pass as input

Given the user adjusts an effect parameter (e.g., blur radius)
When the value changes
Then the preview updates within 100ms (no full re-render required for parameter change)
And the parameter value is persisted in the project state (IndexedDB)

Given the user applies a transition between two adjacent clips
When the timeline renders the transition region
Then the transition effect blends the clips over the configured duration
And the transition renders correctly in the exported MP4
```

**Success Metrics**
- All GPU effects render via WGSL shaders (no CPU-side pixel manipulation)
- Effect parameter update → preview refresh < 100ms

---

### FR-006 — Mask Compositing

**Priority:** Must Have

**User Story**
```
As a video editor,
I want to apply masks to layers to control which regions are visible,
with feathered edges for natural-looking composites,
so that I can create professional multi-layer compositions locally.
```

**Acceptance Criteria**

```gherkin
Given a clip on the timeline with a mask applied
When the compositor renders that clip
Then only the unmasked region of the clip is visible in the output
And the mask edges are feathered using the JFA (Jump Flood Algorithm) implementation in rust/crates/masks

Given the user adjusts the mask feather radius
When the preview renders
Then the feather width changes proportionally to the configured radius
And the change is visible in the preview within 100ms

Given a clip with both an effect and a mask
When the compositor renders
Then the mask is applied AFTER the effect pipeline (effects render the full clip, then mask crops the result)
```

**Success Metrics**
- Mask compositing renders in < 16ms additional overhead per masked layer (at 1080p)

---

### FR-007 — Text & Graphics Overlays

**Priority:** Must Have

**User Story**
```
As a content creator,
I want to add animated text and graphic overlays to my video timeline,
so that I can create captions, titles, and branded elements without external tools.
```

**Acceptance Criteria**

```gherkin
Given the user adds a text element to the timeline
When they type text in the text editor panel
Then the text appears on the preview canvas at the configured position, font, size, and color
And the text element has a configurable in/out point on the timeline

Given a text element with keyframes on opacity or position
When the preview plays through the keyframed region
Then the text animates smoothly between keyframe values using the configured easing curve

Given the user exports to MP4
When the export runs
Then all text and graphic overlays are composited into the output video
And the text rendering matches the preview exactly (no font substitution or size drift)

Given the user applies a preset font from the font library
When the font loads
Then the correct glyph sprites are used for rendering (via the font sprite generation in apps/web/scripts/generate-font-sprites.ts)
```

**Success Metrics**
- Text overlay renders at the same frame rate as the rest of the compositor
- Export output visually matches preview for all supported fonts

---

### FR-008 — MP4 Export (Client-Side)

**Priority:** Must Have

**User Story**
```
As a content creator,
I want to export my finished video as an MP4 file
without uploading any footage to a server,
so that I own my content and my private footage stays on my machine.
```

**Acceptance Criteria**

```gherkin
Given a project with video, audio, and overlay tracks
When the user clicks "Export" and selects MP4 format
Then the export pipeline renders all frames via opencut-wasm on the client GPU
And audio is muxed into the output file client-side
And the resulting file is downloaded to the user's device
And NO video data is sent to any server during the export process

Given the user starts an export
When the export is running
Then a progress indicator shows % completion
And the UI remains partially interactive (the user can cancel export)
And the export can be cancelled cleanly without leaving a corrupt partial file

Given the export completes
When the user opens the resulting MP4
Then the video plays correctly in standard players (VLC, macOS QuickTime, Chrome)
And the video duration matches the project duration
And audio/video sync is within ±1 frame
```

**Success Metrics**
- Export real-time factor ≥ 1× (real-time or faster at 1080p/30fps on M1 MacBook)
- Zero network requests containing video bytes during export
- Exported MP4 passes basic format validation (ffprobe reports valid container)

---

### FR-009 — Authentication

**Priority:** Must Have

**User Story**
```
As a user,
I want to create an account and sign in securely,
so that my project metadata is associated with my identity and accessible across sessions.
```

**Acceptance Criteria**

```gherkin
Given a new visitor reaches the sign-up page
When they submit a valid email and password (minimum 8 characters)
Then an account is created in PostgreSQL via better-auth
And a session token is issued and stored as an HTTP-only cookie
And the user is redirected to the editor dashboard

Given a registered user submits their credentials on the sign-in page
When credentials are valid
Then a new session is created and the user is redirected to their project list
And the session token expires after the configured TTL (default: 7 days)

Given a user submits incorrect credentials 5 times in 60 seconds
When the 5th failed attempt occurs
Then the rate limiter (Upstash Redis via @upstash/ratelimit) blocks further attempts
And a 429 response is returned with a Retry-After header

Given a user is signed in
When they click "Sign out"
Then the session is invalidated in the database
And the session cookie is cleared
And the user is redirected to the sign-in page

Given the auth API receives a request
Then NO video file content is ever included in any auth request or response
```

**Success Metrics**
- Auth API p95 response time < 500ms (sign-in, sign-up, sign-out)
- Rate limiting blocks brute-force after ≤ 5 failed attempts within 60s window
- Zero video bytes stored server-side in auth flow

---

### FR-010 — Project Persistence (IndexedDB)

**Priority:** Must Have

**User Story**
```
As a user,
I want my project state to be automatically saved locally in the browser,
so that I can close the tab and return to my work without losing progress.
```

**Acceptance Criteria**

```gherkin
Given a user makes changes to a project (adds clip, adjusts keyframe, changes setting)
When the change is committed
Then the project state is written to IndexedDB within 500ms (auto-save)
And no explicit "Save" action is required

Given a user closes and reopens the browser tab
When they navigate to the editor
Then the project is restored from IndexedDB to its last saved state
And all clips, tracks, keyframes, and effect parameters are intact

Given the browser's storage is at risk of eviction
When the project is created or first opened
Then the editor requests the Storage API persistence grant (navigator.storage.persist())
And the user is informed if the grant is denied

Given a user has multiple projects
When they visit the project list
Then all projects are listed with thumbnail and last-modified timestamp
And each project can be opened, renamed, or deleted independently

Given a user explicitly deletes a project
When the deletion is confirmed
Then all associated IndexedDB data is removed
And the file handles (File System Access API) are released
```

**Success Metrics**
- Auto-save completes in < 500ms for projects ≤ 50 clips
- Project restore on page reload < 1 second for projects ≤ 50 clips

---

### FR-011 — Auto-Captions (On-Device Speech-to-Text)

**Priority:** Should Have

**User Story**
```
As a content creator,
I want to automatically generate captions from my video's audio track
without uploading audio to any server,
so that I can subtitle my videos privately and efficiently.
```

**Acceptance Criteria**

```gherkin
Given a video clip with a spoken audio track
When the user triggers "Generate Captions"
Then the audio is transcribed on-device using @huggingface/transformers (Whisper model)
And NO audio bytes are transmitted to any external API

Given transcription completes
When captions are generated
Then each caption segment is placed on a dedicated subtitles track in the timeline
And each caption has a start time, end time, and text value matching the spoken audio

Given the user edits a caption text in the subtitles panel
When the edit is saved
Then the updated text appears in the timeline and preview
And the change is persisted to IndexedDB

Given the model is not yet downloaded
When the user first triggers captioning
Then a progress indicator shows the model download progress
And the model is cached locally after the first download (no re-download per session)
```

**Success Metrics**
- Transcription accuracy ≥ 80% WER (Word Error Rate) on clear English speech
- Zero audio bytes transmitted to external APIs during transcription

---

### FR-012 — Configurable Keybindings

**Priority:** Should Have

**User Story**
```
As a power user,
I want to customize keyboard shortcuts for common editor actions,
so that I can work at the speed of thought using my preferred key layout.
```

**Acceptance Criteria**

```gherkin
Given the user opens the keybindings settings panel
When they reassign a shortcut (e.g., "Split at Playhead" from S to X)
Then the new binding is saved to localStorage
And the new binding is active immediately without page reload
And the old binding is unregistered

Given the user has custom keybindings saved in localStorage
When they reload the page
Then the custom bindings are restored from localStorage
And all custom bindings are functional

Given a keybinding schema migration (app update changes binding identifiers)
When the user loads the app after the update
Then the migration system updates stored bindings to the new schema
And custom overrides are preserved where the action still exists

Given the user clicks "Reset to defaults" in keybindings settings
When confirmed
Then all keybindings revert to the default configuration
And the reset is reflected immediately in the UI
```

**Success Metrics**
- All editor actions are accessible via keyboard shortcut (zero pointer-only actions)
- Custom binding persistence survives localStorage clear only (expected behavior — documented)

---

### FR-013 — Cloudflare Edge Deployment

**Priority:** Must Have

**User Story**
```
As an operator or self-hoster,
I want to deploy OpenCut to Cloudflare Workers
with zero configuration for video data egress,
so that the app scales globally at minimal cost.
```

**Acceptance Criteria**

```gherkin
Given the production build completes (bun run build:web)
When deployed to Cloudflare Workers via wrangler
Then the app serves all pages from the edge (no origin server required for static content)
And auth API routes (/api/auth/*) execute as Cloudflare Worker functions
And project manifest routes (/api/projects) execute as Cloudflare Worker functions

Given a user accesses the deployed app
When any request is processed
Then no request handler reads, writes, or buffers video file content
And the NEXT_PUBLIC_SITE_URL environment variable matches the deployment domain

Given the Cloudflare deployment is live
When 1,000 concurrent users access the editor
Then the edge serves static assets from cache (no origin hits for JS/CSS/WASM bundles)
And auth API handles ≥ 100 req/s per region without 5xx errors
```

**Success Metrics**
- Static asset cache hit rate ≥ 95% after warm-up
- Auth API p95 latency < 500ms globally (Cloudflare edge)
- Zero video bytes stored or transmitted through Cloudflare infrastructure

---

## 2. Non-Functional Requirements

### NFR-001 — Privacy (Zero Video Egress)

**Priority:** Must Have

```gherkin
Given any user session, regardless of feature used
When network requests are inspected
Then no request to any domain contains video file bytes in the body or query string
And this invariant applies to auth, export, auto-caption, and project save flows
```

**Measurement:** Automated CI test using browser network interception (playwright) asserting zero video-content requests.

---

### NFR-002 — Performance

**Priority:** Must Have

| Metric | Target | Measurement |
|--------|--------|-------------|
| Preview frame render | < 16ms p95 (60fps budget) | `performance.mark()` instrumentation in renderer |
| Scrub-to-frame latency | < 100ms p95 | Browser performance timeline |
| Export speed | ≥ 1× real-time at 1080p/30fps | Timed export of 60-second reference clip |
| Page load to interactive | < 3 seconds (LCP on Cloudflare edge, fast connection) | Lighthouse / Web Vitals |
| WASM bundle size | < 5 MB gzipped | CI build artifact check |

---

### NFR-003 — Reliability

**Priority:** Must Have

| Metric | Target | Measurement |
|--------|--------|-------------|
| Crash-free sessions | ≥ 99% | Error boundary capture rate (Sentry or equivalent) |
| Auto-save success rate | ≥ 99.9% | IndexedDB write error monitoring |
| Auth API availability | ≥ 99.5% | Cloudflare Workers uptime SLA |

---

### NFR-004 — Browser Compatibility

**Priority:** Must Have

| Browser | Minimum Version | WebGPU Support |
|---------|-----------------|----------------|
| Chrome / Chromium | 113+ | Full |
| Edge | 113+ | Full |
| Safari | 18+ | Full (as of 2024) |
| Firefox | 120+ | Partial (behind flag) — degraded mode |

**Acceptance:** App loads and timeline editing functions in all supported browsers. GPU compositor degrades gracefully (warning displayed) if WebGPU unavailable.

---

### NFR-005 — Security

**Priority:** Must Have

```gherkin
Given the auth API receives a sign-in request
When the request is processed
Then passwords are hashed server-side (better-auth default: bcrypt/argon2)
And session tokens are HTTP-only cookies (not accessible to JavaScript)
And CSRF protection is active on all state-mutating endpoints

Given the app is deployed to production
When security headers are checked
Then Content-Security-Policy disallows inline scripts
And X-Frame-Options is DENY or SAMEORIGIN
And HSTS is set with min-age ≥ 31536000
```

---

### NFR-006 — Code Quality

**Priority:** Should Have

| Metric | Target |
|--------|--------|
| Test coverage (`src/lib/`) | ≥ 85% (bun test) |
| Vibecoding Index | < 40 (Green — `./endiorbot.mjs vibecoding check`) |
| TypeScript strict mode | Enabled (no `any` escapes in new code) |
| Build time (CI) | < 60 seconds (turbo build:web) |
| Lint errors | 0 (`bun run lint:web` clean) |

---

## 3. Open Items (Must Resolve Before G1 Sign-Off)

The following items are `assumed` from the problem statement §5.4 and business case §4.3. They block G1 approval until resolved:

| # | Item | Owner | Status | Resolution |
|---|------|-------|--------|------------|
| OI-001 | MAU instrumentation plan (analytics setup, export funnel) | @pm + @architect | **DEFERRED → G2** | Implementation detail; architecture scope. Does not block requirements definition. |
| OI-002 | GDPR/HIPAA applicability scope for `better-auth` user account PII | @pm | **RESOLVED** | GDPR applicable (limited, low risk); HIPAA not applicable. See `docs/01-planning/OI-002-privacy-scope.md` |
| OI-003 | Stakeholder interviews documented (minimum 3 per STANDARD tier) | @pm | **DEFERRED (waiver)** | OSS project with shipped code (v0.1–v0.4) + community traction = implicit validation. Formal interviews deferred to post-launch. |
| OI-004 | WebGPU fallback strategy accepted by @architect (R-01 mitigation) | @pm + @architect | **RESOLVED** | Graceful degradation strategy documented. See `docs/01-planning/OI-004-webgpu-fallback.md` |
| OI-005 | Desktop app (`apps/desktop/`) `opencut-wasm` version decoupling plan | @architect + @pjm | **DEFERRED → G2** | Architecture scope; desktop shares crate via semver pin (`^0.2.x`). |

> **PM Note:** 2 items resolved with artifacts, 3 items deferred with rationale. Submitted for CTO conditional sign-off per SDLC 6.3.1 governance.

---

## 4. MoSCoW Summary

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-001 | WASM Compositor | **Must Have** |
| FR-002 | Timeline Editing | **Must Have** |
| FR-003 | Canvas Preview | **Must Have** |
| FR-004 | Media Ingestion | **Must Have** |
| FR-005 | Effects Pipeline | **Must Have** |
| FR-006 | Mask Compositing | **Must Have** |
| FR-007 | Text & Graphics | **Must Have** |
| FR-008 | MP4 Export | **Must Have** |
| FR-009 | Authentication | **Must Have** |
| FR-010 | Project Persistence | **Must Have** |
| FR-011 | Auto-Captions | **Should Have** |
| FR-012 | Keybindings | **Should Have** |
| FR-013 | Cloudflare Deployment | **Must Have** |
| NFR-001 | Privacy / Zero Egress | **Must Have** |
| NFR-002 | Performance | **Must Have** |
| NFR-003 | Reliability | **Must Have** |
| NFR-004 | Browser Compatibility | **Must Have** |
| NFR-005 | Security | **Must Have** |
| NFR-006 | Code Quality | **Should Have** |

**Could Have (deferred):** Real-time collaboration, WebGL2 fallback, mobile native, AI-generated content.  
**Won't Have (this release):** Server-side video processing (architectural invariant).

---

## 5. Acceptance Criteria Coverage Matrix

| FR | User Story | AC Count | Measurable Metric |
|----|-----------|----------|------------------|
| FR-001 | WASM Compositor | 3 scenarios | Frame < 16ms, bundle < 5MB, zero network egress |
| FR-002 | Timeline Editing | 5 scenarios | Response < 100ms, undo depth ≥ 50 |
| FR-003 | Canvas Preview | 3 scenarios | ≥ 30fps, scrub < 100ms |
| FR-004 | Media Ingestion | 3 scenarios | Import < 2s, zero upload |
| FR-005 | Effects Pipeline | 4 scenarios | GPU-only, update < 100ms |
| FR-006 | Mask Compositing | 3 scenarios | < 16ms overhead per layer |
| FR-007 | Text & Graphics | 4 scenarios | Export matches preview |
| FR-008 | MP4 Export | 3 scenarios | ≥ 1× real-time, zero egress, valid container |
| FR-009 | Authentication | 5 scenarios | < 500ms p95, rate-limit ≤ 5 fails |
| FR-010 | Project Persistence | 5 scenarios | Auto-save < 500ms, restore < 1s |
| FR-011 | Auto-Captions | 4 scenarios | ≥ 80% WER, zero egress |
| FR-012 | Keybindings | 4 scenarios | Persist across reload |
| FR-013 | Cloudflare Deployment | 3 scenarios | Cache hit ≥ 95%, auth < 500ms |

---

## Quality Gate Checklist (G1)

| Criterion | Status |
|-----------|--------|
| All in-scope areas have user stories | ✅ FR-001–FR-013 |
| All FRs have ≥ 3 Gherkin acceptance criteria | ✅ |
| All acceptance criteria include measurable metrics | ✅ |
| MoSCoW priorities assigned to all requirements | ✅ |
| NFRs defined with measurable targets | ✅ |
| Open items explicitly listed (OI-001–OI-005) | ✅ (2 resolved, 3 deferred with rationale) |
| Status changed from `draft` to `review` | ✅ |
| Stakeholder interviews documented (G0.1 STANDARD tier req) | ⚠️ DEFERRED (waiver) — OSS implicit validation |
| MAU instrumentation plan confirmed | ⚠️ DEFERRED → G2 (architecture scope) |
| GDPR/HIPAA scope resolved | ✅ RESOLVED — `docs/01-planning/OI-002-privacy-scope.md` |

**G1 PASS requires:** CTO sign-off accepting 3 deferrals (OI-001, OI-003, OI-005) as non-blocking for requirements completeness.

---

*Owner: @pm | Approver: @cpo | Gate: G1 — Requirements Complete*  
*For CTO technical review of acceptance criteria measurability and NFR targets.*
