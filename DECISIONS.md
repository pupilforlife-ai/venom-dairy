# Vejoy Production Management System — Key Decisions & Corrections

**Document:** `DECISIONS.md`  
**Purpose:** Captures all factory-specific decisions, corrections, and context from development sessions. Ensures continuity when switching between development environments (e.g., from web-based assistant to Codex).  
**Last Updated:** 2026-06-17 (Halloumi Tab Added)

---

## 1. Paneer Production Workflow

### Complete Status Pipeline
```
Scheduled → In Production → Coagulation → Pressing (30min) → 
Cooling (tank 90min / chiller 120min) → Resting (90min) → 
Ready for Cutting → Cut → [Clingwrapped] → [Frozen] → Packed → Handed Over
```

### Critical Workflow Details

#### Vat Selection (In Production Stage)
- **3 vats total:** Vat 1 (holding tank), Vat 2, Vat 3
- Vat 2 and Vat 3 are connected to boilers for heating milk
- Each vat has a designated coagulation tank
- Staff selects **Vat 2 or Vat 3** when starting production
- **Timer does NOT start at vat selection** — pressing timer starts only when moving to "Pressing" status

#### Coagulation Stage
- Milk is poured from Vat 2/3 into designated coagulation tank
- Coagulation happens (no timer required)
- This is a **separate status** between "In Production" and "Pressing"

#### Pressing Stage
- **30-minute timer** starts when moving to "Pressing" status
- Paneer is pressed in presses
- Timer must complete before moving to cooling

#### Cooling Stage
- Staff chooses between:
  - **Cooling Tank** → 1 hour 30 min timer
  - **Chiller** → 2 hour timer
- Choice is based on **avoiding mixing** when producing simultaneously in Vat 2 and Vat 3
- When one round is in cooling tank, next round goes to chiller

#### Resting Stage
- **1 hour 30 min timer**
- After resting completes, paneer is ready for cutting

#### Cutting Stage
- **Output weight is recorded ONLY at cutting** (not before)
- Staff records:
  - **Cut by** (worker name)
  - **Cut type:** SPP pieces, 400g blocks, 200g format, 1kg blocks, or fresh blocks
  - **Number of blocks** (typically 6-8 blocks for 500L input)
  - **Individual weight of each block** (e.g., 7 blocks = 7 separate weights)
  - **Total output = sum of all block weights**
- **NO wastage or PAN111 recorded at this stage**

#### SPP Pieces Cut Type
- Specific size: 8 pieces should weigh 150-180g
- Physical process, left to supervisor's discretion
- When cut type is "SPP pieces", we track the cut weight (this is what gets crumbed and fried later)

#### Clingwrap (Optional)
- Can ONLY happen **after "Ready for Cutting"** status
- Used when can't cut fast enough — clingwrap and store in chiller to preserve
- Stays in "Clingwrapped" status until ready for final cutting
- **NOT a final status** — must return to cutting before packing

#### Frozen (Optional)
- Freezing is **optional** — not mandatory
- Factory has other checks and balances to ensure freezing
- Can freeze from "Cut" or "Clingwrapped" status

#### Packing Stage
- Staff records:
  - **SKU** (e.g., MPAN400, RPAN200, SPP-200) — **NOT auto-selected**
  - **Cases** packed
  - **Loose packets**
- A single round can be packed into **multiple SKUs over time**
- Each packing event reduces the remaining balance of that round

#### Fresh Paneer (MPAN010/RPAN010)
- These are **exceptions that skip freezing**
- Sold fresh with shorter shelf life
- Cooling and resting are **integrated parts** of paneer production (not skipped)
- When ready to cut, cutter cuts into **blocks** (not cubes)
- Blocks are vacuum packed and packed as:
  - 20 kg cases (50 packets)
  - Can also be sold in 10 kg or 5 kg iterations
- Recorded as **packets and weight** (not cases/loose like regular paneer)

---

## 1B. Halloumi Production Workflow

### Complete Status Pipeline
```
Scheduled → Add CaCl2 → Heat to 34°C → Add Rennet → 
Curd Setting (30min) → Curd Cut → Heating to 42°C (40min) → 
Presses → Whey Heating to 90°C → Halloumi Boiling → 
Salted → Chiller Storage (4-6hr) → Weighed → 
[Vacuum Pack OR Send to HCP] → Handed Over
```

### Halloumi-Specific Process (Distinct from Paneer)

#### Default Input
- **240L milk** (fixed for halloumi rounds)
- Automatically set when round is created

#### Stage-by-Stage Recipe Display
Each stage shows specific recipe details inline:

1. **Add CaCl2 Solution**
   - 192g CaCl2 in 3.8L water
   - Add to milk and stir gently

2. **Heat to 34°C**
   - Heat milk slowly to 34°C
   - Monitor temperature carefully

3. **Add Rennet**
   - 15ml rennet in 500ml water
   - Add to milk and stir gently

4. **Curd Setting** ⏱️
   - **30-minute timer**
   - Let curd set, do not disturb

5. **Curd Cut**
   - Cut curd into pieces
   - Quick action, no timer

6. **Heating to 42°C** ⏱️
   - **40-minute timer**
   - Heat slowly to 42°C over 40 minutes
   - Gently lift curd while heating
   - This separates whey from curd

7. **Presses**
   - Remove curd into presses
   - Press until firm

8. **Whey Heating to 90°C**
   - Whey remains in vessel
   - Heat whey to 90°C

9. **Halloumi Boiling**
   - Cut pressed halloumi to smaller pieces
   - Cook in hot whey until floating
   - Monitor until pieces float

10. **Salted**
    - Remove from whey
    - Cool and salt

11. **Chiller Storage**
    - Store in chiller
    - Hold for 4-6 hours

12. **Weighed**
    - Weigh final product
    - Record output weight
    - Expected yield: 24-28 kg from 240L milk

13. **Final Decision**
    - **Vacuum Pack** — for direct sale
    - **Send to HCP** — for Halloumi Cheese Poppers (crumbing tab)

### Key Differences from Paneer

| Feature | Paneer | Halloumi |
|---------|--------|----------|
| Default input | 500L | 240L (fixed) |
| Vat selection | Vat 2 or Vat 3 | Not applicable |
| CaCl2/Rennet | Not used | Used (specific quantities) |
| Timers | Pressing 30min, Cooling 90/120min, Resting 90min | Curd Setting 30min, Curd Cutting 40min |
| Cooling choice | Tank or Chiller | Not applicable |
| Unique step | — | Cooking in hot whey until floating |
| After processing | Clingwrap/Freeze/Pack | Vacuum Pack or Send to HCP |
| Cream recovery | Yes (C/S rounds only) | No |
| PAN111 | Yes (once per milk lot) | No |
| Recipe display | Not inline | Inline at each stage |

### Timer Durations
- **Curd Setting:** 30 minutes (let curd set)
- **Heating to 42°C:** 40 minutes (slowly heat while lifting curd to separate whey)
- **Chiller Storage:** 4-6 hours (manual, no timer)

### Implementation Status
- ✅ Halloumi tab created with correct workflow
- ✅ Shift and round management (240L default)
- ✅ Correct status pipeline (16 stages)
- ✅ Inline recipe display at each stage
- ✅ Timers for curd setting (30min) and heating to 42°C (40min)
- ✅ Temperature targets shown (34°C, 42°C, 90°C)
- ✅ Weight recording modal with expected yield
- ✅ Vacuum pack / Send to HCP options
- ✅ Data model updated to support halloumi-specific timestamps

---

## 1C. Butter Production Workflow

### Key Distinction
- **Churning** = Cream → Butter (physical process)
- **Blending** = Butter + Replacer → PUBBB/PSBBB (mixing process)
- These are **separate stages** with different purposes

### Internal Cream Workflow
```
CREAM (from C/S rounds)
  ↓
CHURNING
  ↓
BUTTER
  ↓
  ├─→ BUTTER FOR GHEE → [Ghee Tab]
  ├─→ PACK AS PUBB → Final SKU: PUBB (pasteurised unsalted butter balls)
  └─→ SEND TO BLENDING
        ↓
      BLENDING (butter + replacer, 3.3:1 ratio)
        ↓
        ├─→ PUBBB (unsalted blended)
        │     ↓
        │   PACK AS FINAL SKU: PUBBB
        │
        └─→ PSBBB (salted blended)
              ↓
              ├─→ PACK AS FINAL SKU: PSBBB
              └─→ MAKE BRICKS → PACK AS FINAL SKU: BB05
```

### External Cream Workflow
```
CREAM (purchased from supplier)
  ↓
CHURNING
  ↓
BUTTER
  ↓
BLENDING (ALWAYS - no direct packing)
  ↓
PUBBB (unsalted blended)
  ↓
  ├─→ PACK AS FINAL SKU: PUBBB
  └─→ ADD SALT → PSBBB (salted blended)
        ↓
        ├─→ PACK AS FINAL SKU: PSBBB
        └─→ MAKE BRICKS → PACK AS FINAL SKU: BB05
```

### Key Differences: Internal vs External

| Aspect | Internal Cream | External Cream |
|--------|---------------|----------------|
| Source | C/S rounds (recovered) | Purchased (cream receiving) |
| After churning | 3 options: Ghee / PUBB / Blending | **Must** go to blending |
| Can pack as PUBB? | ✅ Yes | ❌ No |
| Can send to Ghee? | ✅ Yes | ❌ No |
| Blending required? | Optional | **Always** |
| Final products | PUBB, PUBBB, PSBBB, BB05 | PUBBB, PSBBB, BB05 |

### Status Pipeline

**Internal Cream:**
```
Scheduled → Churning → Churned → 
[Send to Ghee OR Pack as PUBB OR Send to Blending]
  ↓ (if blending)
Blending → PUBBB Pool OR PSBBB Pool
  ↓ (if PSBBB)
[Pack as PSBBB OR Make Bricks]
  ↓ (if bricks)
BB05 Pool → Packed → Handed Over
```

**External Cream:**
```
Scheduled → Churning → Churned → Blending → PUBBB Pool
  ↓
[Pack as PUBBB OR Add Salt]
  ↓ (if salt)
PSBBB Pool
  ↓
[Pack as PSBBB OR Make Bricks]
  ↓ (if bricks)
BB05 Pool → Packed → Handed Over
```

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

### Implementation Status
- ✅ Butter tab created with complete workflow
- ✅ Cream source selection (internal/external)
- ✅ Shift + Round structure
- ✅ Churning process with output recording
- ✅ Three-path decision for internal cream (Ghee/PUBB/Blending)
- ✅ Mandatory blending for external cream
- ✅ Auto-calculated blending ratio (3.3:1)
- ✅ Salt/unsalt toggle for blending
- ✅ Packing for all SKUs (PUBB, PUBBB, PSBBB, BB05)
- ✅ +Add Packing button for multiple sessions
- ✅ Batch codes (03-DATE)
- ✅ Data model updated with butter-specific fields
- ✅ CreamLot interface added

---

## 2. Cream Recovery

### When to Record
- Cream is recovered from **C/S (Rozana) rounds ONLY**
- Can be recorded from **"In Production" status onwards** (through all subsequent statuses)
- Recorded **once per round** — button disappears after recording

### How to Record
- Cream is stored and weighed in **buckets**
- Form captures:
  - **Number of buckets**
  - **Individual weight of each bucket** (in kg)
  - **Total weight** (auto-calculated as sum of bucket weights)
  - **Recorded by** (worker name)
- Unit of measure: **kg** (NOT litres)

### Data Storage
- Creates an intermediate lot for the cream
- Stored in Chiller
- Available for butter/ghee production later

---

## 3. PAN111 (Recovered Paneer)

### What It Is
- **Recovered usable paneer** (offcuts, broken pieces, soft/crumbly paneer from cutting)
- **NOT waste** — it's an intermediate material
- Used later for **Jalapeño Popper (JP) cream-cheese filling**

### When to Record
- Recorded **once per milk lot** (NOT per round)
- Recorded by the **supervisor** after **ALL production is complete** for that milk lot
- Separate "Record PAN111" button at top of production board

### How to Record
- Enter total weight (kg)
- Enter supervisor name
- Creates intermediate lot for PAN111

---

## 4. Parallel Production

### Simultaneous Rounds
- **2 rounds can run simultaneously** in Vat 2 and Vat 3
- As one round reaches coagulation stage, the next round can start
- This is why cooling location choice (tank vs chiller) matters — to avoid mixing rounds

---

## 5. SPP (Spicy Paneer Poppers)

### Production Flow
- Uses **Rozana (C/S) paneer** as input
- Cut paneer → coated (Iyababa spice + Predust + breadcrumbs) → frozen → flash fried (185°C, 20 sec) → frozen → packed

### Tracking on Production Board
- When cut type is "SPP pieces", we track:
  - Which rounds were **allocated for SPP**
  - **How much cut weight was obtained** (this is what gets crumbed and fried later)

### Finished Product
- 8 pieces per packet
- 12 packets per case
- Rejected poppers = **waste** (not reworked)

---

## 6. FIFO (First In, First Out)

### Implementation
- **FIFO warning banner** appears at top of production board when older frozen stock exists
- **Non-blocking** — allows packing anyway
- Staff should pack oldest batches first, but system doesn't hard-enforce

---

## 7. UI/UX Preferences

### Production Board Layout
- **Shift-grouped cards** with colored headers:
  - Indigo for active shifts
  - Slate for completed shifts
  - Amber for scheduled shifts
- **Status pipeline dots** visualization
- **Clean table layout** with all key information visible
- **Context-aware action buttons** — each status shows only relevant next actions

### Action Buttons
- No generic "Advance" button
- Specific workflows for each stage:
  - "Vat 2" / "Vat 3" buttons at "Scheduled"
  - "Start Coagulation" at "In Production"
  - "Start Pressing" at "Coagulation"
  - Timer display + "Tank" / "Chiller" buttons at "Pressing" (when timer completes)
  - Timer display + "Start Resting" at "Cooling"
  - Timer display + "Ready to Cut" at "Resting"
  - "Cut" button at "Ready for Cutting"
  - "Clingwrap" / "Freeze" / "Pack" / "+Cream" at "Cut"
  - etc.

### Modal Forms
- Cutting form: Number of blocks, individual block weights, cut by, cut type
- Packing form: SKU selection, cases, loose packets
- Cream form: Number of buckets, individual bucket weights, recorded by
- PAN111 form: Total weight, recorded by (supervisor)

---

## 8. Data Model Decisions

### Production Round Fields
- `vat`: 'vat2' | 'vat3' (which vat was used)
- `pressingStartedAt`: timestamp (when pressing timer started)
- `coolingStartedAt`: timestamp (when cooling timer started)
- `coolingLocation`: 'tank' | 'chiller' (where cooling happened)
- `restingStartedAt`: timestamp (when resting timer started)
- `cutBy`: string (who did the cutting)
- `cuttingType`: string (SPP pieces, 400g blocks, etc.)
- `numberOfBlocks`: number (how many blocks were cut)
- `blockWeights`: number[] (individual weight of each block)
- `creamRecovered`: number (kg of cream recovered, C/S rounds only)
- `creamRecoveredAt`: timestamp
- `creamRecoveredBy`: string
- `packedSkus`: Array<{sku, cases, loose}> (supports multiple SKUs per round)

### Status Enum
```typescript
'scheduled' | 'in_production' | 'coagulation' | 'pressing' | 'cooling' | 
'resting' | 'ready_cutting' | 'cut' | 'clingwrapped' | 'frozen' | 'packed' | 'handed_over'
```

---

## 9. Timer Requirements

### Pressing Timer
- **30 minutes**
- Starts when moving to "Pressing" status
- Visual countdown with timer icon

### Cooling Timer
- **Cooling Tank:** 1 hour 30 minutes (90 min)
- **Chiller:** 2 hours (120 min)
- Starts when moving to "Cooling" status
- Duration depends on `coolingLocation` field

### Resting Timer
- **1 hour 30 minutes** (90 min)
- Starts when moving to "Resting" status

### Timer Behavior
- Timers update every second
- When timer reaches 0, next action button appears
- Timers are stored in component state (not persisted to database in prototype)

---

## 10. Batch Identity Format

### Human-Readable Format
```
Milk Lot / Shift / Round / Type
Example: 160626/S1/R2/C/S
```

### Components
- **Milk Lot:** Date-based code (e.g., "160626" for June 16, 2026)
- **Shift:** Shift number (S1, S2, S3, S4)
- **Round:** Round number within shift (R1, R2, R3, etc.)
- **Type:** D (Malai) or C/S (Rozana) or Halloumi

---

## 11. What's NOT Recorded (Common Mistakes to Avoid)

❌ **Don't record output weight before cutting** — only record at cutting stage  
❌ **Don't record PAN111 per round** — only once per milk lot by supervisor  
❌ **Don't record wastage at cutting stage** — wastage is recorded separately  
❌ **Don't auto-select SKU when packing** — manual selection required  
❌ **Don't start pressing timer at vat selection** — timer starts at "Pressing" status  
❌ **Don't allow clingwrap before "Ready for Cutting"** — only after that status  
❌ **Don't record cream in litres** — record in kg (bucket weights)  
❌ **Don't make freezing mandatory** — it's optional  

---

## 12. Development Approach

### Current Status
- **Phase:** Interactive prototype with localStorage
- **Focus:** Getting production board working correctly for paneer
- **Next:** Halloumi workflow, then butter/ghee
- **Deployment:** Vercel (auto-deploys from GitHub)

### What Works
✅ Create shifts and rounds  
✅ Advance through all statuses with correct timers  
✅ Record cutting with block weights  
✅ Record cream in buckets  
✅ Record PAN111 once per milk lot  
✅ Pack with SKU/cases/loose  
✅ Handover to distribution  
✅ Data persists in localStorage  

### What's Next
- [ ] Halloumi production workflow
- [ ] Butter production workflow
- [ ] Ghee production workflow
- [ ] Connect to Supabase for real multi-user persistence
- [ ] Authentication and role-based access
- [ ] Audit trail
- [ ] Master data management (products, SKUs, recipes)

---

## 13. Key Business Rules Summary

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

---

## 14. Questions for Future Clarification

- [ ] Exact block weight targets (if any)?
- [ ] How to handle partial packing (round not fully packed)?
- [ ] Should we track which specific buckets were used for cream?
- [ ] What happens if a round is abandoned/cancelled mid-production?
- [ ] How to handle rework (if any)?
- [ ] Should timers be persisted to database (for multi-user scenarios)?
- [x] What's the exact process for halloumi? (IMPLEMENTED - see section 1B)
- [ ] What's the exact process for butter/ghee? (needs detailed walkthrough)

---

## 15. File Structure

```
src/
├── components/
│   ├── Layout.tsx          # Main layout with sidebar navigation
│   ├── Modal.tsx           # Reusable modal component
│   └── Toast.tsx           # Toast notification system
├── data/
│   └── mockData.ts         # Mock data and TypeScript interfaces
├── hooks/
│   └── useLocalStorage.ts  # localStorage persistence hook
├── pages/
│   ├── ProductionBoard.tsx # Main production board with 5 tabs
│   ├── HalloumiTab.tsx     # Halloumi production tab (separate component)
│   ├── MilkReceiving.tsx   # Milk lot management
│   ├── Inventory.tsx       # Intermediate and finished stock
│   ├── ColdChain.tsx       # Temperature monitoring
│   ├── WasteAndYield.tsx   # Waste tracking and yield analysis
│   ├── Utilities.tsx       # Fuel and utility tracking
│   ├── Handover.tsx        # Distribution handover
│   ├── Reconciliation.tsx  # Weekly reconciliation
│   ├── Cutting.tsx         # (Legacy - integrated into ProductionBoard)
│   ├── Packing.tsx         # (Legacy - integrated into ProductionBoard)
│   ├── Dashboard.tsx       # Management dashboard
│   └── Settings.tsx        # System settings
├── store/
│   └── AppContext.tsx      # Global state management with React Context
└── App.tsx                 # Main app with routing
```

---

## 16. Deployment Notes

### Vercel Configuration
- `vercel.json` includes:
  - Build command: `npm run build`
  - Output directory: `dist`
  - Rewrites for SPA routing (all routes → index.html)

### Common Deployment Issues
- **404 errors on routes:** Fixed by adding rewrites in `vercel.json`
- **"vite: command not found":** Fixed by ensuring `npm install` runs before build
- **Deployment blocked:** Ensure git commit author matches Vercel account owner

---

## 17. Testing Checklist

Before deploying changes, verify:

- [ ] Can create a new shift
- [ ] Can create a new round (auto-selects latest active shift)
- [ ] Can select Vat 2 or Vat 3 (status moves to "In Production", NO timer)
- [ ] Can start coagulation (status moves to "Coagulation")
- [ ] Can start pressing (status moves to "Pressing", 30min timer starts)
- [ ] Pressing timer counts down correctly
- [ ] Can choose cooling location (tank or chiller) when pressing timer completes
- [ ] Cooling timer shows correct duration (90min for tank, 120min for chiller)
- [ ] Can start resting when cooling timer completes (90min timer starts)
- [ ] Can move to "Ready for Cutting" when resting timer completes
- [ ] Can record cutting with block weights (6-8 blocks)
- [ ] Total output weight = sum of block weights
- [ ] Can record cream for C/S rounds (in buckets, kg)
- [ ] Cream button appears from "In Production" onwards
- [ ] Cream button disappears after recording
- [ ] Can record PAN111 once per milk lot
- [ ] Can clingwrap after "Ready for Cutting"
- [ ] Can return from clingwrap to final cutting
- [ ] Can freeze (optional)
- [ ] Can pack with SKU/cases/loose
- [ ] Can pack multiple SKUs from same round
- [ ] Can handover to distribution
- [ ] Data persists after page refresh
- [ ] FIFO warning appears when older stock exists

---

**End of DECISIONS.md**

*This document should be updated whenever new decisions are made or corrections are provided. It serves as the single source of truth for factory-specific workflow details that aren't covered in the main specification files.*
