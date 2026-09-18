# Vejoy Production Management System - Transformations Specification

## Overview

The production board features **5 master tabs** at the top, allowing navigation between different product workflows:

```
┌─────────────────────────────────────────────────────────────────┐
│  [Paneer]  [Halloumi]  [Butter]  [Ghee]  [Crumbing]            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 1. Batch Code System

### Chain Traceability
All products derived from the same milk lot share the same base date code with different prefixes:

| Product | Format | Example |
|---------|--------|---------|
| Milk | `01-DATE` | `01-130926` |
| Cream | `02-DATE` | `02-130926` |
| Butter | `03-DATE` | `03-130926` |
| Ghee | `04-DATE` | `04-130926` |
| Crumbing (SPP/JP/HCP) | `DATE-TYPE-SEQ` | `160626-spp-001` |

### Crumbing Batch Codes
- Format: `DATE-TYPE-SEQ` (e.g., `160626-spp-001`)
- **Sequence restarts** with every new milk lot
- First SPP from lot 160626 = `160626-spp-001`
- Second SPP from same lot = `160626-spp-002`
- New milk lot resets sequence to 001

---

## 2. Universal Features

### +Add Packing Button
- **Location:** Appears on all product tabs (Butter, Ghee, PUBBB, PSBBB, BB05, Paneer)
- **Functionality:** Allows multiple packing sessions per round/batch
- **Behavior:** 
  - First pack: Button shows "Pack"
  - Subsequent packs: Button shows "+Add Packing"
  - Modal displays packing history (all previous sessions)
  - Can pack both SKUs in same round (e.g., Ghee 400g + Ghee 1.5kg)

### Close Production Button
- **Location:** Butter, Ghee, Crumbing tabs
- **Functionality:** Marks production as complete
- **Behavior:** Any remaining quantity is treated as **moisture loss** (implicit tracking)
- **No explicit moisture loss tracking needed**

---

## 3. Tab 1: Paneer

### Status
✅ **Current dashboard - no changes needed**

### Features
- Shift + Round structure
- Vat selection (Vat 2 / Vat 3)
- Timers: Pressing (30min), Cooling (90/120min), Resting (90min)
- Block weight recording (6-8 blocks)
- Cream recovery (C/S rounds only, in buckets, kg)
- PAN111 recording (once per milk lot)
- **+Add Packing button** for multiple packing sessions
- Discard button (owner/supervisor only)

---

## 4. Tab 2: Halloumi

### Workflow (Similar to Paneer)
- **Default milk input:** 240L (changeable)
- Recipe scales proportionally with milk quantity
- Shift + Round structure (like paneer)

### Status Pipeline
```
Scheduled → In Production → Coagulation → Pressing → Cooling → Resting → 
Ready for Cutting → Cut → [Vacuum Pack OR Send to HCP]
```

### Recipe Display (Staged for Workers)
- Recipe visible to workers but **step-by-step**:
  - Step 1: "Add CaCl2" → shows quantity
  - Step 2: "Add Rennet" → shows quantity
  - Step 3: etc.
- Full recipe visible to owners/supervisors

### Discard/Spoilt Button
- **Owner/Supervisor only** (not factory workers)
- Must record:
  - Reason for discard
  - People responsible
- **Also available on Paneer rounds**

---

## 5. Tab 3: Butter

### Cream Source (First Step)

#### Internal Cream
- Select milk lot (from C/S rounds)
- Cream automatically available from that lot
- Used for: Butter for ghee (primarily), occasionally PUB

#### External Cream
- Select cream lot (from "Receive Cream" section)
- Must add **"Receive Cream"** to Milk Receiving page:
  - Date received (becomes lot number in dummy format)
  - Quantity (kg)
  - Invoice number
  - Supplier name
- Used for: Blended products (PUBBB, PSBBB, BB05), occasionally PUB

### Butter Production (Round-based)

**Add Shift** and **Add Round** buttons (like paneer)

**Columns:**
- Round no
- Input quantity (cream, kg)
- Output butter quantity (kg)
- Buttermilk (kg, if any) - tracked as byproduct
- Used in Ghee (auto-subtract when ghee rounds recorded)
- Balance (remaining butter)
- **Pack button** (pack as PUB)

### Blending Process

**After salted/unsalted choice:**

#### Unsalted → PUBBB Pool
- PUBBB = Pasteurised Unsalted Blended Butter (pool, NOT final SKU yet)
- Moisture loss occurs before final packing
- Can be packed as: **PUBBB (butter balls)**
  - Record: packets + loose balls

#### Salted → PSBBB Pool
- PSBBB = Pasteurised Salted Blended Butter (pool, NOT final SKU yet)
- Moisture loss occurs before final packing
- Can be packed as:
  - **(a) PSBBB (butter balls)** — same format as PUBBB
  - **(b) BB05 (butter bricks)** — different format

### Blending Subsection

**Master row with butter lot details** (same structure as cream lot)

**Columns:**
- Shift + Round details
- Butter quantity (default 16.5kg, changeable)
- Butter replacer quantity (default 5kg, **must change in same ratio** as butter)
  - Example: If butter = 33kg → replacer = 10kg (same 16.5/5 ratio = 3.3:1)
- **Salted / Unsalted** button

### PUB Packing Configuration
- Each ball = 500g
- 1 packet = 12 balls (6kg)
- 1 case = 3 packets × 12 balls = 36 balls = 18kg
- **Loose recorded as number of balls** (not packets)

### External Cream Flow
```
Cream Source (from receiving) 
  ↓
Shift + Round details
  ↓
Input quantity
  ↓
Butter obtained
  ↓
Pack as PUB OR Send to Blending
```

---

## 6. Tab 4: Ghee

### Structure
- **Add Shift** + **Add Round** (like paneer/butter)
- Draw butter from same lot
- Each round packed into **2 SKUs**:
  - **Ghee 400g**: 27 buckets × 400g = 10.8kg per case
  - **Ghee 1.5kg**: 6 buckets × 1.5kg = 9kg per case

### Recipe
- **Fixed recipe auto-displayed:**
  - 92.5 kg pure butter + 12.5 kg AF oil = 105 kg total
  - ~70% yield → ~73.5 kg ghee
- **AF oil auto-adjusts** when butter input changes (maintaining ratio)
  - Example: If input is 46.25 kg butter → AF oil = 6.25 kg (same 92.5/7.5 ratio)
- **Recipe is editable** (changes allowed)

### Auto-Subtraction
- When ghee round is recorded, automatically subtract from butter balance
- Show which butter lot was used

### Close Production
- Close production button available
- Remaining quantity = moisture loss (implicit)

---

## 7. Tab 5: Crumbing

### SPP / JP / HCP Tracking
- **Own batch IDs** (SPP-001, JP-001, HCP-001)
- **Draw from:**
  - Paneer (for SPP)
  - PAN111 gross stock (for JP)
  - Halloumi (for HCP)

### Tray Tracking (Simple Count)
- Trays crumbed (by team)
- Trays fried
- Trays remaining
- Fried trays packed

### SPP (Spicy Paneer Poppers)
**Input:** Cut Rozana paneer (from C/S round, cut as "SPP pieces")
- ~64-78 kg input (roughly one Rozana round)

**Process:**
1. Cut paneer (already done on production board)
2. **Crumbing:** 800g Iyababa spice + 200g Predust + wet coating (Iyababa + water) + Adajio roasted breadcrumbs
3. **Freeze**
4. **Flash fry:** ~185°C, ~20 seconds
5. **Freeze again**
6. **Pack**

**Quality:** 8 pieces should weigh 150-180g (target 165g)

**Output:** ~75kg batch → ~450 packets → 37 cases + 6 loose
- Pack: 8 pieces/packet, 12 packets/case
- Rejected poppers = **waste** (not reworked)

### JP (Jalapeño Poppers)
**Inputs:**
- Raw jalapeños: 5 kg buckets, 12 buckets = ~60 kg → 1,200-1,400 pieces
- Cream-cheese filling: **20 kg PAN111** + 1 L fresh cream + 220 g salt + 22 g black pepper

**Process:**
1. Fill jalapeños with cream-cheese filling
2. Freeze
3. Crumb/coat
4. Freeze
5. Flash fry (~185°C, ~20 sec)
6. Freeze
7. Pack

**Output:** ~220 packets → 18 cases + 4 loose
**Pack:** 6 pieces/packet, 12 packets/case

### HCP (Halloumi Poppers)
**Input:** Cut halloumi (~45-60 kg from ~2 halloumi rounds)

**Process:**
1. Cut halloumi
2. **Crumbing stage:** Predust → Batter mix + water → Adajio coating (all in one stage)
3. Freeze
4. Flash fry
5. Freeze
6. Pack

**Quality:** 8 pieces ~120-140g
**Pack:** 8 pieces/packet, 12 packets/case
**Rejected** = waste

---

## 8. Milk Receiving Page Enhancement

### Add "Receive Cream" Section
- Date received (auto-generates lot number)
- Quantity (kg)
- Invoice number
- Supplier name
- Source: External

---

## 9. User Roles

### Recipe Access
- **Owners/Supervisors:** See full recipes
- **Factory Workers:** See "Follow Recipe #123" (staged display for halloumi)

### Discard Button
- **Owners/Supervisors only**
- Not visible to factory workers
- Must record reason and people responsible

---

## 10. Implementation Order

### Phase 1: Foundation
1. ✅ Batch code system (prefix-date format)
2. ✅ Cream receiving (add to Milk Receiving page)
3. ✅ "+Add Packing" button component (reusable)
4. ✅ "Close Production" button component

### Phase 2: Butter Tab
5. ✅ Butter tab with cream source selection
6. ✅ Butter rounds (shift/round structure)
7. ✅ PUBBB/PSBBB pools with packing
8. ✅ Blending subsection (butter + replacer + salt option)
9. ✅ Multiple packing sessions for all butter products

### Phase 3: Ghee Tab
10. ✅ Ghee tab with shift/round structure
11. ✅ Auto AF oil calculation (ratio-based)
12. ✅ Dual SKU packing (400g + 1.5kg)
13. ✅ Auto-subtract from butter balance
14. ✅ Close production (remaining = moisture loss)

### Phase 4: Halloumi Tab
15. ✅ Halloumi tab (similar to paneer)
16. ✅ Staged recipe display for workers
17. ✅ Discard button (owner/supervisor only)
18. ✅ Add discard to paneer as well

### Phase 5: Crumbing Tab
19. ✅ Crumbing tab with SPP/JP/HCP sections
20. ✅ Tray tracking (simple count)
21. ✅ Draw from paneer/PAN111/halloumi
22. ✅ Batch codes with date-type-sequence

### Phase 6: User Roles
23. ✅ User role system (Owner/Supervisor/Worker)
24. ✅ Recipe access control
25. ✅ Discard button visibility

---

## 11. Key Business Rules

1. **Paneer production ends at "Ready for Cutting"** — after that, it's just cutting and packing
2. **Cream is only from C/S rounds** — recorded in kg (bucket weights)
3. **PAN111 is once per milk lot** — recorded by supervisor after all production complete
4. **Block weights are individual** — 6-8 blocks, each weighed separately
5. **Cooling location choice prevents mixing** — tank vs chiller based on parallel production
6. **Clingwrap is temporary** — must return to cutting before packing
7. **Fresh paneer skips freezing** — but not cooling/resting
8. **Multiple SKUs per round** — can pack same round into different SKUs over time
9. **FIFO is a warning, not enforcement** — staff should follow but system allows override
10. **No wastage at cutting** — PAN111 is not waste, it's intermediate
11. **Buttermilk is a byproduct** — sometimes discarded, sometimes used for paneer
12. **Blending ratio stays same** — always 16.5kg butter : 5kg replacer (3.3:1)
13. **PUB packing** — 500g ball, 12 balls/packet, 36 balls/case (18kg), loose = number of balls
14. **Moisture loss is implicit** — close production button, remaining = moisture loss
15. **Tray count only** — no pieces per tray tracking for crumbing

---

## 12. Data Model Extensions

### Production Round Fields (Existing)
- `vat`: 'vat2' | 'vat3'
- `pressingStartedAt`, `coolingStartedAt`, `restingStartedAt`: timestamps
- `coolingLocation`: 'tank' | 'chiller'
- `cutBy`, `cuttingType`: strings
- `numberOfBlocks`: number
- `blockWeights`: number[]
- `creamRecovered`: number (kg)
- `creamRecoveredAt`, `creamRecoveredBy`: strings
- `packedSkus`: Array<{sku, cases, loose}>

### New Fields Needed
- `batchCode`: string (prefix-date format)
- `creamSource`: 'internal' | 'external'
- `creamLotId`: string (reference to cream lot)
- `butterOutput`: number (kg)
- `buttermilkOutput`: number (kg)
- `usedInGhee`: number (kg)
- `remainingBalance`: number (kg)
- `isClosed`: boolean
- `discardReason`: string (optional)
- `discardResponsible`: string (optional)

### Cream Lot Model
```typescript
interface CreamLot {
  id: string;
  lotCode: string; // 02-DATE
  dateReceived: string;
  quantity: number; // kg
  invoiceNumber?: string;
  supplier?: string; // for external cream
  source: 'internal' | 'external';
  milkLotId?: string; // for internal cream
  consumed: number; // kg
  remaining: number; // kg
}
```

### Butter Round Model
```typescript
interface ButterRound {
  id: string;
  batchCode: string; // 03-DATE
  creamLotId: string;
  shiftNumber: number;
  roundNumber: number;
  inputQuantity: number; // kg cream
  butterOutput: number; // kg
  buttermilkOutput: number; // kg
  usedInGhee: number; // kg
  remainingBalance: number; // kg
  isClosed: boolean;
  packedAsPub?: Array<{balls: number}>;
}
```

### Blending Round Model
```typescript
interface BlendingRound {
  id: string;
  butterLotId: string;
  shiftNumber: number;
  roundNumber: number;
  butterQuantity: number; // kg
  replacerQuantity: number; // kg (auto-calculated)
  isSalted: boolean;
  outputPool: 'PUBBB' | 'PSBBB';
  packedSessions?: Array<{
    sku: 'PUBBB' | 'PSBBB' | 'BB05';
    balls?: number;
    bricks?: number;
  }>;
}
```

### Ghee Round Model
```typescript
interface GheeRound {
  id: string;
  batchCode: string; // 04-DATE
  butterLotId: string;
  shiftNumber: number;
  roundNumber: number;
  butterInput: number; // kg
  afOilInput: number; // kg (auto-calculated)
  gheeOutput: number; // kg
  packedSessions?: Array<{
    sku: 'GHEE-400' | 'GHEE-1500';
    cases: number;
    loose: number;
  }>;
  isClosed: boolean;
}
```

### Crumbing Batch Model
```typescript
interface CrumbingBatch {
  id: string;
  batchCode: string; // DATE-spp-001
  type: 'SPP' | 'JP' | 'HCP';
  sourceRoundId: string; // paneer/halloumi round or PAN111 lot
  traysCrumbed: number;
  traysFried: number;
  traysRemaining: number;
  traysPacked: number;
  team: string[];
  packedSessions?: Array<{
    cases: number;
    loose: number;
  }>;
}
```

---

## 13. Testing Checklist

Before deploying transformations, verify:

- [ ] Batch codes generate correctly with prefixes
- [ ] Cream receiving works for external cream
- [ ] +Add Packing button shows history
- [ ] Multiple packing sessions work for all products
- [ ] Close production button works
- [ ] Butter tab: cream source selection works
- [ ] Butter tab: PUBBB/PSBBB pools work
- [ ] Butter tab: blending ratio auto-calculates
- [ ] Ghee tab: AF oil auto-adjusts with butter input
- [ ] Ghee tab: dual SKU packing works
- [ ] Ghee tab: auto-subtracts from butter balance
- [ ] Halloumi tab: staged recipe display works
- [ ] Halloumi tab: discard button works (owner/supervisor only)
- [ ] Crumbing tab: tray tracking works
- [ ] Crumbing tab: batch codes restart per milk lot
- [ ] User roles: recipe access control works
- [ ] User roles: discard button visibility works

---

## 14. Future Enhancements

- [ ] Detailed tray tracking (by team, by batch)
- [ ] Moisture loss explicit tracking
- [ ] Additional butter products (PUB, PUBBB, PSBBB, BB05 variations)
- [ ] Recipe versioning
- [ ] Approval workflows
- [ ] Integration with accounting/ERP systems
- [ ] Mobile app for factory workers
- [ ] Barcode/QR code scanning
- [ ] Automated data collection from equipment

---

**Document Version:** 1.0  
**Last Updated:** 2026-06-17  
**Status:** Ready for Implementation
