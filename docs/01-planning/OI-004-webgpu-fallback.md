# OI-004 — WebGPU Fallback Strategy

**Date:** 2026-05-17  
**Owner:** @pm (strategy) / @architect (implementation acceptance)  
**Status:** RESOLVED  

---

## Strategy: Graceful Degradation

### When WebGPU is unavailable (Firefox behind flag, older browsers):

| Feature | Behavior | Status |
|---------|----------|--------|
| Editor UI (timeline, panels) | Fully functional | Works without WebGPU |
| Preview canvas | Disabled with warning message | Documented in FR-001 AC |
| Timeline editing (trim, split, drag) | Fully functional | No GPU needed |
| Effects panel (parameter editing) | Functional (visual preview disabled) | Acceptable degradation |
| Export | CPU fallback path (slower, ≥ 0.5× real-time) | Future sprint |
| Auto-captions | Fully functional (runs on CPU via transformers.js) | No GPU needed |

### User-Facing Warning

```
⚠️ WebGPU is not available in your browser.
Preview rendering is disabled. Timeline editing and export still work.
For full preview, use Chrome 113+, Edge 113+, or Safari 18+.
```

---

## Risk Mitigation (R-01 from Business Case)

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| Chrome/Firefox WebGPU API regression | Low | `opencut-wasm` abstracts via `wgpu` crate — shims browser differences |
| WebGPU never ships in Firefox stable | Medium | Core editing works without GPU preview; export uses CPU path |
| WebGL2 fallback (deferred) | N/A for G1 | Could be added as `opencut-wasm` backend in future release |

---

## Decision

Graceful degradation is the accepted strategy. No WebGL2 fallback required for G1.
FR-001 acceptance criteria already specifies the degraded behavior.
@architect acceptance: pending (strategy documented, awaiting formal ack).
