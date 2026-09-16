import { createContext, useContext, ReactNode } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { 
  milkLots as initialMilkLots, 
  productionRounds as initialRounds,
  intermediateLots as initialIntermediate,
  finishedStock as initialFinished,
  temperatureReadings as initialTemps,
  wasteEvents as initialWaste,
  MilkLot,
  ProductionRound,
  IntermediateLot,
  FinishedStockLot,
  TemperatureReading,
  WasteEvent,
  statusFlow
} from '../data/mockData';

interface AppState {
  milkLots: MilkLot[];
  productionRounds: ProductionRound[];
  intermediateLots: IntermediateLot[];
  finishedStock: FinishedStockLot[];
  temperatureReadings: TemperatureReading[];
  wasteEvents: WasteEvent[];
}

interface AppContextType extends AppState {
  // Milk lot actions
  addMilkLot: (lot: Omit<MilkLot, 'id'>) => void;
  updateMilkLot: (id: string, updates: Partial<MilkLot>) => void;
  
  // Production round actions
  addProductionRound: (round: Omit<ProductionRound, 'id'>) => void;
  updateProductionRound: (id: string, updates: Partial<ProductionRound>) => void;
  advanceRoundStatus: (id: string) => void;
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
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [milkLots, setMilkLots] = useLocalStorage<MilkLot[]>('vejoy_milkLots', initialMilkLots);
  const [productionRounds, setProductionRounds] = useLocalStorage<ProductionRound[]>('vejoy_productionRounds', initialRounds);
  const [intermediateLots, setIntermediateLots] = useLocalStorage<IntermediateLot[]>('vejoy_intermediateLots', initialIntermediate);
  const [finishedStock, setFinishedStock] = useLocalStorage<FinishedStockLot[]>('vejoy_finishedStock', initialFinished);
  const [temperatureReadings, setTemperatureReadings] = useLocalStorage<TemperatureReading[]>('vejoy_temperatureReadings', initialTemps);
  const [wasteEvents, setWasteEvents] = useLocalStorage<WasteEvent[]>('vejoy_wasteEvents', initialWaste);

  // Milk lot actions
  const addMilkLot = (lot: Omit<MilkLot, 'id'>) => {
    const newLot = { ...lot, id: `ml-${Date.now()}` };
    setMilkLots([...milkLots, newLot]);
  };

  const updateMilkLot = (id: string, updates: Partial<MilkLot>) => {
    setMilkLots(milkLots.map(lot => lot.id === id ? { ...lot, ...updates } : lot));
  };

  // Production round actions
  const addProductionRound = (round: Omit<ProductionRound, 'id'>) => {
    const newRound = { ...round, id: `pr-${Date.now()}` };
    setProductionRounds([...productionRounds, newRound]);
  };

  const updateProductionRound = (id: string, updates: Partial<ProductionRound>) => {
    setProductionRounds(productionRounds.map(round => 
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

  const value: AppContextType = {
    milkLots,
    productionRounds,
    intermediateLots,
    finishedStock,
    temperatureReadings,
    wasteEvents,
    addMilkLot,
    updateMilkLot,
    addProductionRound,
    updateProductionRound,
    advanceRoundStatus,
    recordRoundOutput,
    addTemperatureReading,
    addWasteEvent,
    addIntermediateLot,
    updateIntermediateLot,
    addFinishedStock,
    updateFinishedStock,
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
