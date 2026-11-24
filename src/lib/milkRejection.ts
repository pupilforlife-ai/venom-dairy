import { getMilkLotAccounting, type MilkLot, type ProductionRound, type MilkBalanceSnapshot, type MilkBalanceReview } from '../data/mockData';

export function milkRejectionQuote(lot: MilkLot, rounds: ProductionRound[]): MilkBalanceSnapshot {
  const a=getMilkLotAccounting(lot,rounds);
  return {received:lot.litresReceived,consumed:a.consumed,rejected:lot.litresRejected,spilled:lot.litresSpilled,sold:a.sold,remaining:a.remaining,overdraw:a.overdraw};
}
export interface MilkRejectionRequest { lotId:string; expected:MilkBalanceSnapshot; quantity:number; rejectionDate:string; reason:string }
const litres=(n:number)=>Math.round(n*1e6)/1e6;
export function recordMilkRejection(lots:MilkLot[],rounds:ProductionRound[],p:MilkRejectionRequest,actor:string,role:string,at:string,id:string) {
  if(!['owner','admin'].includes(role))throw Error('Only Owner/Admin can record rejected milk.');
  const lot=lots.find(l=>l.id===p.lotId);if(!lot)throw Error('Milk lot not found.');
  if(lot.receiptStatus==='planned'||lot.litresReceived<=0)throw Error('Record the delivered milk volume before recording a rejection.');
  const before=milkRejectionQuote(lot,rounds);
  if(!p.expected||Object.entries(before).some(([key,value])=>p.expected[key as keyof MilkBalanceSnapshot]!==value))throw Error('The milk balance changed. Reopen Reject milk and check the current balance.');
  if(!Number.isFinite(p.quantity)||p.quantity<=0)throw Error('Enter the rejected litres, greater than zero.');
  if(p.quantity>before.remaining)throw Error(`Only ${before.remaining.toLocaleString()} L remains unaccounted for. Review existing production, sales or rejection records first.`);
  if(typeof p.reason!=='string'||p.reason.trim().length<3)throw Error('Enter a reason for rejecting the milk.');
  if(typeof p.rejectionDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(p.rejectionDate)||!Number.isFinite(Date.parse(p.rejectionDate))||new Date(p.rejectionDate).toISOString().slice(0,10)!==p.rejectionDate)throw Error('Enter a valid rejection date.');
  const rejected=litres(before.rejected+p.quantity),remaining=litres(before.remaining-p.quantity);
  const after={...before,rejected,remaining,overdraw:0};
  const review:MilkBalanceReview={id:'milk-rejection-'+id,kind:'milk_rejection',eventDate:p.rejectionDate,rejectedLitres:p.quantity,reviewedAt:at,reviewedBy:actor,reviewerRole:role as 'owner'|'admin',reason:p.reason.trim(),before,after,roundCorrections:[]};
  const allRejected=Math.abs(rejected-before.received)<0.000001&&before.consumed===0&&before.sold===0&&before.spilled===0;
  return lots.map(l=>l.id!==lot.id?l:{...l,litresRejected:rejected,litresRemaining:remaining,status:allRejected?'rejected' as const:l.status,milkBalanceReviews:[...(l.milkBalanceReviews||[]),review]});
}
