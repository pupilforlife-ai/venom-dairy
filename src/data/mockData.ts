// Mock data for Vejoy Production Management System prototype

export interface MilkLot {
  id: string;
  lotCode: string;
  receiptDate: string;
  supplier: string;
  litresReceived: number;
  litresConsumed: number;
  litresRemaining: number;
  status: 'active' | 'completed' | 'rejected';
}

export interface ProductionRound {
  id: string;
  milkLotId: string;
  milkLotCode: string;
  shift: number;
  roundNumber: number;
  type: 'D' | 'C/S' | 'Halloumi' | 'Butter' | 'Ghee';
  status: 'in_progress' | 'pressed' | 'cutting' | 'frozen' | 'packing' | 'completed';
  team: string[];
  plannedInput: number; // litres
  actualInput: number; // litres
  outputWeight: number; // kg
  startTime: string;
  cutBy?: string;
  cuttingStatus?: 'pending' | 'in_progress' | 'completed';
  packingStatus?: 'pending' | 'in_progress' | 'completed';
  intermediateBalance?: number; // kg
}

export interface IntermediateStock {
  id: string;
  productId: string;
  productName: string;
  sourceRoundId: string;
  sourceRoundCode: string;
  weight: number; // kg
  location: string;
  status: 'available' | 'reserved' | 'consumed';
  createdAt: string;
  expiryDate: string;
}

export interface FinishedStock {
  id: string;
  sku: string;
  productName: string;
  cases: number;
  loosePackets: number;
  totalPackets: number;
  location: string;
  status: 'awaiting_handover' | 'handed_over' | 'returned';
  createdAt: string;
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
}

export interface DashboardMetric {
  label: string;
  value: string | number;
  unit?: string;
  trend?: 'up' | 'down' | 'stable';
  trendValue?: string;
  color: string;
}

// Current milk lots
export const milkLots: MilkLot[] = [
  {
    id: 'ml-001',
    lotCode: 'ML-2026-W24',
    receiptDate: '2026-06-15',
    supplier: 'Green Valley Dairy',
    litresReceived: 5000,
    litresConsumed: 3850,
    litresRemaining: 1150,
    status: 'active',
  },
  {
    id: 'ml-002',
    lotCode: 'ML-2026-W23',
    receiptDate: '2026-06-08',
    supplier: 'Green Valley Dairy',
    litresReceived: 4800,
    litresConsumed: 4800,
    litresRemaining: 0,
    status: 'completed',
  },
];

// Production rounds - Digital Board data
export const productionRounds: ProductionRound[] = [
  {
    id: 'pr-001',
    milkLotId: 'ml-001',
    milkLotCode: 'ML-2026-W24',
    shift: 1,
    roundNumber: 1,
    type: 'D',
    status: 'completed',
    team: ['Rajesh', 'Amit', 'Suresh'],
    plannedInput: 500,
    actualInput: 500,
    outputWeight: 72,
    startTime: '2026-06-16T06:00:00',
    cutBy: 'Rajesh',
    cuttingStatus: 'completed',
    packingStatus: 'completed',
    intermediateBalance: 0,
  },
  {
    id: 'pr-002',
    milkLotId: 'ml-001',
    milkLotCode: 'ML-2026-W24',
    shift: 1,
    roundNumber: 2,
    type: 'C/S',
    status: 'frozen',
    team: ['Rajesh', 'Amit', 'Vikram'],
    plannedInput: 500,
    actualInput: 500,
    outputWeight: 68,
    startTime: '2026-06-16T08:30:00',
    cutBy: 'Amit',
    cuttingStatus: 'completed',
    packingStatus: 'pending',
    intermediateBalance: 68,
  },
  {
    id: 'pr-003',
    milkLotId: 'ml-001',
    milkLotCode: 'ML-2026-W24',
    shift: 2,
    roundNumber: 1,
    type: 'D',
    status: 'pressed',
    team: ['Vikram', 'Suresh', 'Deepak'],
    plannedInput: 500,
    actualInput: 480,
    outputWeight: 0,
    startTime: '2026-06-16T14:00:00',
    cuttingStatus: 'pending',
    packingStatus: 'pending',
  },
  {
    id: 'pr-004',
    milkLotId: 'ml-001',
    milkLotCode: 'ML-2026-W24',
    shift: 2,
    roundNumber: 2,
    type: 'D',
    status: 'in_progress',
    team: ['Vikram', 'Deepak', 'Manoj'],
    plannedInput: 500,
    actualInput: 350,
    outputWeight: 0,
    startTime: '2026-06-16T16:00:00',
    cuttingStatus: 'pending',
    packingStatus: 'pending',
  },
  {
    id: 'pr-005',
    milkLotId: 'ml-001',
    milkLotCode: 'ML-2026-W24',
    shift: 3,
    roundNumber: 1,
    type: 'Halloumi',
    status: 'cutting',
    team: ['Amit', 'Manoj'],
    plannedInput: 300,
    actualInput: 300,
    outputWeight: 42,
    startTime: '2026-06-16T22:00:00',
    cutBy: 'Manoj',
    cuttingStatus: 'in_progress',
    packingStatus: 'pending',
    intermediateBalance: 38,
  },
  {
    id: 'pr-006',
    milkLotId: 'ml-001',
    milkLotCode: 'ML-2026-W24',
    shift: 3,
    roundNumber: 2,
    type: 'C/S',
    status: 'completed',
    team: ['Rajesh', 'Suresh', 'Deepak'],
    plannedInput: 500,
    actualInput: 500,
    outputWeight: 70,
    startTime: '2026-06-17T00:30:00',
    cutBy: 'Suresh',
    cuttingStatus: 'completed',
    packingStatus: 'completed',
    intermediateBalance: 0,
  },
  {
    id: 'pr-007',
    milkLotId: 'ml-001',
    milkLotCode: 'ML-2026-W24',
    shift: 4,
    roundNumber: 1,
    type: 'D',
    status: 'in_progress',
    team: ['Amit', 'Vikram', 'Manoj'],
    plannedInput: 500,
    actualInput: 200,
    outputWeight: 0,
    startTime: '2026-06-17T06:00:00',
    cuttingStatus: 'pending',
    packingStatus: 'pending',
  },
];

// Intermediate stock
export const intermediateStock: IntermediateStock[] = [
  {
    id: 'is-001',
    productId: 'paneer-cs-frozen',
    productName: 'Paneer C/S (Frozen)',
    sourceRoundId: 'pr-002',
    sourceRoundCode: 'W24/S1/R2/C/S',
    weight: 68,
    location: 'Freezer -18°C',
    status: 'available',
    createdAt: '2026-06-16T12:00:00',
    expiryDate: '2026-07-16',
  },
  {
    id: 'is-002',
    productId: 'halloumi-cut',
    productName: 'Halloumi (Cut)',
    sourceRoundId: 'pr-005',
    sourceRoundCode: 'W24/S3/R1/Halloumi',
    weight: 38,
    location: 'Chiller 3-5°C',
    status: 'available',
    createdAt: '2026-06-17T02:00:00',
    expiryDate: '2026-06-24',
  },
  {
    id: 'is-003',
    productId: 'pan111',
    productName: 'PAN111 (Recovered Cream)',
    sourceRoundId: 'pr-001',
    sourceRoundCode: 'W24/S1/R1/D',
    weight: 12,
    location: 'Chiller 3-5°C',
    status: 'available',
    createdAt: '2026-06-16T10:00:00',
    expiryDate: '2026-06-23',
  },
];

// Finished stock
export const finishedStock: FinishedStock[] = [
  {
    id: 'fs-001',
    sku: 'SPP-200',
    productName: 'SPP 200g Packet',
    cases: 15,
    loosePackets: 6,
    totalPackets: 156,
    location: 'Freezer -18°C',
    status: 'awaiting_handover',
    createdAt: '2026-06-16T14:00:00',
  },
  {
    id: 'fs-002',
    sku: 'PAN-D-400',
    productName: 'Paneer D 400g',
    cases: 22,
    loosePackets: 3,
    totalPackets: 223,
    location: 'Chiller 3-5°C',
    status: 'awaiting_handover',
    createdAt: '2026-06-16T11:00:00',
  },
  {
    id: 'fs-003',
    sku: 'PAN-CS-200',
    productName: 'Paneer C/S 200g',
    cases: 37,
    loosePackets: 6,
    totalPackets: 376,
    location: 'Freezer -18°C',
    status: 'awaiting_handover',
    createdAt: '2026-06-17T04:00:00',
  },
];

// Temperature readings
export const temperatureReadings: TemperatureReading[] = [
  { id: 't-001', location: 'Chiller Room A', temperature: 4.2, targetMin: 3, targetMax: 5, recordedAt: '2026-06-17T06:00:00', recordedBy: 'Rajesh', inRange: true },
  { id: 't-002', location: 'Chiller Room B', temperature: 4.8, targetMin: 3, targetMax: 5, recordedAt: '2026-06-17T06:00:00', recordedBy: 'Rajesh', inRange: true },
  { id: 't-003', location: 'Freezer -18°C', temperature: -17.5, targetMin: -20, targetMax: -16, recordedAt: '2026-06-17T06:00:00', recordedBy: 'Amit', inRange: true },
  { id: 't-004', location: 'Freezer -18°C (Deep)', temperature: -19.2, targetMin: -22, targetMax: -16, recordedAt: '2026-06-17T06:00:00', recordedBy: 'Amit', inRange: true },
  { id: 't-005', location: 'Chiller Room A', temperature: 6.1, targetMin: 3, targetMax: 5, recordedAt: '2026-06-17T10:00:00', recordedBy: 'Vikram', inRange: false },
  { id: 't-006', location: 'Display Chiller', temperature: 4.0, targetMin: 3, targetMax: 5, recordedAt: '2026-06-17T10:00:00', recordedBy: 'Vikram', inRange: true },
];

// Waste events
export const wasteEvents: WasteEvent[] = [
  { id: 'w-001', date: '2026-06-16', product: 'Paneer D', quantity: 2.5, unit: 'kg', reason: 'Over-pressed / texture defect', recordedBy: 'Rajesh' },
  { id: 'w-002', date: '2026-06-16', product: 'Milk', quantity: 15, unit: 'L', reason: 'Spillage during transfer', recordedBy: 'Amit' },
  { id: 'w-003', date: '2026-06-15', product: 'Halloumi', quantity: 1.2, unit: 'kg', reason: 'Cutting loss', recordedBy: 'Manoj' },
];

// Dashboard metrics
export const dashboardMetrics: DashboardMetric[] = [
  { label: 'Today\'s Output', value: 252, unit: 'kg', trend: 'up', trendValue: '+8%', color: 'emerald' },
  { label: 'Milk Remaining', value: 1150, unit: 'L', trend: 'down', trendValue: '-23%', color: 'blue' },
  { label: 'Active Rounds', value: 3, unit: '', trend: 'stable', trendValue: '', color: 'amber' },
  { label: 'Frozen Stock', value: 106, unit: 'kg', trend: 'up', trendValue: '+12%', color: 'indigo' },
  { label: 'Awaiting Packing', value: 68, unit: 'kg', trend: 'up', trendValue: '+68', color: 'orange' },
  { label: 'Today\'s Waste', value: 3.7, unit: 'kg', trend: 'down', trendValue: '-15%', color: 'red' },
  { label: 'Yield (Paneer)', value: '14.4', unit: '%', trend: 'stable', trendValue: '±0', color: 'teal' },
  { label: 'Finished Cases', value: 74, unit: 'cases', trend: 'up', trendValue: '+18', color: 'purple' },
];

// Weekly production summary for charts
export const weeklyProduction = [
  { day: 'Mon', paneer: 280, halloumi: 45, butter: 12 },
  { day: 'Tue', paneer: 310, halloumi: 52, butter: 15 },
  { day: 'Wed', paneer: 295, halloumi: 48, butter: 10 },
  { day: 'Thu', paneer: 320, halloumi: 55, butter: 18 },
  { day: 'Fri', paneer: 275, halloumi: 42, butter: 14 },
  { day: 'Sat', paneer: 252, halloumi: 38, butter: 8 },
  { day: 'Sun', paneer: 0, halloumi: 0, butter: 0 },
];

// Yield trends
export const yieldTrends = [
  { week: 'W20', actual: 13.8, target: 14.5 },
  { week: 'W21', actual: 14.1, target: 14.5 },
  { week: 'W22', actual: 14.3, target: 14.5 },
  { week: 'W23', actual: 14.6, target: 14.5 },
  { week: 'W24', actual: 14.4, target: 14.5 },
];
