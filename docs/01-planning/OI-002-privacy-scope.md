# OI-002 — GDPR/HIPAA Applicability Scope

**Date:** 2026-05-17  
**Owner:** @pm  
**Status:** RESOLVED  

---

## Scope Assessment

### Data Stored Server-Side (via `better-auth` + PostgreSQL)

| Data | Classification | Regulatory Implication |
|------|---------------|----------------------|
| Email address | PII (GDPR Art. 4(1)) | GDPR applies |
| Hashed password | PII (derived) | GDPR applies |
| Session token | Pseudonymous identifier | GDPR may apply |
| Project metadata (name, timestamps) | Not PII unless combined with identity | GDPR may apply via linkability |

### Data NOT Stored Server-Side

| Data | Where It Lives | Implication |
|------|---------------|-------------|
| Video files | User's local device only | No GDPR data controller obligation |
| Audio files | User's local device only | No GDPR data controller obligation |
| Project content (clips, keyframes) | IndexedDB (browser local) | No server-side processing |

---

## Conclusions

### GDPR: APPLICABLE (limited scope)

- OpenCut is a **data controller** for user account data (email, session) stored in PostgreSQL.
- Required actions for compliance:
  - Privacy policy documenting data collected + retention period
  - Account deletion endpoint (right to erasure, Art. 17)
  - Data export endpoint (right to portability, Art. 20)
  - Cookie consent for session cookie (ePrivacy Directive)
- **Low risk** classification: minimal PII, no sensitive data categories (Art. 9), no profiling.

### HIPAA: NOT APPLICABLE

- OpenCut does not store, process, or transmit Protected Health Information (PHI).
- Video content (which could contain PHI in healthcare contexts) never leaves the user's device.
- No Business Associate Agreement (BAA) required.
- If a healthcare organization uses OpenCut, their HIPAA obligation is satisfied by the architectural invariant: zero video egress.

---

## Requirement Implications for G1

1. **FR-009 (Auth)** — already specifies zero video bytes in auth flow ✅
2. **NFR-001 (Privacy)** — already requires zero video egress ✅
3. **NEW requirement needed post-G1:** Account deletion + data export API (GDPR Art. 17 + Art. 20) — can be added as FR-014 in a future sprint without blocking G1.

---

## Decision

OI-002 is **RESOLVED** with the finding: GDPR applicable (limited scope, low risk), HIPAA not applicable. No blocking change to G1 requirements needed. Account management APIs (deletion/export) tracked as future enhancement.
