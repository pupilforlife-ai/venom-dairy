# Save performance release — 27 November 2026

Baseline: 71eafd7, preserved as baseline-before-save-performance-20261127.

Scope:
- Ignore repeated committed/realtime versions without extra rendering or synchronous cache writes.
- Retain forced authoritative rollback of rejected optimistic edits, ordered writes, stale-write merging and newest deferred events.
- Avoid no-op whole-document writes when the exact edit is already committed.
- Compact first-success Edge responses by version; return full state on retry/replay and older RPC responses. All six/seven CAS dependencies remain checked and locked.
- Index late-butter history lookups while preserving the same source/history validation decisions and every guard.

Validation: unit suite, real-hook offline lifecycle tests (duplicate notifications, concurrent staff updates, rejected edits, queued saves), rollback-only SQL comparisons, original versus optimized late-butter guard checks, record-based response-size measurements, phone/desktop renderer checks and unchanged historical stock totals. No production test entries are created.

No production record correction, quantity/calculation/layout change or batch-date cutover is included. The separate draft/shift-dates-after-241126 branch remains held per SHIFT_DATE_RELEASE_HOLD.md in that branch; it must not be merged during this release.

Known limit: smaller responses and reduced database/UI work address measured overhead; actual handset end-to-end timing still depends on connection and device state.
