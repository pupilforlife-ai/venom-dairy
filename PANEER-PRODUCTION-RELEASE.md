# Paneer traceability production release — 15 November 2026

Baseline: 101eb286ab21d5c5bdf2cc9a96edd089e978cab7. Source: approved paneer test 91779f24a27887b354db5462d6bdaf605c18553d, integrated separately with production authentication, Supabase transport, bootstrap, update mechanism and deployment settings retained. Unfinished main-checkout recipe files, browser-only QC and later butter/blend/ghee work are excluded.

The release adds Receiving/Planning, ingredient forecasts/checklist and numbered bags, automatic recipe-based paneer source capture, approved packet/case prefixes, cutting/cloth/trays/scramble/samples, partial tray packing, mixed-case assembly and custody, final lot PAN111 reconciliation and the traceability register. Existing board shift names stay numeric. Familiar mobile cards and desktop table remain; core fields and packing labels are directly visible.

The authenticated paneer-traceability Edge handler uses the same tested domain functions as the preview. It verifies the real user/session and approved profile; actor/time are server supplied. A service-only RPC compares the versions of six collections under short, ordered locks and commits the complete transition and retry receipt together. Client-side role values and computed collection replacements cannot bypass the Edge boundary. Paneer start/cutting/cream forms retain their source snapshot; unknown-response retries retain their original command ID/body. Ordinary packing retains its existing atomic SQL implementation, wrapped to persist and return labels on both source and stock.

The additive migration creates a restricted command/audit receipt table and functions/guards. It never seeds, restores, deletes or rebuilds operational data. Existing safety/audit triggers remain enabled. Older snapshots cannot erase trace metadata or overwrite mixed-case allocations. Old clients must refresh before moving mixed-case stock. No historical ingredient bag links, labels or cutting measurements are invented. Existing PAN111 totals remain displayed when the new cutting measurements are absent.

Verification: full frontend/type build; 419 source tests, including new authenticated-command and mixed-case handover/return conservation tests. SQL tests use synthetic TEMP tables and copies of the actual guard chain, then ROLLBACK. They verify role access, audit identity, atomic errors, stale versions, idempotent packing, packet/case/stock labels, old-client metadata preservation and unrelated-round isolation. A separate read-only comparison of the restricted snapshot confirms unchanged historical projections for 281 rounds,223 stock records,4 milk lots. Production remains disconnected from all browser-only test data.

Operational setup: for the next milk lot, enter start-of-production date and prepare the Ingredient checklist before selecting the first vat. Existing rounds without those source records remain explicitly incomplete. Do not copy fictional preview data into production.

Code rollback: return the frontend to the baseline commit if required. Preserve all newer production records, trace metadata, command receipts and audit history; never restore an old collection over subsequent staff work. Review the additive backend separately rather than dropping source history.


18 November hotfix: the original `commit_paneer_traceability` saved existing
collections with `INSERT ... ON CONFLICT DO UPDATE`. PostgreSQL runs BEFORE
INSERT guards before resolving that conflict, so unchanged historical butter
settlement/loss receipts were evaluated without an OLD row. The butter guard
correctly rejected the apparent new history and blocked an unrelated paneer
vat start. The new function uses UPDATE for existing version-checked, locked
collections and INSERT only when the collection is absent. No guard is disabled
or relaxed, and this definitions-only migration changes no operational rows.

The regression fails with the former function with the user's exact
late-butter error. With the fix, the same vat start succeeds, leaves both
historical butter records and other collections identical, writes once, and
replays without a second write. Attempts to edit either historical settlement
or loss receipts still fail. Test artifacts remain inside this project folder.
