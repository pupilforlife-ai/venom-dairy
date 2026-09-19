// Vejoy Production Management System — Mock Data
// Aligned with PRODUCT_SPEC.md, TECHNICAL_SPEC.md, BUILD_PLAN.md

// ============================================================
// BATCH IDENTITY FORMAT: Milk Lot / Shift / Round / Type
// Example: 160626 / S1 / R2 / C/S  (internal: 160626-S01-R02-CS)
// ============================================================

export interface MilkSale {
  id: string;
  milkLotId: string;
  saleDate: string;
  customer: string;
  quantity: number;
}

export interface ProductionReconciliation {
  paneerRecorded: number; // kg
  yieldLPerKg: number; // L/kg
  paneerYieldPer100L: number; // kg/100L
  dRounds: number;
  csRounds: number;
  cream: number; // kg
  pan111: number; // kg
  paneerForSpp: number; // kg
}

export interface PackedSku {
  sku: string;
  cases: number;
}

export interface MilkLot {
  id: string;
  lotCode: string; // e.g. "160626" (date-based)
  receiptDate: string;
  receiptTime?: string;
  supplier: string;
  invoiceNo?: string;
  deliveryNoteNo?: string;
  litresReceived: number;
  litresConsumed: number;
  litresRemaining: number;
  litresRejected: number;
  litresSpilled: number;
  litresSold?: number;
  status: 'active' | 'completed' | 'rejected';
  isLatest?: boolean;
  reconciliation?: ProductionReconciliation;
  packedSkus?: PackedSku[];
  milkSales?: MilkSale[];
}

export interface ProductionShift {
  id: string;
  milkLotId: string;
  milkLotCode: string;
  shiftNumber: number;
  startedAt: string;
  endedAt?: string;
  team: string[];
  teamNotes?: string;
  status: 'active' | 'completed' | 'scheduled';
}

export interface ProductionRound {
  id: string;
  milkLotId: string;
  milkLotCode: string;
  shiftId: string;
  shiftNumber: number;
  roundNumber: number;
  type: 'D' | 'C/S' | 'Halloumi' | 'Butter' | 'Ghee';
  // Status flow varies by product type - using string for flexibility
  status: string;
  team: string[];
  plannedInput: number; // litres
  actualInput: number; // litres
  outputWeight: number; // kg gross manufactured output
  startTime: string;
  completedAt?: string;
  
  // Production details (paneer)
  vat?: 'vat2' | 'vat3';
  startingTemperature?: number; // °C
  pressingStartedAt?: string;
  coolingStartedAt?: string;
  coolingLocation?: 'tank' | 'chiller';
  restingStartedAt?: string;
  
  // Halloumi-specific timestamps
  curdSettingStartedAt?: string;
  curdCuttingStartedAt?: string;
  
  // Cutting details (paneer)
  cutBy?: string;
  cuttingType?: string;
  blockWeights?: number[];
  numberOfBlocks?: number;
  
  // Intermediate balance
  intermediateBalance?: number;
  
  // Packing results - supports multiple SKUs per round
  packedSkus?: Array<{
    sku: string;
    cases: number;
    loose: number;
  }>;
  
  // Remaining balance after cutting (kg available for packing)
  remainingBalance?: number;
  
  // Cream recovery (C/S rounds only)
  creamRecovered?: number; // kg
  creamRecoveredAt?: string;
  creamRecoveredBy?: string;
  
  notes?: string;
  locked: boolean;
}

export interface IntermediateLot {
  id: string;
  lotCode: string; // display label
  productId: string;
  productName: string;
  productClass: 'intermediate';
  sourceBatchId: string;
  sourceBatchCode: string; // e.g. "160626/S1/R2/C/S"
  producedQuantity: number; // kg
  currentQuantity: number; // kg
  uom: string;
  storageLocation: string;
  status: 'available' | 'reserved' | 'consumed';
  producedAt: string;
  // Genealogy
  sourceMilkLotCode: string;
  sourceShift: number;
  sourceRound: number;
}

export interface FinishedStockLot {
  id: string;
  sku: string;
  productName: string;
  packingRunId: string;
  cases: number;
  loosePackets: number;
  totalPackets: number;
  storageLocation: string;
  status: 'awaiting_handover' | 'handed_over' | 'returned';
  createdAt: string;
  sourceBatchCodes: string[]; // genealogy: which rounds fed this
}

export interface TemperatureReading {
  id: string;
  location: string;
  temperature: number;
  targetMin: number;
  targetMax: number;
  recordedAt: string;
  recordedBy: string;
  inRange: boolean;
}

export interface WasteEvent {
  id: string;
  date: string;
  product: string;
  quantity: number;
  unit: string;
  reason: string;
  recordedBy: string;
  batchCode?: string;
  isRecoverable: boolean; // PAN111, recovered cream = NOT waste
}

export interface UtilityLog {
  id: string;
  type: 'diesel' | 'paraffin' | 'gas' | 'electricity';
  periodStart: string;
  periodEnd: string;
  quantity: number;
  uom: string;
  unitCost?: number;
  totalCost?: number;
  notes?: string;
}

// ============================================================
// PRODUCTION SHIFTS
// ============================================================
export const productionShifts: ProductionShift[] = [
  {
    id: 'shift-001',
    milkLotId: 'ml-001',
    milkLotCode: '160626',
    shiftNumber: 1,
    startedAt: '2026-06-16T18:00:00',
    endedAt: '2026-06-17T02:00:00',
    team: ['Rajesh', 'Amit', 'Suresh'],
    status: 'completed',
  },
  {
    id: 'shift-002',
    milkLotId: 'ml-001',
    milkLotCode: '160626',
    shiftNumber: 2,
    startedAt: '2026-06-17T06:00:00',
    team: ['Vikram', 'Suresh', 'Deepak'],
    status: 'active',
  },
  {
    id: 'shift-003',
    milkLotId: 'ml-001',
    milkLotCode: '160626',
    shiftNumber: 3,
    startedAt: '2026-06-17T14:00:00',
    team: ['Amit', 'Manoj'],
    status: 'active',
  },
  {
    id: 'shift-004',
    milkLotId: 'ml-001',
    milkLotCode: '160626',
    shiftNumber: 4,
    startedAt: '2026-06-17T22:00:00',
    team: ['Amit', 'Vikram', 'Manoj'],
    status: 'scheduled',
  },
  {
    id: 'shift-pw-001',
    milkLotId: 'ml-002',
    milkLotCode: '090626',
    shiftNumber: 1,
    startedAt: '2026-06-09T18:00:00',
    endedAt: '2026-06-10T02:00:00',
    team: ['Rajesh', 'Amit', 'Vikram'],
    status: 'completed',
  },
];

// ============================================================
// CURRENT WEEK'S MILK LOT (Sunday 16 June 2026)
// ============================================================
export const milkLots: MilkLot[] = [
  {
    id: 'ml-001',
    lotCode: '160626',
    receiptDate: '2026-06-16',
    receiptTime: '18:30',
    supplier: 'Green Valley Dairy',
    invoiceNo: 'INV-2026-0423',
    deliveryNoteNo: 'DN-2026-0891',
    litresReceived: 25000,
    litresConsumed: 18500,
    litresRemaining: 5800,
    litresRejected: 0,
    litresSpilled: 120,
    litresSold: 0,
    status: 'active',
    isLatest: true,
    reconciliation: {
      paneerRecorded: 2358.5,
      yieldLPerKg: 7.85,
      paneerYieldPer100L: 12.74,
      dRounds: 24,
      csRounds: 13,
      cream: 352.8,
      pan111: 20.5,
      paneerForSpp: 98.6,
    },
    packedSkus: [
      { sku: 'MPAN100', cases: 18 },
      { sku: 'MPAN400', cases: 24 },
      { sku: 'RPAN010', cases: 9 },
      { sku: 'RPAN100', cases: 12 },
      { sku: 'YD200', cases: 72 },
    ],
    milkSales: [],
  },
  {
    id: 'ml-002',
    lotCode: '090626',
    receiptDate: '2026-06-09',
    receiptTime: '18:45',
    supplier: 'Green Valley Dairy',
    invoiceNo: 'INV-2026-0398',
    deliveryNoteNo: 'DN-2026-0847',
    litresReceived: 24000,
    litresConsumed: 23600,
    litresRemaining: 0,
    litresRejected: 200,
    litresSpilled: 200,
    litresSold: 0,
    status: 'completed',
    reconciliation: {
      paneerRecorded: 3433.83,
      yieldLPerKg: 7.86,
      paneerYieldPer100L: 12.72,
      dRounds: 35,
      csRounds: 19,
      cream: 515.74,
      pan111: 30.13,
      paneerForSpp: 145.88,
    },
    packedSkus: [
      { sku: 'MPAN100', cases: 26 },
      { sku: 'MPAN400', cases: 36 },
      { sku: 'RPAN010', cases: 13 },
      { sku: 'RPAN100', cases: 18 },
      { sku: 'YD200', cases: 105 },
    ],
    milkSales: [
      { id: 'ms-001', milkLotId: 'ml-002', saleDate: '2026-06-17', customer: 'Hubertous', quantity: 800 },
      { id: 'ms-002', milkLotId: 'ml-002', saleDate: '2026-06-17', customer: 'Sonal', quantity: 300 },
    ],
  },
  {
    id: 'ml-003',
    lotCode: '020626',
    receiptDate: '2026-06-02',
    receiptTime: '19:00',
    supplier: 'TipTop Dairy',
    invoiceNo: 'TT-2026-1156',
    deliveryNoteNo: 'TT-DN-0445',
    litresReceived: 26000,
    litresConsumed: 25800,
    litresRemaining: 0,
    litresRejected: 150,
    litresSpilled: 50,
    litresSold: 0,
    status: 'completed',
    reconciliation: {
      paneerRecorded: 3289.2,
      yieldLPerKg: 7.84,
      paneerYieldPer100L: 12.73,
      dRounds: 33,
      csRounds: 18,
      cream: 493.38,
      pan111: 28.8,
      paneerForSpp: 139.2,
    },
    packedSkus: [
      { sku: 'MPAN100', cases: 24 },
      { sku: 'MPAN400', cases: 34 },
      { sku: 'RPAN010', cases: 12 },
      { sku: 'RPAN100', cases: 17 },
      { sku: 'YD200', cases: 98 },
    ],
    milkSales: [],
  },
  {
    id: 'ml-004',
    lotCode: '260526',
    receiptDate: '2026-05-26',
    receiptTime: '18:15',
    supplier: 'Green Valley Dairy',
    invoiceNo: 'INV-2026-0372',
    deliveryNoteNo: 'DN-2026-0803',
    litresReceived: 23500,
    litresConsumed: 23200,
    litresRemaining: 0,
    litresRejected: 100,
    litresSpilled: 200,
    litresSold: 0,
    status: 'completed',
    reconciliation: {
      paneerRecorded: 2962.4,
      yieldLPerKg: 7.87,
      paneerYieldPer100L: 12.71,
      dRounds: 30,
      csRounds: 16,
      cream: 444.36,
      pan111: 25.9,
      paneerForSpp: 125.1,
    },
    packedSkus: [
      { sku: 'MPAN100', cases: 22 },
      { sku: 'MPAN400', cases: 30 },
      { sku: 'RPAN010', cases: 11 },
      { sku: 'RPAN100', cases: 15 },
      { sku: 'YD200', cases: 88 },
    ],
    milkSales: [],
  },
  {
    id: 'ml-005',
    lotCode: '190526',
    receiptDate: '2026-05-19',
    receiptTime: '18:30',
    supplier: 'TipTop Dairy',
    invoiceNo: 'TT-2026-1098',
    deliveryNoteNo: 'TT-DN-0412',
    litresReceived: 25500,
    litresConsumed: 25100,
    litresRemaining: 0,
    litresRejected: 250,
    litresSpilled: 150,
    litresSold: 0,
    status: 'completed',
    reconciliation: {
      paneerRecorded: 3203.1,
      yieldLPerKg: 7.83,
      paneerYieldPer100L: 12.76,
      dRounds: 32,
      csRounds: 17,
      cream: 480.47,
      pan111: 28.0,
      paneerForSpp: 135.0,
    },
    packedSkus: [
      { sku: 'MPAN100', cases: 23 },
      { sku: 'MPAN400', cases: 32 },
      { sku: 'RPAN010', cases: 12 },
      { sku: 'RPAN100', cases: 16 },
      { sku: 'YD200', cases: 95 },
    ],
    milkSales: [],
  },
  {
    id: 'ml-006',
    lotCode: '120526',
    receiptDate: '2026-05-12',
    receiptTime: '19:15',
    supplier: 'Green Valley Dairy',
    invoiceNo: 'INV-2026-0345',
    deliveryNoteNo: 'DN-2026-0761',
    litresReceived: 24800,
    litresConsumed: 24500,
    litresRemaining: 0,
    litresRejected: 180,
    litresSpilled: 120,
    litresSold: 0,
    status: 'completed',
    reconciliation: {
      paneerRecorded: 3108.6,
      yieldLPerKg: 7.89,
      paneerYieldPer100L: 12.68,
      dRounds: 31,
      csRounds: 17,
      cream: 466.29,
      pan111: 27.2,
      paneerForSpp: 131.2,
    },
    packedSkus: [
      { sku: 'MPAN100', cases: 23 },
      { sku: 'MPAN400', cases: 31 },
      { sku: 'RPAN010', cases: 11 },
      { sku: 'RPAN100', cases: 16 },
      { sku: 'YD200', cases: 92 },
    ],
    milkSales: [],
  },
  {
    id: 'ml-007',
    lotCode: '050526',
    receiptDate: '2026-05-05',
    receiptTime: '18:45',
    supplier: 'TipTop Dairy',
    invoiceNo: 'TT-2026-1042',
    deliveryNoteNo: 'TT-DN-0378',
    litresReceived: 26200,
    litresConsumed: 25900,
    litresRemaining: 0,
    litresRejected: 200,
    litresSpilled: 100,
    litresSold: 0,
    status: 'completed',
    reconciliation: {
      paneerRecorded: 3282.7,
      yieldLPerKg: 7.89,
      paneerYieldPer100L: 12.67,
      dRounds: 33,
      csRounds: 18,
      cream: 492.41,
      pan111: 28.7,
      paneerForSpp: 138.5,
    },
    packedSkus: [
      { sku: 'MPAN100', cases: 24 },
      { sku: 'MPAN400', cases: 34 },
      { sku: 'RPAN010', cases: 12 },
      { sku: 'RPAN100', cases: 17 },
      { sku: 'YD200', cases: 99 },
    ],
    milkSales: [],
  },
];

// ============================================================
// PRODUCTION ROUNDS — Digital Board
// Batch identity: MilkLot/Shift/Round/Type
// ============================================================
export const productionRounds: ProductionRound[] = [
  {
    id: 'pr-001',
    milkLotId: 'ml-001',
    milkLotCode: '160626',
    shiftId: 'shift-001',
    shiftNumber: 1,
    roundNumber: 1,
    type: 'D',
    status: 'handed_over',
    team: ['Rajesh', 'Amit', 'Suresh'],
    plannedInput: 500,
    actualInput: 500,
    outputWeight: 72,
    startTime: '2026-06-16T18:00:00',
    completedAt: '2026-06-16T22:00:00',
    vat: 'vat2',
    startingTemperature: 4.2,
    pressingStartedAt: '2026-06-16T19:30:00',
    coolingStartedAt: '2026-06-16T20:00:00',
    coolingLocation: 'tank',
    restingStartedAt: '2026-06-16T21:30:00',
    cutBy: 'Rajesh',
    cuttingType: '400g cubes',
    blockWeights: [10.2, 10.1, 10.3, 10.0, 10.2, 10.4, 10.8],
    numberOfBlocks: 7,
    intermediateBalance: 0,
    packedSkus: [{ sku: 'MPAN400', cases: 15, loose: 0 }],
    locked: true,
  },
  {
    id: 'pr-002',
    milkLotId: 'ml-001',
    milkLotCode: '160626',
    shiftId: 'shift-001',
    shiftNumber: 1,
    roundNumber: 2,
    type: 'C/S',
    status: 'cut',
    team: ['Rajesh', 'Amit', 'Vikram'],
    plannedInput: 500,
    actualInput: 500,
    outputWeight: 68,
    startTime: '2026-06-16T20:30:00',
    completedAt: '2026-06-17T00:30:00',
    vat: 'vat3',
    startingTemperature: 4.5,
    pressingStartedAt: '2026-06-16T22:00:00',
    coolingStartedAt: '2026-06-16T22:30:00',
    coolingLocation: 'chiller',
    restingStartedAt: '2026-06-17T00:30:00',
    cutBy: 'Amit',
    cuttingType: 'SPP pieces',
    blockWeights: [9.5, 9.8, 9.6, 9.7, 9.9, 9.5, 10.0],
    numberOfBlocks: 7,
    intermediateBalance: 68,
    locked: false,
  },
  {
    id: 'pr-003',
    milkLotId: 'ml-001',
    milkLotCode: '160626',
    shiftId: 'shift-002',
    shiftNumber: 2,
    roundNumber: 1,
    type: 'D',
    status: 'pressing',
    team: ['Vikram', 'Suresh', 'Deepak'],
    plannedInput: 500,
    actualInput: 480,
    outputWeight: 0,
    startTime: '2026-06-17T06:00:00',
    pressingStartedAt: '2026-06-17T07:30:00',
    locked: false,
  },
  {
    id: 'pr-004',
    milkLotId: 'ml-001',
    milkLotCode: '160626',
    shiftId: 'shift-002',
    shiftNumber: 2,
    roundNumber: 2,
    type: 'D',
    status: 'in_production',
    team: ['Vikram', 'Deepak', 'Manoj'],
    plannedInput: 500,
    actualInput: 350,
    outputWeight: 0,
    startTime: '2026-06-17T08:00:00',
    locked: false,
  },
  {
    id: 'pr-005',
    milkLotId: 'ml-001',
    milkLotCode: '160626',
    shiftId: 'shift-003',
    shiftNumber: 3,
    roundNumber: 1,
    type: 'Halloumi',
    status: 'cut',
    team: ['Amit', 'Manoj'],
    plannedInput: 240,
    actualInput: 240,
    outputWeight: 42,
    startTime: '2026-06-17T14:00:00',
    cutBy: 'Manoj',
    cuttingType: 'Popper size',
    intermediateBalance: 38,
    locked: false,
  },
  {
    id: 'pr-006',
    milkLotId: 'ml-001',
    milkLotCode: '160626',
    shiftId: 'shift-003',
    shiftNumber: 3,
    roundNumber: 2,
    type: 'C/S',
    status: 'packed',
    team: ['Rajesh', 'Suresh', 'Deepak'],
    plannedInput: 500,
    actualInput: 500,
    outputWeight: 70,
    startTime: '2026-06-17T16:30:00',
    completedAt: '2026-06-17T20:00:00',
    vat: 'vat2',
    startingTemperature: 4.0,
    pressingStartedAt: '2026-06-17T18:00:00',
    coolingStartedAt: '2026-06-17T18:30:00',
    coolingLocation: 'tank',
    restingStartedAt: '2026-06-17T20:00:00',
    cutBy: 'Suresh',
    cuttingType: '200g cubes',
    blockWeights: [10.0, 10.2, 9.8, 10.1, 10.0, 9.9, 10.0],
    numberOfBlocks: 7,
    intermediateBalance: 0,
    packedSkus: [{ sku: 'RPAN200', cases: 22, loose: 3 }],
    locked: true,
  },
  {
    id: 'pr-007',
    milkLotId: 'ml-001',
    milkLotCode: '160626',
    shiftId: 'shift-004',
    shiftNumber: 4,
    roundNumber: 1,
    type: 'D',
    status: 'scheduled',
    team: ['Amit', 'Vikram', 'Manoj'],
    plannedInput: 500,
    actualInput: 0,
    outputWeight: 0,
    startTime: '2026-06-17T22:00:00',
    locked: false,
  },
  {
    id: 'pr-pw-001',
    milkLotId: 'ml-002',
    milkLotCode: '090626',
    shiftId: 'shift-pw-001',
    shiftNumber: 1,
    roundNumber: 1,
    type: 'D',
    status: 'handed_over',
    team: ['Rajesh', 'Amit'],
    plannedInput: 500,
    actualInput: 500,
    outputWeight: 73,
    startTime: '2026-06-09T18:00:00',
    completedAt: '2026-06-09T22:00:00',
    vat: 'vat2',
    pressingStartedAt: '2026-06-09T19:30:00',
    coolingStartedAt: '2026-06-09T20:00:00',
    coolingLocation: 'tank',
    restingStartedAt: '2026-06-09T21:30:00',
    cutBy: 'Rajesh',
    cuttingType: '400g cubes',
    blockWeights: [10.5, 10.3, 10.4, 10.6, 10.2, 10.5, 10.5],
    numberOfBlocks: 7,
    intermediateBalance: 0,
    packedSkus: [{ sku: 'MPAN400', cases: 15, loose: 0 }],
    locked: true,
  },
  {
    id: 'pr-pw-002',
    milkLotId: 'ml-002',
    milkLotCode: '090626',
    shiftId: 'shift-pw-001',
    shiftNumber: 1,
    roundNumber: 2,
    type: 'C/S',
    status: 'handed_over',
    team: ['Rajesh', 'Vikram'],
    plannedInput: 500,
    actualInput: 500,
    outputWeight: 66,
    startTime: '2026-06-09T20:30:00',
    completedAt: '2026-06-10T00:30:00',
    vat: 'vat3',
    pressingStartedAt: '2026-06-09T22:00:00',
    coolingStartedAt: '2026-06-09T22:30:00',
    coolingLocation: 'chiller',
    restingStartedAt: '2026-06-10T00:30:00',
    cutBy: 'Vikram',
    cuttingType: '200g cubes',
    blockWeights: [9.4, 9.5, 9.3, 9.6, 9.4, 9.5, 9.9],
    numberOfBlocks: 7,
    intermediateBalance: 0,
    packedSkus: [{ sku: 'RPAN200', cases: 37, loose: 6 }],
    locked: true,
  },
];

// ============================================================
// INTERMEDIATE LOTS
// ============================================================
export const intermediateLots: IntermediateLot[] = [
  {
    id: 'il-001',
    lotCode: 'IL-160626-S1-R2-CS-001',
    productId: 'paneer-cs-frozen',
    productName: 'Rozana Paneer (Cut, Frozen)',
    productClass: 'intermediate',
    sourceBatchId: 'pr-002',
    sourceBatchCode: '160626/S1/R2/C/S',
    producedQuantity: 68,
    currentQuantity: 68,
    uom: 'kg',
    storageLocation: 'Intermediate Freezer',
    status: 'available',
    producedAt: '2026-06-17T02:00:00',
    sourceMilkLotCode: '160626',
    sourceShift: 1,
    sourceRound: 2,
  },
  {
    id: 'il-002',
    lotCode: 'IL-160626-S3-R1-HAL-001',
    productId: 'halloumi-cut',
    productName: 'Halloumi (Cut for Poppers)',
    productClass: 'intermediate',
    sourceBatchId: 'pr-005',
    sourceBatchCode: '160626/S3/R1/Halloumi',
    producedQuantity: 38,
    currentQuantity: 38,
    uom: 'kg',
    storageLocation: 'Chiller',
    status: 'available',
    producedAt: '2026-06-17T18:00:00',
    sourceMilkLotCode: '160626',
    sourceShift: 3,
    sourceRound: 1,
  },
  {
    id: 'il-003',
    lotCode: 'PAN111-160626-S1-R1',
    productId: 'pan111',
    productName: 'PAN111 (Recovered Paneer)',
    productClass: 'intermediate',
    sourceBatchId: 'pr-001',
    sourceBatchCode: '160626/S1/R1/D',
    producedQuantity: 4.2,
    currentQuantity: 4.2,
    uom: 'kg',
    storageLocation: 'Chiller',
    status: 'available',
    producedAt: '2026-06-16T23:00:00',
    sourceMilkLotCode: '160626',
    sourceShift: 1,
    sourceRound: 1,
  },
  {
    id: 'il-004',
    lotCode: 'IL-CREAM-160626-001',
    productId: 'recovered-cream',
    productName: 'Recovered Cream (from Rozana)',
    productClass: 'intermediate',
    sourceBatchId: 'pr-002',
    sourceBatchCode: '160626/S1/R2/C/S',
    producedQuantity: 12,
    currentQuantity: 12,
    uom: 'L',
    storageLocation: 'Chiller',
    status: 'available',
    producedAt: '2026-06-17T01:00:00',
    sourceMilkLotCode: '160626',
    sourceShift: 1,
    sourceRound: 2,
  },
];

// ============================================================
// FINISHED STOCK
// ============================================================
export const finishedStock: FinishedStockLot[] = [
  {
    id: 'fs-001',
    sku: 'MPAN400',
    productName: 'Malai Paneer 400g',
    packingRunId: 'pk-001',
    cases: 15,
    loosePackets: 0,
    totalPackets: 225, // 15 cases × 15 packets/case (wait, 24 packets/case for MPAN400)
    storageLocation: 'Finished Production Stock',
    status: 'awaiting_handover',
    createdAt: '2026-06-17T04:00:00',
    sourceBatchCodes: ['160626/S1/R1/D'],
  },
  {
    id: 'fs-002',
    sku: 'RPAN200',
    productName: 'Rozana Paneer 200g',
    packingRunId: 'pk-002',
    cases: 22,
    loosePackets: 3,
    totalPackets: 531, // 22 × 24 + 3
    storageLocation: 'Finished Production Stock',
    status: 'awaiting_handover',
    createdAt: '2026-06-17T21:00:00',
    sourceBatchCodes: ['160626/S3/R2/C/S'],
  },
  {
    id: 'fs-003',
    sku: 'SPP-200',
    productName: 'Spicy Paneer Poppers 200g',
    packingRunId: 'pk-003',
    cases: 37,
    loosePackets: 6,
    totalPackets: 450, // 37 × 12 + 6
    storageLocation: 'Intermediate Freezer',
    status: 'awaiting_handover',
    createdAt: '2026-06-17T10:00:00',
    sourceBatchCodes: ['160626/S1/R2/C/S'],
  },
];

// ============================================================
// TEMPERATURE READINGS
// ============================================================
export const temperatureReadings: TemperatureReading[] = [
  { id: 't-001', location: 'Chiller', temperature: 4.2, targetMin: 3, targetMax: 5, recordedAt: '2026-06-17T06:00:00', recordedBy: 'Rajesh', inRange: true },
  { id: 't-002', location: 'Intermediate Freezer', temperature: -17.5, targetMin: -20, targetMax: -16, recordedAt: '2026-06-17T06:00:00', recordedBy: 'Amit', inRange: true },
  { id: 't-003', location: 'Finished Stock Chiller', temperature: 4.8, targetMin: 3, targetMax: 5, recordedAt: '2026-06-17T06:00:00', recordedBy: 'Rajesh', inRange: true },
  { id: 't-004', location: 'Chiller', temperature: 6.1, targetMin: 3, targetMax: 5, recordedAt: '2026-06-17T10:00:00', recordedBy: 'Vikram', inRange: false },
  { id: 't-005', location: 'Intermediate Freezer', temperature: -18.2, targetMin: -20, targetMax: -16, recordedAt: '2026-06-17T10:00:00', recordedBy: 'Vikram', inRange: true },
  { id: 't-006', location: 'Chiller', temperature: 4.5, targetMin: 3, targetMax: 5, recordedAt: '2026-06-17T14:00:00', recordedBy: 'Deepak', inRange: true },
  { id: 't-007', location: 'Intermediate Freezer', temperature: -17.8, targetMin: -20, targetMax: -16, recordedAt: '2026-06-17T14:00:00', recordedBy: 'Deepak', inRange: true },
  { id: 't-008', location: 'Finished Stock Chiller', temperature: 4.3, targetMin: 3, targetMax: 5, recordedAt: '2026-06-17T14:00:00', recordedBy: 'Deepak', inRange: true },
];

// ============================================================
// WASTE EVENTS
// ============================================================
export const wasteEvents: WasteEvent[] = [
  { id: 'w-001', date: '2026-06-17', product: 'Paneer D', quantity: 2.5, unit: 'kg', reason: 'Over-pressed / texture defect', recordedBy: 'Rajesh', batchCode: '160626/S1/R1/D', isRecoverable: false },
  { id: 'w-002', date: '2026-06-17', product: 'Raw Milk', quantity: 120, unit: 'L', reason: 'Spillage during transfer', recordedBy: 'Amit', isRecoverable: false },
  { id: 'w-003', date: '2026-06-16', product: 'Halloumi', quantity: 1.2, unit: 'kg', reason: 'Cutting loss', recordedBy: 'Manoj', isRecoverable: false },
  { id: 'w-004', date: '2026-06-16', product: 'SPP Poppers', quantity: 0.8, unit: 'kg', reason: 'Rejected popper (flash fry defect)', recordedBy: 'Vikram', isRecoverable: false },
  // PAN111 is NOT waste — it's intermediate
];

// ============================================================
// UTILITIES
// ============================================================
export const utilityLogs: UtilityLog[] = [
  { id: 'u-001', type: 'diesel', periodStart: '2026-06-13', periodEnd: '2026-06-17', quantity: 200, uom: 'L', unitCost: 22.5, totalCost: 4500, notes: 'Generator + boiler' },
  { id: 'u-002', type: 'paraffin', periodStart: '2026-06-13', periodEnd: '2026-06-17', quantity: 80, uom: 'L', unitCost: 15.0, totalCost: 1200 },
  { id: 'u-003', type: 'gas', periodStart: '2026-06-13', periodEnd: '2026-06-17', quantity: 45, uom: 'kg', unitCost: 35.0, totalCost: 1575, notes: 'LPG for frying' },
  { id: 'u-004', type: 'electricity', periodStart: '2026-06-13', periodEnd: '2026-06-17', quantity: 2850, uom: 'kWh', unitCost: 3.2, totalCost: 9120, notes: 'Meter reading' },
];

// ============================================================
// DASHBOARD METRICS — Management priorities
// ============================================================
export const dashboardMetrics = [
  { label: 'Milk Remaining', value: 5800, unit: 'L', trend: 'down' as const, trendValue: '23% consumed', color: 'blue' },
  { label: 'Today\'s Output', value: 252, unit: 'kg', trend: 'up' as const, trendValue: '+8% vs avg', color: 'emerald' },
  { label: 'Paneer Yield', value: '14.4', unit: '%', trend: 'stable' as const, trendValue: 'Target: 14.5%', color: 'teal' },
  { label: 'Frozen Stock', value: 106, unit: 'kg', trend: 'up' as const, trendValue: 'Awaiting packing', color: 'indigo' },
  { label: 'Today\'s Waste', value: 4.5, unit: 'kg+L', trend: 'down' as const, trendValue: '-15% vs last wk', color: 'red' },
  { label: 'Cases Ready', value: 74, unit: 'cases', trend: 'up' as const, trendValue: 'Awaiting handover', color: 'purple' },
  { label: 'Cold Chain', value: '7/8', unit: 'OK', trend: 'stable' as const, trendValue: '1 excursion', color: 'amber' },
  { label: 'Weekly Fuel Cost', value: 'R16,395', unit: '', trend: 'down' as const, trendValue: '-3% vs last wk', color: 'orange' },
];

// ============================================================
// WEEKLY PRODUCTION CHART DATA
// ============================================================
export const weeklyProduction = [
  { day: 'Sun', paneer: 142, halloumi: 0, butter: 0, poppers: 0 },
  { day: 'Mon', paneer: 280, halloumi: 45, butter: 12, poppers: 75 },
  { day: 'Tue', paneer: 310, halloumi: 52, butter: 15, poppers: 0 },
  { day: 'Wed', paneer: 295, halloumi: 0, butter: 10, poppers: 0 },
  { day: 'Thu', paneer: 320, halloumi: 55, butter: 18, poppers: 60 },
  { day: 'Fri', paneer: 275, halloumi: 42, butter: 14, poppers: 0 },
  { day: 'Sat', paneer: 0, halloumi: 0, butter: 0, poppers: 0 },
];

// ============================================================
// YIELD TRENDS
// ============================================================
export const yieldTrends = [
  { week: 'W20', malai: 14.6, rozana: 13.2, target: 14.5 },
  { week: 'W21', malai: 14.8, rozana: 13.4, target: 14.5 },
  { week: 'W22', malai: 14.3, rozana: 13.1, target: 14.5 },
  { week: 'W23', malai: 14.7, rozana: 13.3, target: 14.5 },
  { week: 'W24', malai: 14.4, rozana: 13.2, target: 14.5 },
];

// ============================================================
// WEEKLY MILK RECONCILIATION
// ============================================================
export const milkReconciliation = {
  lotCode: '160626',
  received: 25000,
  consumedByProduction: 18500,
  remaining: 5800,
  rejected: 0,
  spilled: 120,
  accountedOther: 0,
  unexplainedVariance: 580, // 25000 - 18500 - 5800 - 0 - 120 = 580
  productionOutputs: [
    { product: 'Malai Paneer (D)', kg: 215 },
    { product: 'Rozana Paneer (C/S)', kg: 138 },
    { product: 'Halloumi', kg: 42 },
    { product: 'Recovered Cream', litres: 12 },
    { product: 'PAN111 (Recovered)', kg: 4.2 },
  ],
};

// ============================================================
// STATUS FLOW — Paneer production pipeline
// ============================================================
export const statusFlow = [
  'scheduled',
  'in_production',
  'coagulation',
  'pressing',
  'cooling',
  'resting',
  'ready_cutting',
  'cut',
  'clingwrapped',
  'frozen',
  'packed',
  'handed_over',
] as const;

export const statusLabels: Record<string, string> = {
  scheduled: 'Scheduled',
  in_production: 'In Production',
  coagulation: 'Coagulation',
  pressing: 'Pressing',
  cooling: 'Cooling',
  resting: 'Resting',
  ready_cutting: 'Ready for Cutting',
  cut: 'Cut',
  clingwrapped: 'Clingwrapped',
  frozen: 'Frozen',
  packed: 'Packed',
  handed_over: 'Handed Over',
};

export const statusColors: Record<string, string> = {
  scheduled: 'bg-slate-400',
  in_production: 'bg-blue-500',
  coagulation: 'bg-violet-500',
  pressing: 'bg-purple-500',
  cooling: 'bg-cyan-500',
  resting: 'bg-teal-500',
  ready_cutting: 'bg-amber-500',
  cut: 'bg-orange-500',
  clingwrapped: 'bg-pink-400',
  frozen: 'bg-indigo-500',
  packed: 'bg-emerald-500',
  handed_over: 'bg-emerald-700',
};
