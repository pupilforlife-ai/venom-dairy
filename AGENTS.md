# Production data safety

This app is used during active factory production. Preserve existing records.

- Keep a known-good code baseline before publishing operational/accounting changes. Do not include unrelated dirty files, unfinished recipe work or local QC previews.
- A UI/code request does not authorize deleting or rewriting live production records. Obtain clear scope for any data correction. Inspect exact IDs, dependencies, active staff entries and mixed-source allocations first.
- Before an authorized data correction or data-changing migration, save restricted recovery snapshots. Use short atomic transactions, latest committed data, exact targets and assertions that abort on unexpected new records. Never restore a whole old collection over newer production work.
- Treat recorded rounds, packing entries, HCP allocations and audited movements as source records. Shared snapshot counters must be reconciled against them, not trusted as independent facts. Preserve historical adjustments explicitly rather than silently inventing or discarding quantities.
- Database guards must also protect against older open clients. Never disable existing safety/audit triggers or reset operational tables to make a change succeed.
- Test arithmetic, old/new data compatibility, retries, stale writes, returns, transfers, overdraws and lot isolation. Compare before/after record counts and verify that unrelated source records are unchanged.
- Do not apply unrelated pending migrations. Test the exact committed release separately from unfinished local work. After an approved push, verify deployment and live read-only behavior before asking the user to test.
- Keep the local QC preview browser-only and disconnected from production until its separate rollout is explicitly approved.
