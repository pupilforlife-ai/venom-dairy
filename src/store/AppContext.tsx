import { createContext, useContext, ReactNode } from 'react';
import { useSupabaseState } from '../hooks/useSupabaseState';
import { returnHcpBalanceToPool, reconcileHcpChillerReturns } from '../lib/hcpCrumbing';
import type { CrumbingBatch } from '../pages/CrumbingTab';
import { recordPaneerIngredientAllocation } from '../lib/paneerRecipe';
import { supabase } from '../lib/supabase';
import { persistPaneerPacking, PaneerPackingRequest } from '../lib/atomicPaneerPacking';
import { persistGheeRound, GheeRoundRequest } from '../lib/atomicGheeRound';
import { getProductionRoundTypeChangeConflict } from '../lib/productionRoundTypeChange';
import { isRawMilkTemperatureInRange, RAW_MILK_TEMP_MAX_C, RAW_MILK_TEMP_MIN_C } from '../lib/coldChain';
import { 
  milkLots as initialMilkLots, 
  productionRounds as initialRounds,
  productionShifts as initialShifts,
  intermediateLots as initialIntermediate,
  finishedStock as initialFinished,
  temperatureReadings as initialTemps,
  wasteEvents as initialWaste,
  utilityLogs as initialUtilities,
  MilkLot,
  CreamLot,
  ProductionShift,
  ProductionRound,
  ProductionRoundHistoryEvent,
  IntermediateLot,
  FinishedStockLot,
  TemperatureReading,
  WasteEvent,
  UtilityLog,
  CipRecord,
  ButterLotClosure,
  cipRecords as initialCipRecords,
  statusFlow,
  getMilkLotCreamPool,
  getMilkLotAccounting,
  isMilkProductionRound,
} from '../data/mockData';

interface AppState {
  milkLots: MilkLot[];
  creamLots: CreamLot[];
  productionShifts: ProductionShift[];
  productionRounds: ProductionRound[];
  intermediateLots: IntermediateLot[];
  finishedStock: FinishedStockLot[];
  temperatureReadings: TemperatureReading[];
  wasteEvents: WasteEvent[];
  utilityLogs: UtilityLog[];
  cipRecords: CipRecord[];
  butterLotClosures: ButterLotClosure[];
}

interface AppContextType extends AppState {
  // Milk lot actions
  addMilkLot: (lot: Omit<MilkLot, 'id'>) => void;
  updateMilkLot: (id: string, updates: Partial<MilkLot>) => void;
  recordHcpChillerReturn: (batch: CrumbingBatch) => void;
  addCreamLot: (lot: Omit<CreamLot, 'id'>) => void;
  updateCreamLot: (id: string, updates: Partial<CreamLot>) => void;
  
  // Shift actions
  addProductionShift: (shift: Omit<ProductionShift, 'id'>) => boolean;
  removeProductionShift: (id: string) => boolean;
  updateProductionShift: (id: string, updates: Partial<ProductionShift>) => void;
  
  // Production round actions
  addProductionRound: (round: Omit<ProductionRound, 'id'>) => void;
  createProductionRound: (round: Omit<ProductionRound, 'id' | 'roundNumber'>) => Promise<ProductionRound | null>;
  removeProductionRound: (id: string) => boolean;
  cancelProductionRound: (id: string, reason?: string) => boolean;
  updateProductionRound: (id: string, updates: Partial<ProductionRound>) => void;
  commitPaneerPacking: (request: PaneerPackingRequest) => Promise<ProductionRound | null>;
  createGheeRound: (request: GheeRoundRequest) => Promise<ProductionRound | null>;
  recordProductionRoundActivity: (
    id: string,
    updates: Partial<ProductionRound>,
    event: Omit<ProductionRoundHistoryEvent, 'id' | 'occurredAt'> & { occurredAt?: string }
  ) => void;
  requestProductionRoundTypeChange: (id: string, newType: 'D' | 'C/S', reason: string) => Promise<boolean>;
  reviewProductionRoundTypeChange: (id: string, decision: 'approve' | 'reject', decisionReason?: string) => Promise<boolean>;
  advanceRoundStatus: (id: string) => void;
  forceAdvanceRoundStatus: (id: string) => Promise<boolean>;
  recordRoundOutput: (id: string, outputWeight: number, notes?: string) => void;
  
  // Temperature actions
  addTemperatureReading: (reading: Omit<TemperatureReading, 'id' | 'inRange'>) => void;
  
  // Waste actions
  addWasteEvent: (event: Omit<WasteEvent, 'id'>) => void;
  updateWasteEvent: (id: string, updates: Partial<WasteEvent>) => void;
  
  // Intermediate lot actions
  addIntermediateLot: (lot: Omit<IntermediateLot, 'id'>) => void;
  updateIntermediateLot: (id: string, updates: Partial<IntermediateLot>) => void;
  
  // Finished stock actions
  addFinishedStock: (stock: Omit<FinishedStockLot, 'id'>) => void;
  updateFinishedStock: (id: string, updates: Partial<FinishedStockLot>) => void;
  
  // Utility actions
  addUtilityLog: (log: Omit<UtilityLog, 'id'>) => void;

  // CIP actions
  addCipRecord: (record: Omit<CipRecord, 'id'>) => void;
  updateCipRecord: (id: string, updates: Partial<CipRecord>) => void;
  closeButterLot: (closure: Omit<ButterLotClosure, 'id'>) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const temperatureProfiles: Record<string, { location: string; targetMin: number; targetMax: number }> = {
  Chiller: { location: 'Chiller', targetMin: 0, targetMax: 5 },
  'Intermediate Freezer': {
    location: 'Dairy Container (Intermediate Freezer)',
    targetMin: -25,
    targetMax: -10,
  },
  'Dairy Container (Intermediate Freezer)': {
    location: 'Dairy Container (Intermediate Freezer)',
    targetMin: -25,
    targetMax: -10,
  },
  'Finished Stock Chiller': { location: 'Coldroom', targetMin: -25, targetMax: -10 },
  Coldroom: { location: 'Coldroom', targetMin: -25, targetMax: -10 },
  'Distribution Coldroom': { location: 'Distribution Coldroom', targetMin: -25, targetMax: -10 },
  'Rental Cold Storage': { location: 'Rental Cold Storage', targetMin: -25, targetMax: -10 },
};

function normalizeTemperatureReading(reading: TemperatureReading): TemperatureReading {
  if (reading.rangeNotConfigured) return { ...reading, inRange: true };
  if (reading.upperLimitOnly) return { ...reading, inRange: Number.isFinite(reading.temperature) && reading.temperature <= reading.targetMax };
  if (reading.coldChainStorageReading) {
    const hasMilkTemperature = typeof reading.milkTemperature === 'number' && Number.isFinite(reading.milkTemperature);
    const milkTemperatureInRange = hasMilkTemperature
      ? isRawMilkTemperatureInRange(reading.milkTemperature!)
      : undefined;
    return {
      ...reading,
      targetMin: RAW_MILK_TEMP_MIN_C,
      targetMax: RAW_MILK_TEMP_MAX_C,
      milkTemperatureInRange,
      // Keep storage-only records out of the excursion count. The Cold Chain
      // page labels the milk result as unrecorded rather than claiming OK.
      inRange: milkTemperatureInRange ?? true,
    };
  }

  const profile = temperatureProfiles[reading.location];
  if (!profile) return reading;

  return {
    ...reading,
    location: profile.location,
    targetMin: profile.targetMin,
    targetMax: profile.targetMax,
    inRange: reading.temperature >= profile.targetMin && reading.temperature <= profile.targetMax,
  };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [storedMilkLots, setMilkLots, , applyCommittedMilkLots] = useSupabaseState<MilkLot[]>('vejoy_milkLots', initialMilkLots);
  const [creamLots, setCreamLots] = useSupabaseState<CreamLot[]>('vejoy_creamLots', []);
  const [productionShifts, setProductionShifts] = useSupabaseState<ProductionShift[]>('vejoy_productionShifts', initialShifts);
  const [productionRounds, setProductionRounds, , applyCommittedProductionRounds] = useSupabaseState<ProductionRound[]>('vejoy_productionRounds', initialRounds);
  const milkLots = storedMilkLots.map(lot => ({
    ...lot,
    creamPool: getMilkLotCreamPool(lot, productionRounds),
    halloumiPool: lot.halloumiPool ? reconcileHcpChillerReturns(lot.halloumiPool) : undefined,
  }));
  const [storedIntermediateLots, setIntermediateLots] = useSupabaseState<IntermediateLot[]>('vejoy_intermediateLots', initialIntermediate);
  const intermediateLots = storedIntermediateLots.map(lot => lot.storageLocation === 'Intermediate Freezer'
    ? { ...lot, storageLocation: 'Dairy Container (Intermediate Freezer)' }
    : lot);
  const [storedFinishedStock, setFinishedStock, , applyCommittedFinishedStock] = useSupabaseState<FinishedStockLot[]>('vejoy_finishedStock', initialFinished);
  const finishedStock = storedFinishedStock.map(stock => {
    // Packed finished goods are staged in the dairy container until a
    // Distribution handover assigns the receiving cold store. Keep older
    // awaiting-handover snapshots using either former staging label visible
    // under the correct location without changing completed transfer history.
    if (stock.status === 'awaiting_handover' && [
      'Finished Production Stock',
      'Intermediate Freezer',
      'Dairy Container (Intermediate Freezer)',
    ].includes(stock.storageLocation)) {
      return { ...stock, storageLocation: 'Dairy Container (Finished Stock)' };
    }
    return stock;
  });
  const [storedTemperatureReadings, setTemperatureReadings] = useSupabaseState<TemperatureReading[]>('vejoy_temperatureReadings', initialTemps);
  const temperatureReadings = storedTemperatureReadings.map(normalizeTemperatureReading);
  const [wasteEvents, setWasteEvents] = useSupabaseState<WasteEvent[]>('vejoy_wasteEvents', initialWaste);
  const [utilityLogs, setUtilityLogs] = useSupabaseState<UtilityLog[]>('vejoy_utilityLogs', initialUtilities);
  const [cipRecords, setCipRecords] = useSupabaseState<CipRecord[]>('vejoy_cipRecords', initialCipRecords);
  const [butterLotClosures, setButterLotClosures] = useSupabaseState<ButterLotClosure[]>('vejoy_butterLotClosures', []);

  // Milk lot actions
  const addMilkLot = (lot: Omit<MilkLot, 'id'>) => {
    const newLot = { ...lot, id: `ml-${Date.now()}` };
    setMilkLots(currentLots => [
      ...currentLots.map(existingLot => (
        existingLot.status === 'active' || existingLot.isLatest
          ? { ...existingLot, status: 'completed' as MilkLot['status'], isLatest: false }
          : existingLot
      )),
      { ...newLot, status: 'active', isLatest: true },
    ]);
  };

  const updateMilkLot = (id: string, updates: Partial<MilkLot>) => {
    setMilkLots(currentLots => currentLots.map(lot => lot.id === id ? { ...lot, ...updates } : lot));
  };

  const recordHcpChillerReturn = (batch: CrumbingBatch) => {
    setMilkLots(currentLots => currentLots.map(lot => {
      if (lot.id !== batch.sourceBatchId || !lot.halloumiPool) return lot;
      const pool = returnHcpBalanceToPool(lot.halloumiPool, batch);
      return pool === lot.halloumiPool ? lot : { ...lot, halloumiPool: pool };
    }));
  };

  const addCreamLot = (lot: Omit<CreamLot, 'id'>) => {
    setCreamLots(currentLots => [...currentLots, { ...lot, id: `cream-${Date.now()}` }]);
  };

  const updateCreamLot = (id: string, updates: Partial<CreamLot>) => {
    setCreamLots(currentLots => currentLots.map(lot => lot.id === id ? { ...lot, ...updates } : lot));
  };

  // Shift actions
  const addProductionShift = (shift: Omit<ProductionShift, 'id'>) => {
    const newShift = { ...shift, id: `shift-${Date.now()}` };
    let created = true;
    setProductionShifts(currentShifts => {
      // A milk lot can have only one active shift with a given number. This
      // also makes rapid double-clicks and two open app tabs idempotent.
      const alreadyExists = currentShifts.some(existingShift =>
        existingShift.milkLotId === shift.milkLotId &&
        existingShift.shiftNumber === shift.shiftNumber &&
        existingShift.status === 'active'
      );
      if (alreadyExists) {
        created = false;
        return currentShifts;
      }
      return [...currentShifts, newShift];
    });
    return created;
  };

  const updateProductionShift = (id: string, updates: Partial<ProductionShift>) => {
    setProductionShifts(currentShifts => currentShifts.map(shift =>
      shift.id === id ? { ...shift, ...updates } : shift
    ));
  };

  const removeProductionShift = (id: string) => {
    if (!productionShifts.some(shift => shift.id === id)) return false;
    if (productionRounds.some(round => round.shiftId === id)) return false;
    setProductionShifts(currentShifts => currentShifts.filter(shift => shift.id !== id));
    return true;
  };

  // Production round actions
  const addProductionRound = (round: Omit<ProductionRound, 'id'>) => {
    if (isMilkProductionRound(round) && round.plannedInput <= 0) return;
    const newRound = { ...round, id: `pr-${Date.now()}` };
    setProductionRounds(currentRounds => [...currentRounds, newRound]);
  };

  const removeProductionRound = (id: string) => {
    const round = productionRounds.find(item => item.id === id);
    if (!round) return false;

    // Hard deletion is only for an untouched scheduled round. Once production
    // has started, keep the record and use cancellation instead.
    const hasEvidence = round.locked || round.status !== 'scheduled' || round.outputWeight > 0 ||
      Boolean(round.blockWeights?.length || round.packedSkus?.length || round.creamRecovered !== undefined || round.sppRecordedWeight !== undefined) ||
      intermediateLots.some(lot => lot.sourceBatchId === id);
    if (hasEvidence) return false;
    setProductionRounds(currentRounds => currentRounds.filter(item => item.id !== id));
    return true;
  };

  const cancelProductionRound = (id: string, reason?: string) => {
    const round = productionRounds.find(item => item.id === id);
    if (!round || round.locked || round.status === 'cancelled') return false;
    const cancellationNote = reason?.trim() ? `Cancellation: ${reason.trim()}` : 'Cancellation: created by mistake';
    const occurredAt = new Date().toISOString();
    const recordedBy = typeof window === 'undefined' ? 'System' : window.localStorage.getItem('vejoy_user_username') || window.localStorage.getItem('vejoy_user_role') || 'User';
    setProductionRounds(currentRounds => currentRounds.map(item => item.id === id ? {
      ...item,
      status: 'cancelled',
      locked: true,
      completedAt: occurredAt,
      notes: item.notes ? `${item.notes}\n${cancellationNote}` : cancellationNote,
      historyEvents: [...(item.historyEvents || []), {
        id: `round-event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: 'cancelled',
        stage: 'Cancelled',
        occurredAt,
        details: cancellationNote.replace(/^Cancellation:\s*/, ''),
        recordedBy,
        source: 'override',
      }],
    } : item));
    return true;
  };

  const createProductionRound = async (round: Omit<ProductionRound, 'id' | 'roundNumber'>) => {
    // Local/demo mode intentionally has no Supabase client.  It should still
    // be possible to exercise the production workflow locally; previously we
    // returned null here, which made the UI report a misleading server error.
    if (!supabase) {
      const nextRoundNumber = productionRounds
        .filter(existingRound => existingRound.shiftId === round.shiftId)
        .reduce((highest, existingRound) => Math.max(highest, existingRound.roundNumber || 0), 0) + 1;
      const localRound: ProductionRound = {
        ...round,
        id: `pr-${Date.now()}`,
        roundNumber: nextRoundNumber,
      };
      setProductionRounds(current => [...current, localRound]);
      return localRound;
    }

    const { data, error } = await supabase.rpc('create_production_round', { round_input: round });
    if (error) {
      console.error('Error creating production round:', error);
      throw new Error(error.message || 'The server could not create this round');
    }
    if (!data) {
      throw new Error('The server returned no round after creation');
    }
    const committedRound = data as ProductionRound;
    applyCommittedProductionRounds(current => current.some(item => item.id === committedRound.id)
      ? current.map(item => item.id === committedRound.id ? committedRound : item)
      : [...current, committedRound]);
    return committedRound;
  };

  const createGheeRound = async (request: GheeRoundRequest) => {
    if (!supabase) return null;
    const saved = await persistGheeRound(supabase, request);
    const updates = new Map([...saved.sourceRounds, saved.round].map(round => [round.id, round]));
    applyCommittedProductionRounds(current => {
      const next = current.map(round => updates.get(round.id) || round);
      return current.some(round => round.id === saved.round.id) ? next : [...next, saved.round];
    });
    if (saved.milkLot) {
      const lot = saved.milkLot;
      applyCommittedMilkLots(current => current.map(item => item.id === lot.id ? lot : item));
    }
    return saved.round;
  };

  const commitPaneerPacking = async (request: PaneerPackingRequest) => {
    if (!supabase) return null; // Existing browser-only demo behavior is retained.
    const saved = await persistPaneerPacking(supabase, request);
    applyCommittedProductionRounds(current => current.map(round => round.id === saved.round.id ? saved.round : round));
    if (saved.stock) {
      const stock = saved.stock;
      applyCommittedFinishedStock(current => current.some(item => item.id === stock.id)
        ? current.map(item => item.id === stock.id ? stock : item) : [...current, stock]);
    }
    return saved.round;
  };

  const updateProductionRound = (id: string, updates: Partial<ProductionRound>) => {
    setProductionRounds(currentRounds => currentRounds.map(round => {
      if (round.id !== id) return round;
      const nextRound = { ...round, ...updates };
      // A milk-production round must always retain a positive planned input.
      // Actual input may remain zero while a scheduled round is waiting to
      // start, but a zero planned input would make the milk ledger silently
      // under-account the round.
      if (isMilkProductionRound(nextRound) && nextRound.plannedInput <= 0) return round;
      return round.paneerIngredientIssues?.length
        ? recordPaneerIngredientAllocation(nextRound, new Date().toISOString(),
          typeof window === 'undefined' ? 'System' : window.localStorage.getItem('vejoy_user_username') || 'User',
          'Round milk quantity or type corrected; standard allocation reconciled')
        : nextRound;
    }));
  };

  const recordProductionRoundActivity: AppContextType['recordProductionRoundActivity'] = (id, updates, event) => {
    setProductionRounds(currentRounds => currentRounds.map(round => {
      if (round.id !== id) return round;
      const occurredAt = event.occurredAt || new Date().toISOString();
      const nextRound: ProductionRound = {
        ...round,
        ...updates,
        historyEvents: [...(round.historyEvents || []), {
          ...event,
          id: `round-event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          occurredAt,
        }],
      };
      if (isMilkProductionRound(nextRound) && nextRound.plannedInput <= 0) return round;
      return recordPaneerIngredientAllocation(nextRound, occurredAt, event.recordedBy || 'User',
        updates.status === 'in_production' ? 'Ingredients issued when vat selection and production start were confirmed' : event.details,
        round.status === 'scheduled' && updates.status === 'in_production' && Boolean(updates.vat));
    }));
  };

  const requestProductionRoundTypeChange = async (id: string, newType: 'D' | 'C/S', reason: string) => {
    const round = productionRounds.find(item => item.id === id);
    if (!round || (round.type !== 'D' && round.type !== 'C/S')) {
      throw new Error('Only Paneer rounds can be changed between C/S and Direct');
    }
    if (round.type === newType) {
      throw new Error('The round already has that type');
    }
    if (round.locked || ['handed_over', 'cancelled', 'spoiled'].includes(round.status)) {
      throw new Error('Locked or closed rounds cannot be reclassified');
    }
    if (round.typeChangeRequest?.status === 'pending') {
      throw new Error('This round already has a pending type-change request');
    }
    if (reason.trim().length < 5) {
      throw new Error('Enter a reason of at least 5 characters');
    }

    if (supabase) {
      const { data, error } = await supabase.rpc('request_production_round_type_change', {
        round_id: id,
        new_type: newType,
        reason: reason.trim(),
      });
      if (error) {
        console.error('Error changing production round type:', error);
        throw new Error(error.message || 'The server could not submit this type-change request');
      }
      if (!data) throw new Error('The server returned no updated round');
      applyCommittedProductionRounds(current => current.map(item => item.id === id ? data as ProductionRound : item));
      return true;
    }

    const changedAt = new Date().toISOString();
    const changedBy = typeof window === 'undefined' ? 'local user' : window.localStorage.getItem('vejoy_user_username') || 'local user';
    setProductionRounds(current => current.map(item => item.id === id ? {
      ...item,
      typeChangeRequest: {
        status: 'pending',
        from: item.type as 'D' | 'C/S',
        to: newType,
        reason: reason.trim(),
        requestedAt: changedAt,
        requestedBy: changedBy,
      },
    } : item));
    return true;
  };

  const reviewProductionRoundTypeChange = async (id: string, decision: 'approve' | 'reject', decisionReason = '') => {
    const round = productionRounds.find(item => item.id === id);
    const request = round?.typeChangeRequest;
    if (!round || !request || request.status !== 'pending') {
      throw new Error('There is no pending type-change request for this round');
    }
    const conflict = getProductionRoundTypeChangeConflict(round, intermediateLots, finishedStock);
    if (decision === 'approve' && conflict) {
      throw new Error(`Approval is blocked because ${conflict}`);
    }

    if (supabase) {
      const { data, error } = await supabase.rpc('review_production_round_type_change', {
        round_id: id,
        decision,
        decision_reason: decisionReason.trim() || null,
      });
      if (error) {
        console.error('Error reviewing production round type change:', error);
        throw new Error(error.message || 'The server could not review this type-change request');
      }
      if (!data) throw new Error('The server returned no reviewed round');
      applyCommittedProductionRounds(current => current.map(item => item.id === id ? data as ProductionRound : item));
      if (decision === 'approve' && (data as ProductionRound).paneerIngredientIssues?.length) {
        const reviewed = data as ProductionRound;
        setProductionRounds(current => current.map(item => item.id === id
          ? recordPaneerIngredientAllocation(item, reviewed.typeChangeRequest?.decidedAt || new Date().toISOString(),
            reviewed.typeChangeRequest?.decidedBy || 'Admin', 'Approved paneer type correction; standard allocation reconciled')
          : item));
      }
      return true;
    }

    const now = new Date().toISOString();
    const decidedBy = typeof window === 'undefined' ? 'local admin' : window.localStorage.getItem('vejoy_user_username') || 'local admin';
    if (decision === 'reject') {
      setProductionRounds(current => current.map(item => item.id === id ? {
        ...item,
        typeChangeRequest: { ...request, status: 'rejected', decidedAt: now, decidedBy, decisionReason: decisionReason.trim() || undefined },
      } : item));
      return true;
    }

    setProductionRounds(current => current.map(item => item.id === id ? recordPaneerIngredientAllocation({
      ...item,
      type: request.to,
      typeChangeRequest: { ...request, status: 'approved', decidedAt: now, decidedBy, decisionReason: decisionReason.trim() || undefined },
      typeChangeHistory: [
        ...(item.typeChangeHistory || []),
        { from: request.from, to: request.to, changedAt: now, changedBy: decidedBy, reason: request.reason, requestedBy: request.requestedBy, requestedAt: request.requestedAt, decision: 'approved' },
      ],
    }, now, decidedBy, 'Approved paneer type correction; standard allocation reconciled') : item));
    return true;
  };

  const advanceRoundStatus = (id: string) => {
    setProductionRounds(currentRounds => currentRounds.map(round => {
      if (round.id !== id) return round;
      const currentIndex = statusFlow.indexOf(round.status as any);
      if (currentIndex === -1 || currentIndex >= statusFlow.length - 1) return round;
      const nextStatus = statusFlow[currentIndex + 1];
      return { 
        ...round, 
        status: nextStatus as ProductionRound['status'],
        locked: round.locked,
      };
    }));
  };

  const forceAdvanceRoundStatus = async (id: string) => {
    if (!supabase) return false;
    const { data, error } = await supabase.rpc('force_production_round_next_stage', { round_id: id });
    if (error || !data) {
      console.error('Error forcing round stage:', error);
      return false;
    }
    applyCommittedProductionRounds(current => current.map(round => round.id === id ? data as ProductionRound : round));
    return true;
  };

  const recordRoundOutput = (id: string, outputWeight: number, notes?: string) => {
    setProductionRounds(currentRounds => currentRounds.map(round =>
      round.id === id ? { ...round, outputWeight, notes: notes || round.notes } : round
    ));
  };

  // Temperature actions
  const addTemperatureReading = (reading: Omit<TemperatureReading, 'id' | 'inRange'>) => {
    const milkTemperatureInRange = reading.coldChainStorageReading && typeof reading.milkTemperature === 'number'
      ? isRawMilkTemperatureInRange(reading.milkTemperature)
      : undefined;
    const inRange = reading.rangeNotConfigured ? true : reading.upperLimitOnly ? reading.temperature <= reading.targetMax : reading.coldChainStorageReading
      ? milkTemperatureInRange ?? true
      : reading.temperature >= reading.targetMin && reading.temperature <= reading.targetMax;
    const newReading = { ...reading, milkTemperatureInRange, id: `t-${crypto.randomUUID()}`, inRange };
    setTemperatureReadings(currentReadings => [...currentReadings, newReading]);
  };

  // Waste actions
  const addWasteEvent = (event: Omit<WasteEvent, 'id'>) => {
    const newEvent = { ...event, id: `w-${Date.now()}` };
    setWasteEvents(currentEvents => [...currentEvents, newEvent]);

    // Liquid raw-milk waste must reduce the linked receiving lot. The waste
    // event remains the audit record, while these lot counters keep the
    // receiving balance and its reconciliation view in sync.
    const isMilkWaste = event.unit.toLowerCase() === 'l'
      && /milk/i.test(event.product)
      && Boolean(event.batchCode?.trim());
    if (isMilkWaste) {
      const isSpillage = /spill/i.test(event.reason);
      setMilkLots(currentLots => currentLots.map(lot => {
        const batchCode = event.batchCode?.trim();
        if (lot.id !== batchCode && lot.lotCode !== batchCode) return lot;
        const updatedLot = {
          ...lot,
          litresRejected: isSpillage ? lot.litresRejected : lot.litresRejected + event.quantity,
          litresSpilled: isSpillage ? lot.litresSpilled + event.quantity : lot.litresSpilled,
        };
        return {
          ...updatedLot,
          litresRemaining: getMilkLotAccounting(updatedLot, productionRounds).remaining,
        };
      }));
    }
  };

  const updateWasteEvent = (id: string, updates: Partial<WasteEvent>) => {
    const previousEvent = wasteEvents.find(event => event.id === id);
    if (!previousEvent) return;
    const updatedEvent = { ...previousEvent, ...updates };
    setWasteEvents(currentEvents => currentEvents.map(event => event.id === id ? updatedEvent : event));

    // Keep the receiving ledger synchronized when a linked raw-milk waste
    // record is corrected. Apply a delta rather than replacing the total so
    // legacy/manual ledger entries that have no waste event remain intact.
    const getMilkWasteCategory = (event: WasteEvent): 'rejected' | 'spilled' | null => {
      if (event.unit.toLowerCase() !== 'l' || !/milk/i.test(event.product) || !event.batchCode?.trim()) return null;
      return /spill/i.test(event.reason) ? 'spilled' : 'rejected';
    };
    const previousCategory = getMilkWasteCategory(previousEvent);
    const updatedCategory = getMilkWasteCategory(updatedEvent);
    if (!previousCategory && !updatedCategory) return;

    setMilkLots(currentLots => currentLots.map(lot => {
      let rejectedDelta = 0;
      let spilledDelta = 0;
      const previousBatchCode = previousEvent.batchCode?.trim();
      const updatedBatchCode = updatedEvent.batchCode?.trim();
      const matchesPreviousLot = lot.id === previousBatchCode || lot.lotCode === previousBatchCode;
      const matchesUpdatedLot = lot.id === updatedBatchCode || lot.lotCode === updatedBatchCode;
      if (matchesPreviousLot && previousCategory === 'rejected') rejectedDelta -= previousEvent.quantity;
      if (matchesPreviousLot && previousCategory === 'spilled') spilledDelta -= previousEvent.quantity;
      if (matchesUpdatedLot && updatedCategory === 'rejected') rejectedDelta += updatedEvent.quantity;
      if (matchesUpdatedLot && updatedCategory === 'spilled') spilledDelta += updatedEvent.quantity;
      if (rejectedDelta === 0 && spilledDelta === 0) return lot;

      const updatedLot = {
        ...lot,
        litresRejected: Math.max(0, lot.litresRejected + rejectedDelta),
        litresSpilled: Math.max(0, lot.litresSpilled + spilledDelta),
      };
      return {
        ...updatedLot,
        litresRemaining: getMilkLotAccounting(updatedLot, productionRounds).remaining,
      };
    }));
  };

  // Intermediate lot actions
  const addIntermediateLot = (lot: Omit<IntermediateLot, 'id'>) => {
    const newLot = { ...lot, id: `il-${Date.now()}` };
    setIntermediateLots(currentLots => [...currentLots, newLot]);
  };

  const updateIntermediateLot = (id: string, updates: Partial<IntermediateLot>) => {
    setIntermediateLots(currentLots => currentLots.map(lot =>
      lot.id === id ? { ...lot, ...updates } : lot
    ));
  };

  // Finished stock actions
  const addFinishedStock = (stock: Omit<FinishedStockLot, 'id'>) => {
    const uniqueId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${stock.packingRunId}`;
    const newStock = { ...stock, id: `fs-${uniqueId}` };
    setFinishedStock(currentStock => [...currentStock, newStock]);
  };

  const updateFinishedStock = (id: string, updates: Partial<FinishedStockLot>) => {
    setFinishedStock(currentStock => currentStock.map(stock =>
      stock.id === id ? { ...stock, ...updates } : stock
    ));
  };

  // Utility actions
  const addUtilityLog = (log: Omit<UtilityLog, 'id'>) => {
    const newLog = { ...log, id: `u-${Date.now()}` };
    setUtilityLogs(currentLogs => [...currentLogs, newLog]);
  };

  // CIP actions
  const addCipRecord = (record: Omit<CipRecord, 'id'>) => {
    const newRecord = { ...record, id: `cip-${Date.now()}` };
    setCipRecords(currentRecords => {
      const alreadyRecorded = currentRecords.some(existing =>
        existing.frequency === record.frequency && (
          record.frequency === 'daily'
            ? existing.shiftId === record.shiftId
            : existing.milkLotId === record.milkLotId
        )
      );
      return alreadyRecorded ? currentRecords : [...currentRecords, newRecord];
    });
  };

  const updateCipRecord = (id: string, updates: Partial<CipRecord>) => {
    setCipRecords(currentRecords => currentRecords.map(record =>
      record.id === id ? { ...record, ...updates } : record
    ));
  };

  const closeButterLot = (closure: Omit<ButterLotClosure, 'id'>) => {
    const id = `${closure.sourceType}:${closure.sourceLotId}`;
    setButterLotClosures(current => current.some(existing => existing.id === id)
      ? current
      : [...current, { ...closure, id }]);
  };

  const value: AppContextType = {
    milkLots,
    creamLots,
    productionShifts,
    productionRounds,
    intermediateLots,
    finishedStock,
    temperatureReadings,
    wasteEvents,
    utilityLogs,
    cipRecords,
    butterLotClosures,
    addMilkLot,
    updateMilkLot,
    recordHcpChillerReturn,
    addCreamLot,
    updateCreamLot,
    addProductionShift,
    removeProductionShift,
    updateProductionShift,
    addProductionRound,
    createProductionRound,
    removeProductionRound,
    cancelProductionRound,
    updateProductionRound,
    commitPaneerPacking,
    createGheeRound,
    recordProductionRoundActivity,
    requestProductionRoundTypeChange,
    reviewProductionRoundTypeChange,
    advanceRoundStatus,
    forceAdvanceRoundStatus,
    recordRoundOutput,
    addTemperatureReading,
    addWasteEvent,
    updateWasteEvent,
    addIntermediateLot,
    updateIntermediateLot,
    addFinishedStock,
    updateFinishedStock,
    addUtilityLog,
    addCipRecord,
    updateCipRecord,
    closeButterLot,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
