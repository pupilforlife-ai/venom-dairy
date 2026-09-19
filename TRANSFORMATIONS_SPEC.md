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

### Status
✅ **Implemented with correct halloumi-specific workflow**

### Workflow (Distinct from Paneer)
- **Default milk input:** 240L (fixed for halloumi)
- **Inline recipe display** at each stage (not separate modal)
- Shift + Round structure

### Status Pipeline
```
Scheduled → Add CaCl2 → Heat to 34°C → Add Rennet → 
Curd Setting (30min) → Curd Cut → Heating to 42°C (40min) → 
Presses → Whey Heating to 90°C → Halloumi Boiling → 
Salted → Chiller Storage (4-6hr) → Weighed → 
[Vacuum Pack OR Send to HCP] → Handed Over
```

### Stage-by-Stage Recipe Display
Each stage shows specific recipe details inline:

1. **Add CaCl2 Solution**: 192g CaCl2 in 3.8L water
2. **Heat to 34°C**: Monitor temperature carefully
3. **Add Rennet**: 15ml rennet in 500ml water
4. **Curd Setting** ⏱️: 30-minute timer, do not disturb
5. **Curd Cut**: Quick action, cut curd into pieces
6. **Heating to 42°C** ⏱️: 40-minute timer, slowly heat while lifting curd to separate whey
7. **Presses**: Press until firm
8. **Whey Heating to 90°C**: Heat whey in vessel
9. **Halloumi Boiling**: Cook in hot whey until floating
10. **Salted**: Remove from whey, cool and salt
11. **Chiller Storage**: Hold for 4-6 hours
12. **Weighed**: Record final weight (expected 24-28 kg)
13. **Final Decision**: Vacuum Pack OR Send to HCP

### Timer Durations
- **Curd Setting:** 30 minutes (let curd set)
- **Heating to 42°C:** 40 minutes (slowly heat while lifting curd to separate whey)
- **Chiller Storage:** 4-6 hours (manual, no timer)

### Key Features
- ✅ Inline recipe display at each stage
- ✅ Timers for curd setting (30min) and heating to 42°C (40min)
- ✅ Temperature targets shown (34°C, 42°C, 90°C)
- ✅ Weight recording modal with expected yield
- ✅ Vacuum pack / Send to HCP options
- ✅ Halloumi-specific status pipeline (16 stages)

---

## 5. Tab 3: Butter

### Status
✅ **Implemented with complete workflow**

### Key Distinction
- **Churning** = Cream → Butter (physical process)
- **Blending** = Butter + Replacer → PUBBB/PSBBB (mixing process)
- These are **separate stages** with different purposes

### Cream Source (First Step)

#### Internal Cream
- Select from C/S rounds with recovered cream
- Shows: Milk lot code, cream quantity (kg), date recovered
- After churning: **3 options** - Send to Ghee / Pack as PUBB / Send to Blending

#### External Cream
- Select from cream lots (purchased via "Receive Cream" section)
- Shows: Cream lot code, quantity (kg), date received, supplier, invoice #
- After churning: **Must go to blending** (no other options)

### Internal Cream Workflow
```
CREAM (from C/S rounds)
  ↓
CHURNING
  ↓
BUTTER
  ↓
  ├─→ BUTTER FOR GHEE → [Ghee Tab]
  ├─→ PACK AS PUBB → Final SKU: PUBB
  └─→ SEND TO BLENDING
        ↓
      BLENDING (butter + replacer, 3.3:1 ratio)
        ↓
        ├─→ PUBBB (unsalted) → PACK AS FINAL SKU
        └─→ PSBBB (salted)
              ↓
              ├─→ PACK AS FINAL SKU
              └─→ MAKE BRICKS → BB05
```

### External Cream Workflow
```
CREAM (purchased)
  ↓
CHURNING
  ↓
BUTTER
  ↓
BLENDING (ALWAYS - no direct packing)
  ↓
PUBBB (unsalted)
  ↓
  ├─→ PACK AS FINAL SKU
  └─→ ADD SALT → PSBBB
        ↓
        ├─→ PACK AS FINAL SKU
        └─→ MAKE BRICKS → BB05
```

### Status Pipeline

**Internal Cream (11 stages):**
1. Scheduled
2. Churning
3. Churned (Butter)
4. Sent to Ghee / Packed as PUBB / Blending
5. Blending (if sent to blending)
6. PUBBB Pool / PSBBB Pool
7. Pack as PSBBB / Make Bricks (if PSBBB)
8. BB05 Pool (if bricks)
9. Packed
10. Handed Over

**External Cream (10 stages):**
1. Scheduled
2. Churning
3. Churned (Butter)
4. Blending (mandatory)
5. PUBBB Pool
6. Pack as PUBBB / Add Salt
7. PSBBB Pool (if salted)
8. Pack as PSBBB / Make Bricks
9. BB05 Pool (if bricks)
10. Packed
11. Handed Over

### Blending Process
- **Ratio**: 3.3:1 (Butter : Replacer)
- **Default**: 16.5 kg butter + 5 kg replacer
- **Auto-calculation**: Change butter quantity → replacer auto-adjusts
- **Salt option**: Unsalted (PUBBB) or Salted (PSBBB)

### Packing Configurations

**PUBB/PUBBB/PSBBB (Balls):**
- Each ball = 500g
- 12 balls/packet
- 3 packets/case
- 36 balls = 18 kg/case
- Loose = number of balls

**BB05 (Bricks):**
- Each brick = 500g
- 30 bricks/case = 15 kg/case
- Loose = number of bricks

### Batch Codes
- **Butter**: `03-DATE` (e.g., `03-160626`)
- **Cream (external)**: `02-DATE` (e.g., `02-160626`)

### Data Model
**Added to ProductionRound:**
- `creamSource`: 'internal' | 'external'
- `creamLotId`: string
- `butterOutput`: number (kg)
- `buttermilkOutput`: number (kg)
- `destination`: 'ghee' | 'pubb' | 'blending'
- `isSalted`: boolean
- `replacerQuantity`: number (kg)
- `pool`: 'PUBB' | 'PUBBB' | 'PSBBB' | 'BB05'
- `usedInGhee`: number (kg)

**Added CreamLot interface:**
- `lotCode`: string (02-DATE)
- `dateReceived`: string
- `quantity`: number (kg)
- `invoiceNo`: string
- `supplier`: string
- `consumed`: number (kg)
- `remaining`: number (kg)

### Key Features
- ✅ Cream source selection (internal/external)
- ✅ Shift + Round structure
- ✅ Churning process with output recording (butter + buttermilk)
- ✅ Three-path decision for internal cream (Ghee/PUBB/Blending)
- ✅ Mandatory blending for external cream
- ✅ Auto-calculated blending ratio (3.3:1)
- ✅ Salt/unsalt toggle for blending
- ✅ Packing for all SKUs (PUBB, PUBBB, PSBBB, BB05)
- ✅ +Add Packing button for multiple sessions
- ✅ Batch codes (03-DATE)
- ✅ Data model updated with butter-specific fields

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
