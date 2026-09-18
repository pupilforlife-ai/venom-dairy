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
Scheduled → In Production → Coagulation → Pressing (30min) → 
Cooling (90min) → Resting (90min) → Ready for Cutting → Cut → 
[Vacuum Pack OR Send to HCP] → Handed Over
```

### Key Differences from Paneer

#### Default Input
- **240L milk** (not 500L like paneer)
- Changeable per round

#### Recipe Display
- **Staged recipe** shown to workers step-by-step
- Full recipe visible to owners/supervisors
- Recipe includes:
  - CaCl2 solution: 240 mL (for 240L milk)
  - Rennet: 60 mL
  - Salt: 2.4 kg
  - Process: 12 steps from heating to brining

#### Expected Yield
- **24-28 kg** halloumi from 240L milk
- Varies based on milk composition and process control

#### After Cutting
- Two options:
  1. **Vacuum Pack** — for direct sale
  2. **Send to HCP** — for Halloumi Cheese Poppers (crumbing tab)

#### Discard Button
- **Owner/Supervisor only** (role check not yet implemented)
- Must record:
  - Reason for discard
  - Person responsible
- Round is locked after discard

### Timer Durations
- **Pressing:** 30 minutes
- **Cooling:** 90 minutes (fixed, no tank/chiller choice like paneer)
- **Resting:** 90 minutes

### Implementation Status
- ✅ Halloumi tab created
- ✅ Shift and round management
- ✅ Status pipeline with timers
- ✅ Recipe modal with full process steps
- ✅ Discard button (without role check yet)
- ✅ Vacuum pack / Send to HCP options

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
