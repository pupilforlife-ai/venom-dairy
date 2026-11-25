import type {MilkLot,ProductionShift} from '../data/mockData';
import {validDate} from './domain';

// Read-only fallback for lots created before production dates were recorded.
// Use the lot's first shift, never the receipt date or a later round's date.
export function lotsWithRecordedProductionStart(lots:MilkLot[],shifts:ProductionShift[]):MilkLot[] {
 return lots.map(lot=>{
  if(lot.traceabilityProductionDate)return lot;
  const dates=new Set(shifts.filter(s=>s.shiftNumber===1&&s.status!=='scheduled'&&(s.milkLotId===lot.id||(!s.milkLotId&&s.milkLotCode===lot.lotCode))).flatMap(s=>{
   if(!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/.test(s.startedAt))return [];
   const time=new Date(s.startedAt);if(!Number.isFinite(time.getTime()))return [];
   const date=time.toLocaleDateString('en-CA',{timeZone:'Africa/Johannesburg'});return validDate(date)?[date]:[];
  }));
  return dates.size===1?{...lot,traceabilityProductionDate:[...dates][0]}:lot;
 });
}
