# Isolated paneer test release — 14 November 2026

This branch publishes the paneer browser prototype for testing only. It does not replace the live app and must not be promoted to production.

- Supabase is hard disabled; build environment files are ignored and network connections are blocked by CSP.
- State is browser-only under a separate vejoy_paneer_test:20261114:v1 namespace. Data stays on that device/browser; download a test backup before clearing browser storage.
- Simulated owner permissions apply to test data only. There is no production sign-in, production data copy or backend migration.
- Includes milk receiving/planning, ingredient readiness and numbered bags, automatic paneer trace records, codes, cutting, trays, retention samples, partial packing, mixed cases, inventory/distribution custody and compact phone cards.
- Excludes unfinished recipe/settings/QC work and the later cream/butter/blend/ghee trace developments. Other product pages retain baseline behaviour only.
- Numeric board shifts remain unchanged. Desktop table and phone-card layouts are retained.

Starting code baseline: 101eb286ab21d5c5bdf2cc9a96edd089e978cab7. Recovered from with-compact-phone-cards.tar.gz. 146 tests cover business/storage rules; production authentication, server transactions, concurrency and old-client protections remain pending.

No live app records may be entered here as operational records. For actual production continue using vejoy-dairy.vercel.app.

Review corrections (14 November): assembly sources are unique in the selector and save command; a single source can supply a whole case. Current board/Receiving loose totals subtract active assemblies without rewriting original packing. Shared-lot case contributions stay explicit. Occupied tray options are amber and show their current round. Scramble and PAN111 are the same output: a single audited final lot weighing records any signed lot-only variance and adds only recovery stock not already recorded. Duplicate final saves and stale source changes reject safely. Existing recovery stock is never silently reduced.

All final SKU prefixes already in skuConfig are reused; saved labels and explicit owner overrides remain intact. Assembly histories collapse independently. Test backups can be loaded only into an untouched test seed so test work can move to the stable preview address without overwriting existing entries. No automatic data transfer or browser reset occurs.

Validation: 166 tests / 18 files, typecheck and build. Normal UI QA at 4354: RPAN400 12c26 → 13c2 (314 packets / 125.60 kg), duplicate selector exclusion, board/Receiving agreement, PAN111 3.60 − 0.60 = 3.00 kg saved with actor/time, 360px amber occupied tray picker centred with no lateral overflow. Production source and database unchanged.

15 November tray follow-up: picker considers all unresolved other-round claims, including when editing the latest claimant. Amber cells show “In use”; selecting one adds an enquiry reminder naming the earlier round. Reuse remains permitted. The earlier warning clears when that tray is recorded packed/empty or when the whole earlier round becomes packed/handed over. Full-round completion takes precedence over prior partial tray history; history is retained. Stale partial drafts cannot reclaim trays after full completion. Newer occupants are never released by completion of an earlier round.

170 tests /18files and build/typecheck passed; browser QA4354 reused tray12 in R3, verified only R1 warning, then marked R1 tray12 empty and verified warning cleared while R3 retained12 and R1 retained1/3. No case, milk, weight or packing records changed in this verification. Existing local4338 received the same checked patch and passed200tests/19files,typecheck/build; browser storage namespace/seed unchanged. First immutable previewixv5ryw0y does not receive updates; use the stable test alias or the original same-browser local address.
