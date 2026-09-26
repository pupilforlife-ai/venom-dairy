import { createContext, useContext, ReactNode } from 'react';
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
  statusFlow
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
}

interface AppContextType extends AppState {
  // Milk lot actions
  addMilkLot: (lot: Omit<MilkLot, 'id'>) => void;
  updateMilkLot: (id: string, updates: Partial<MilkLot>) => void;
  addCreamLot: (lot: Omit<CreamLot, 'id'>) => void;
  updateCreamLot: (id: string, updates: Partial<CreamLot>) => void;
  
  // Shift actions
  addProductionShift: (shift: Omit<ProductionShift, 'id'>) => void;
  updateProductionShift: (id: string, updates: Partial<ProductionShift>) => void;
  
  // Production round actions
  addProductionRound: (round: Omit<ProductionRound, 'id'>) => void;
  createProductionRound: (round: Omit<ProductionRound, 'id' | 'roundNumber'>) => Promise<ProductionRound | null>;
  updateProductionRound: (id: string, updates: Partial<ProductionRound>) => void;
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
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [milkLots, setMilkLots] = useSupabaseState<MilkLot[]>('vejoy_milkLots', initialMilkLots);
  const [creamLots, setCreamLots] = useSupabaseState<CreamLot[]>('vejoy_creamLots', []);
  const [productionShifts, setProductionShifts] = useSupabaseState<ProductionShift[]>('vejoy_productionShifts', initialShifts);
  const [productionRounds, setProductionRounds] = useSupabaseState<ProductionRound[]>('vejoy_productionRounds', initialRounds);
  const [intermediateLots, setIntermediateLots] = useSupabaseState<IntermediateLot[]>('vejoy_intermediateLots', initialIntermediate);
  const [finishedStock, setFinishedStock] = useSupabaseState<FinishedStockLot[]>('vejoy_finishedStock', initialFinished);
  const [temperatureReadings, setTemperatureReadings] = useSupabaseState<TemperatureReading[]>('vejoy_temperatureReadings', initialTemps);
  const [wasteEvents, setWasteEvents] = useSupabaseState<WasteEvent[]>('vejoy_wasteEvents', initialWaste);
  const [utilityLogs, setUtilityLogs] = useSupabaseState<UtilityLog[]>('vejoy_utilityLogs', initialUtilities);

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
    setProductionShifts([...productionShifts, newShift]);
  };

  const updateProductionShift = (id: string, updates: Partial<ProductionShift>) => {
    setProductionShifts(productionShifts.map(shift => 
      shift.id === id ? { ...shift, ...updates } : shift
    ));
  };

  // Production round actions
  const addProductionRound = (round: Omit<ProductionRound, 'id'>) => {
    const newRound = { ...round, id: `pr-${Date.now()}` };
    setProductionRounds([...productionRounds, newRound]);
  };

  const createProductionRound = async (round: Omit<ProductionRound, 'id' | 'roundNumber'>) => {
    if (!supabase) return null;
    const { data, error } = await supabase.rpc('create_production_round', { round_input: round });
    if (error || !data) { console.error('Error creating production round:', error); return null; }
    setProductionRounds(current => [...current, data as ProductionRound]);
    return data as ProductionRound;
  };

  const updateProductionRound = (id: string, updates: Partial<ProductionRound>) => {
    setProductionRounds(currentRounds => currentRounds.map(round =>
      round.id === id ? { ...round, ...updates } : round
    ));
  };

  const advanceRoundStatus = (id: string) => {
    setProductionRounds(productionRounds.map(round => {
      if (round.id !== id) return round;
      const currentIndex = statusFlow.indexOf(round.status as any);
      if (currentIndex === -1 || currentIndex >= statusFlow.length - 1) return round;
      const nextStatus = statusFlow[currentIndex + 1];
      return { 
        ...round, 
        status: nextStatus as ProductionRound['status'],
        locked: nextStatus === 'handed_over'
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
    setProductionRounds(productionRounds.map(round => 
      round.id === id ? { ...round, outputWeight, notes: notes || round.notes } : round
    ));
  };

  // Temperature actions
  const addTemperatureReading = (reading: Omit<TemperatureReading, 'id' | 'inRange'>) => {
    const inRange = reading.temperature >= reading.targetMin && reading.temperature <= reading.targetMax;
    const newReading = { ...reading, id: `t-${Date.now()}`, inRange };
    setTemperatureReadings([...temperatureReadings, newReading]);
  };

  // Waste actions
  const addWasteEvent = (event: Omit<WasteEvent, 'id'>) => {
    const newEvent = { ...event, id: `w-${Date.now()}` };
    setWasteEvents([...wasteEvents, newEvent]);
  };

  // Intermediate lot actions
  const addIntermediateLot = (lot: Omit<IntermediateLot, 'id'>) => {
    const newLot = { ...lot, id: `il-${Date.now()}` };
    setIntermediateLots([...intermediateLots, newLot]);
  };

  const updateIntermediateLot = (id: string, updates: Partial<IntermediateLot>) => {
    setIntermediateLots(intermediateLots.map(lot => 
      lot.id === id ? { ...lot, ...updates } : lot
    ));
  };

  // Finished stock actions
  const addFinishedStock = (stock: Omit<FinishedStockLot, 'id'>) => {
    const newStock = { ...stock, id: `fs-${Date.now()}` };
    setFinishedStock([...finishedStock, newStock]);
  };

  const updateFinishedStock = (id: string, updates: Partial<FinishedStockLot>) => {
    setFinishedStock(finishedStock.map(stock => 
      stock.id === id ? { ...stock, ...updates } : stock
    ));
  };

  // Utility actions
  const addUtilityLog = (log: Omit<UtilityLog, 'id'>) => {
    const newLog = { ...log, id: `u-${Date.now()}` };
    setUtilityLogs([...utilityLogs, newLog]);
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
    addMilkLot,
    updateMilkLot,
    addCreamLot,
    updateCreamLot,
    addProductionShift,
    updateProductionShift,
    addProductionRound,
    createProductionRound,
    updateProductionRound,
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
