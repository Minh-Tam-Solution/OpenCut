---
adr_id: ADR-003
title: "Desktop App WASM Decoupling Strategy"
status: Proposed
tier: STANDARD
stage: "02-design"
owner: "@architect"
created: 2026-05-17
gate: G2
authority:
  proposer: "@architect"
  countersigners: []
  trigger: "OI-005 deferred from G1"
---

# ADR-003: Desktop App WASM Decoupling Strategy

## Status

**Proposed** — pending G2 (Design Approval) countersign by `@cto`.

---

## Context

OI-005 was deferred from G1 with the note: "Architecture scope; desktop shares crate via semver pin (`^0.2.x`)."

OpenCut's repository contains two application shells:

- `apps/web/` — Next.js browser app (primary target for G0.1–G1)
- `apps/desktop/` — GPUI-based desktop app (out-of-scope for G0.1, but planned post-G1)

Both shells depend on the same Rust compositor, but they consume it through different bindings:

| Shell | Binding Mechanism | Runtime |
|-------|------------------|---------|
| `apps/web/` | `wasm-pack` → `wasm-bindgen` → JS import | Browser (WebGPU/WebGL2) |
| `apps/desktop/` | Direct Rust crate dependency (`Cargo.toml`) | Native (wgpu + native GPU backends) |

This creates a versioning problem: the WASM package (`opencut-wasm`) and the native crate dependency must stay compatible, but the web and desktop release cadences may diverge.

Additionally, the Rust workspace contains internal crates that are not part of the public API:

| Crate | Public API? | Stability |
|-------|------------|-----------|
| `rust/crates/compositor/` | ✅ Yes — `Compositor::render_frame()` | Stable |
| `rust/crates/effects/` | ⚠️ Partial — shader names are public | Evolving |
| `rust/crates/masks/` | ⚠️ Partial — `apply_mask_feather()` is public | Evolving |
| `rust/crates/gpu/` | ❌ No — internal abstraction | Internal |
| `rust/crates/time/` | ✅ Yes — shared primitives | Stable |
| `rust/crates/bridge/` | ❌ No — build-time TS generation | Internal |

---

## Decision

### 1. Version Coupling Policy — Semver Pin with Workspace Coherence

The `opencut-wasm` crate and the desktop app use a **single-source versioning model** via Cargo workspace:

```toml
# rust/Cargo.toml (workspace root)
[workspace]
members = ["crates/*", "wasm"]
resolver = "2"

[workspace.package]
version = "0.2.10"
```

All crates in the workspace share the same version. This guarantees that `apps/desktop/` (depending on `compositor = { path = "../../rust/crates/compositor" }`) and `apps/web/` (depending on `opencut-wasm = "0.2.10"`) are always built from the same source revision.

**Policy rules:**

| Rule | Enforcement |
|------|------------|
| R-01 | All crates in `rust/crates/` and `rust/wasm/` share the workspace `version`. |
| R-02 | `apps/desktop/Cargo.toml` pins the compositor crate via `path` (not crates.io). |
| R-03 | `apps/web/package.json` pins `opencut-wasm` via `file:../../rust/wasm/pkg` in dev, and via exact version `"0.2.10"` in production builds. |
| R-04 | The `rust/wasm/pkg/package.json` version is auto-generated from `Cargo.toml` during `wasm-pack build`. |

### 2. Breaking Change Protocol — API Version Bump + Migration Window

The WASM JS API (defined in `rust/wasm/src/*.rs`) is the contract boundary. Breaking changes to this API require a **major or minor version bump** and a **migration window**:

| Change Type | Example | Version Bump | Migration Window |
|-------------|---------|-------------|------------------|
| **Patch** | Bug fix in shader, perf optimization | `0.2.10` → `0.2.11` | None — drop-in replacement |
| **Minor** | New effect shader, new `renderFrame()` option | `0.2.x` → `0.3.0` | 2-week window: both old and new API supported via `@deprecated` shim |
| **Major** | Rename `renderFrame()` → `compositeFrame()`, remove `uploadTexture()` | `0.x` → `1.0.0` | 4-week window + codemod script for web app |

**Breaking change checklist:**

1. Update `rust/Cargo.toml` workspace version.
2. Update `CHANGELOG.md` with migration guide.
3. If minor bump: add JS shim in `apps/web/src/wasm-compat/` mapping old API → new API.
4. If major bump: provide `scripts/migrate-wasm-api.mjs` codemod for consumers.
5. Tag git release: `v0.3.0`.
6. Publish `opencut-wasm` to npm registry (if public) or update internal registry.
7. Update `apps/web/package.json` and `apps/desktop/Cargo.toml` to new version.

### 3. Shared Crates — Stable vs Internal API Boundaries

We divide the Rust workspace into **public crates** (stable API, SemVer guarantees) and **internal crates** (free to refactor):

```
rust/
  crates/
    compositor/     ← PUBLIC (stable API: render_frame, upload_texture, release_texture)
    effects/        ← PUBLIC (stable API: apply() with EffectPass; shader names are public)
    masks/          ← PUBLIC (stable API: apply_mask_feather)
    time/           ← PUBLIC (stable API: Timestamp, Duration)
    gpu/            ← INTERNAL (wgpu abstraction; may change backends)
    bridge/         ← INTERNAL (build-time TS generation)
  wasm/
    src/
      wasm.rs       ← PUBLIC (wasm_bindgen exports)
      compositor.rs ← PUBLIC (JS API: initCompositor, renderFrame, ...)
      effects.rs    ← PUBLIC (JS API: applyEffectPasses)
      masks.rs      ← PUBLIC (JS API: applyMaskFeather)
      perf.rs       ← INTERNAL (may add/remove markers)
      gpu.rs        ← INTERNAL
```

**Policy:**
- Public crates require `@architect` + `@cto` review for any API change.
- Internal crates require only `@architect` review.
- The `gpu/` crate may be replaced (e.g., with `gfx-hal`) without a major version bump because it is internal.

### 4. Release Cadence — Web Leads, Desktop Follows

| Product | Release Trigger | Lag |
|---------|----------------|-----|
| Web (`apps/web/`) | Every merged PR to `main` (continuous) | N/A |
| WASM (`rust/wasm/`) | Every Rust PR that changes public API | Published with web |
| Desktop (`apps/desktop/`) | Monthly snapshot of `main` | ~2–4 weeks behind web |

**Rationale:**
- The web app is the primary delivery target and must iterate quickly.
- The desktop app is a secondary surface. A monthly snapshot gives the desktop team time to validate native GPU backends (Metal, DX12, Vulkan) against the same compositor version.
- If a critical compositor bug is fixed, the desktop team can cherry-pick the patch release (`0.2.11`) without waiting for the monthly snapshot.

### 5. CI Implications — Separate Build Matrices

The CI pipeline must build and test both shells independently:

```yaml
# .github/workflows/ci.yml (conceptual)
jobs:
  web:
    runs-on: ubuntu-latest
    steps:
      - build:wasm
      - build:web
      - test:web
      - e2e:zero-egress

  desktop:
    runs-on: ${{ matrix.os }} # macos-latest, ubuntu-latest, windows-latest
    steps:
      - build:desktop
      - test:desktop
```

**Policy:**
- A failing `web` build blocks merge to `main`.
- A failing `desktop` build does **not** block merge, but notifies `@desktop-lead` via Slack/Discord.
- The `desktop` job runs only when `rust/crates/**` or `apps/desktop/**` changes (path filter).

---

## Consequences

### Positive

- **Single source of truth:** The workspace version guarantees that web and desktop run the same compositor logic. No drift between JS bindings and native crate.
- **Clear API boundaries:** Public vs internal crate distinction makes refactoring safe. The `gpu/` crate can evolve without fear of breaking consumers.
- **Predictable release rhythm:** Web continuous delivery + desktop monthly snapshots balance iteration speed with QA rigor.
- **No git submodules:** Using Cargo `path` dependencies and npm `file:` links eliminates submodule complexity. The entire repo is always self-consistent at any commit.

### Negative / Risks

- **Desktop lag:** A 2–4 week lag means desktop users may not receive urgent compositor fixes immediately. Mitigation: cherry-pick patch releases.
- **WASM bundle size regressions:** Desktop does not pay the WASM bundle size penalty (it uses native crates), but changes to the compositor crate may increase WASM size indirectly. CI must track WASM bundle size on every PR.
- **Platform-specific GPU bugs:** `wgpu` abstracts Metal/DX12/Vulkan/WebGPU, but backend-specific bugs exist. The desktop build matrix (macOS, Linux, Windows) is required to catch these.

---

## Alternatives Considered

### Alternative A — Independent Versioning (web vs desktop crates)

`rust/crates/compositor/` versions independently of `rust/wasm/`.

**Rejected:**
- Creates risk of API drift. The desktop app could depend on `compositor 0.3.0` while the web app uses `opencut-wasm 0.2.10` built from `compositor 0.2.8`.
- Requires manual compatibility matrices (`compositor 0.3.x` works with `wasm 0.2.y` …).
- Adds cognitive overhead for every Rust PR: "Do I need to bump compositor, effects, masks, or wasm?"

### Alternative B — Git Submodule for WASM

The `rust/wasm/` crate lives in a separate repo, included as a git submodule.

**Rejected:**
- Git submodules are error-prone for contributors. A forgotten `git submodule update` breaks the build.
- The web app and compositor are tightly coupled. Coordinated PRs (e.g., adding a new effect requires JS + Rust changes) become painful across repo boundaries.
- Monorepo is the established pattern for this project (`apps/web/`, `apps/desktop/`, `rust/`).

### Alternative C — Desktop Consumes WASM via Native Runtime (Wasmer, Wasmtime)

Instead of native crate dependency, the desktop app embeds a WASM runtime and loads the same `.wasm` file as the browser.

**Rejected:**
- Adds a runtime dependency (Wasmer/Wasmtime) and complicates the desktop build.
- Native crate linking delivers better performance (no WASM boundary crossing, no JS engine overhead).
- The desktop app is explicitly built in Rust (GPUI), so native crate consumption is idiomatic.

---

## Implementation Checklist

- [ ] Document public API surface in `rust/crates/compositor/src/lib.rs` doc comments
- [ ] Add `CHANGELOG.md` to `rust/` workspace root
- [ ] Configure CI: separate `web` and `desktop` build matrices
- [ ] Add CI check: WASM bundle size regression gate (< 5 MB gzipped)
- [ ] Add CI check: `wasm-pack build` must succeed on every PR touching `rust/`
- [ ] Document `@deprecated` shim policy in `CONTRIBUTING.md`
- [ ] Create `scripts/migrate-wasm-api.mjs` template (to be populated when first major bump occurs)

---

## References

- [Requirements](../../01-planning/requirements.md) — OI-005 (deferred from G1), Out-of-Scope table (desktop is post-G1)
- [ADR-001](./ADR-001-initial-architecture.md) — Layer 2 compositor description, desktop app rationale
- [Architecture Design](../architecture-design.md) — FR-001 module mapping, WASM API contract
- Cargo workspaces: https://doc.rust-lang.org/cargo/reference/workspaces.html
- wasm-pack: https://rustwasm.github.io/wasm-pack/
