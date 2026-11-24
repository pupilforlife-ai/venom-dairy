import {describe,it,expect} from 'vitest';
import {recordMilkRejection,milkRejectionQuote} from './milkRejection';
import {getMilkLotAccounting,type MilkLot,type ProductionRound} from '../data/mockData';
import {getMilkLotVesselBalances} from './milkVesselAllocation';
const lot=():MilkLot=>({id:'milk-191126',lotCode:'191126',receiptDate:'2026-11-19',receiptStatus:'received',supplier:'Test dairy',litresReceived:26000,litresConsumed:0,litresRemaining:26000,litresRejected:0,litresSpilled:0,status:'completed'});
const at='2026-11-24T10:00:00Z';
const request=(l=lot(),rounds:ProductionRound[]=[])=>({lotId:l.id,expected:milkRejectionQuote(l,rounds),quantity:26000,rejectionDate:'2026-11-19',reason:'Milk quality rejected on receipt'});
describe('audited milk rejection',()=>{
 it('rejects a complete earlier lot while preserving the original delivered volume and unrelated data',()=>{
  const l=lot(),other={...lot(),id:'new-lot',lotCode:'241126'},before=JSON.stringify(l);
  const [saved,untouched]=recordMilkRejection([l,other],[],request(),'owner','owner',at,'op');
  expect(saved).toMatchObject({status:'rejected',litresReceived:26000,litresRejected:26000,litresRemaining:0,receiptStatus:'received'});
  expect(saved.milkBalanceReviews?.[0]).toMatchObject({kind:'milk_rejection',eventDate:'2026-11-19',rejectedLitres:26000,reviewedAt:at,reviewedBy:'owner',reviewerRole:'owner',before:{remaining:26000,rejected:0},after:{remaining:0,rejected:26000}});
  expect(untouched).toBe(other);expect(JSON.stringify(l)).toBe(before);
  expect(getMilkLotAccounting(saved,[]).remaining).toBe(0);
  expect(getMilkLotVesselBalances(saved,[]).remainingLitres).toBe(0);
 });
 it('supports partial rejection without discarding production, sales, spills, pools or earlier audits',()=>{
  const l={...lot(),litresConsumed:500,litresSold:100,litresSpilled:20,litresRejected:30,milkSales:[{id:'sale',milkLotId:'milk-191126',quantity:100,saleDate:'2026-11-20',customer:'Test'}]};
  const saved=recordMilkRejection([l],[],{...request(l),quantity:1000},'admin','admin',at,'op')[0];
  expect(saved.status).toBe('completed');expect(saved.litresRemaining).toBe(24350);expect(saved.litresRejected).toBe(1030);expect(saved.milkSales).toBe(l.milkSales);
  expect(getMilkLotAccounting(saved,[])).toMatchObject({consumed:500,sold:100,remaining:24350});
 });
 it('rejects stale quotes when another user starts production, sells milk or records rejection',()=>{
  const l=lot(),p=request(l),r={id:'round',milkLotId:l.id,milkLotCode:l.lotCode,type:'D',status:'in_production',actualInput:500,plannedInput:500} as ProductionRound;
  expect(()=>recordMilkRejection([l],[r],p,'owner','owner',at,'op')).toThrow('balance changed');
  expect(()=>recordMilkRejection([{...l,litresSold:500}],[],p,'owner','owner',at,'op')).toThrow('balance changed');
  expect(()=>recordMilkRejection([{...l,litresRejected:500}],[],p,'owner','owner',at,'op')).toThrow('balance changed');
 });
 it('blocks invalid quantities, reasons, dates, missing lots and unauthorized accounts',()=>{
  const l=lot(),p=request(l);
  for(const quantity of [0,-1,Infinity,NaN,26001])expect(()=>recordMilkRejection([l],[],{...p,quantity},'owner','owner',at,'op')).toThrow();
  for(const rejectionDate of ['','2026-02-30','not-a-date'])expect(()=>recordMilkRejection([l],[],{...p,rejectionDate},'owner','owner',at,'op')).toThrow('date');
  expect(()=>recordMilkRejection([l],[],{...p,reason:''},'owner','owner',at,'op')).toThrow('reason');
  for(const role of ['staff','team_leader','quality_controller',''])expect(()=>recordMilkRejection([l],[],p,'user',role,at,'op')).toThrow('Owner/Admin');
  expect(()=>recordMilkRejection([],[],p,'owner','owner',at,'op')).toThrow('not found');
  expect(()=>recordMilkRejection([{...l,receiptStatus:'planned'}],[],p,'owner','owner',at,'op')).toThrow('delivered');
 });
});
