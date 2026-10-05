import { createContext, useContext, ReactNode, useEffect } from 'react';
import { useSupabaseState } from '../hooks/useSupabaseState';
import { supabase } from '../lib/supabase';
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
  IntermediateLot,
  FinishedStockLot,
  TemperatureReading,
  WasteEvent,
  UtilityLog,
  CipRecord,
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
}

interface AppContextType extends AppState {
  // Milk lot actions
  addMilkLot: (lot: Omit<MilkLot, 'id'>) => void;
  updateMilkLot: (id: string, updates: Partial<MilkLot>) => void;
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
  requestProductionRoundTypeChange: (id: string, newType: 'D' | 'C/S', reason: string) => Promise<boolean>;
  reviewProductionRoundTypeChange: (id: string, decision: 'approve' | 'reject', decisionReason?: string) => Promise<boolean>;
  advanceRoundStatus: (id: string) => void;
  forceAdvanceRoundStatus: (id: string) => Promise<boolean>;
  recordRoundOutput: (id: string, outputWeight: number, notes?: string) => void;
  
  // Temperature actions
  addTemperatureReading: (reading: Omit<TemperatureReading, 'id' | 'inRange'>) => void;
  
  // Waste actions
  addWasteEvent: (event: Omit<WasteEvent, 'id'>) => void;
  
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
  const [storedMilkLots, setMilkLots, milkLotsLoaded] = useSupabaseState<MilkLot[]>('vejoy_milkLots', initialMilkLots);
  const [creamLots, setCreamLots] = useSupabaseState<CreamLot[]>('vejoy_creamLots', []);
  const [productionShifts, setProductionShifts] = useSupabaseState<ProductionShift[]>('vejoy_productionShifts', initialShifts);
  const [productionRounds, setProductionRounds, productionRoundsLoaded] = useSupabaseState<ProductionRound[]>('vejoy_productionRounds', initialRounds);
  const milkLots = storedMilkLots.map(lot => ({
    ...lot,
    creamPool: getMilkLotCreamPool(lot, productionRounds),
  }));
  useEffect(() => {
    // Keep the persisted pool snapshot correct for exports and direct database
    // audits, while every screen continues to calculate from the round ledger.
    // Wait for both collections to load so a slow initial rounds request can
    // never replace a valid pool with an empty total.
    if (!milkLotsLoaded || !productionRoundsLoaded) return;
    const needsReconciliation = storedMilkLots.some(lot =>
      JSON.stringify(lot.creamPool) !== JSON.stringify(getMilkLotCreamPool(lot, productionRounds))
    );
    if (!needsReconciliation) return;

    setMilkLots(currentLots => currentLots.map(lot => ({
      ...lot,
      creamPool: getMilkLotCreamPool(lot, productionRounds),
    })));
  }, [milkLotsLoaded, productionRounds, productionRoundsLoaded, storedMilkLots]);
  const [storedIntermediateLots, setIntermediateLots] = useSupabaseState<IntermediateLot[]>('vejoy_intermediateLots', initialIntermediate);
  const intermediateLots = storedIntermediateLots.map(lot => lot.storageLocation === 'Intermediate Freezer'
    ? { ...lot, storageLocation: 'Dairy Container (Intermediate Freezer)' }
    : lot);
  const [storedFinishedStock, setFinishedStock] = useSupabaseState<FinishedStockLot[]>('vejoy_finishedStock', initialFinished);
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
    setProductionRounds(currentRounds => currentRounds.map(item => item.id === id ? {
      ...item,
      status: 'cancelled',
      locked: true,
      completedAt: new Date().toISOString(),
      notes: item.notes ? `${item.notes}\n${cancellationNote}` : cancellationNote,
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
    setProductionRounds(current => [...current, data as ProductionRound]);
    return data as ProductionRound;
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
      return nextRound;
    }));
  };

  const hasRoundTypeDownstreamEvidence = (round: ProductionRound) => Boolean(
    round.outputWeight > 0 ||
    round.blockWeights?.length ||
    round.packedSkus?.length ||
    round.creamRecovered !== undefined ||
    round.sppRecordedWeight !== undefined ||
    round.cuttingType ||
    round.remainingBalance !== undefined ||
    intermediateLots.some(lot => lot.sourceBatchId === round.id)
  );

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
      setProductionRounds(current => current.map(item => item.id === id ? data as ProductionRound : item));
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
    if (decision === 'approve' && hasRoundTypeDownstreamEvidence(round)) {
      throw new Error('Approval is blocked because cutting, output, cream, packing, or downstream stock is already recorded');
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
      setProductionRounds(current => current.map(item => item.id === id ? data as ProductionRound : item));
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

    setProductionRounds(current => current.map(item => item.id === id ? {
      ...item,
      type: request.to,
      typeChangeRequest: { ...request, status: 'approved', decidedAt: now, decidedBy, decisionReason: decisionReason.trim() || undefined },
      typeChangeHistory: [
        ...(item.typeChangeHistory || []),
        { from: request.from, to: request.to, changedAt: now, changedBy: decidedBy, reason: request.reason, requestedBy: request.requestedBy, requestedAt: request.requestedAt, decision: 'approved' },
      ],
    } : item));
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
    setProductionRounds(current => current.map(round => round.id === id ? data as ProductionRound : round));
    return true;
  };

  const recordRoundOutput = (id: string, outputWeight: number, notes?: string) => {
    setProductionRounds(currentRounds => currentRounds.map(round =>
      round.id === id ? { ...round, outputWeight, notes: notes || round.notes } : round
    ));
  };

  // Temperature actions
  const addTemperatureReading = (reading: Omit<TemperatureReading, 'id' | 'inRange'>) => {
    const inRange = reading.temperature >= reading.targetMin && reading.temperature <= reading.targetMax;
    const newReading = { ...reading, id: `t-${Date.now()}`, inRange };
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
    addMilkLot,
    updateMilkLot,
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
    requestProductionRoundTypeChange,
    reviewProductionRoundTypeChange,
    advanceRoundStatus,
    forceAdvanceRoundStatus,
    recordRoundOutput,
    addTemperatureReading,
    addWasteEvent,
    addIntermediateLot,
    updateIntermediateLot,
    addFinishedStock,
    updateFinishedStock,
    addUtilityLog,
    addCipRecord,
    updateCipRecord,
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
