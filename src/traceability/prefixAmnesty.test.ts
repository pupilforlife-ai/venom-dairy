import {describe,it,expect} from 'vitest';
import {agreedPrefixes,emptyTraceState,type TraceState} from './domain';
import {packingLabels,labelsForPacking} from './labels';
import {createLossAmnesty,roundLossReviewWaived,lotLossReviewWaived} from './lossAmnesty';
import {finishedGoodsBatchCodeBySku,paneerSkuDefinitions} from '../data/skuConfig';
import {getPaneerRoundRemainingBalance} from '../lib/paneerBalance';
import type {MilkLot,ProductionRound} from '../data/mockData';
const lot={id:'old',lotCode:'261026',traceabilityProductionDate:'2026-10-26'} as MilkLot;
const round=(patch:Partial<ProductionRound>={})=>({id:'r1',milkLotId:lot.id,milkLotCode:lot.lotCode,type:'C/S',shiftNumber:2,roundNumber:8,outputWeight:72,remainingBalance:999,packedSkus:[{sku:'RPAN100',cases:5,loose:0}],...patch} as ProductionRound);
describe('owner-approved complete SKU prefixes',()=>{
 it.each([['RPAN101','27'],['RPAN101 SPC CUT','28'],['MPAN101 SPC CUT','18'],['RPAN100 Rylands','24'],['RPAN400 Rylands','25'],['YD200','17'],['TN3','71'],['TN5','72'],['GN3','73'],['GN4','74']])('%s uses %s in its register and future labels',(sku,prefix)=>{
  expect(finishedGoodsBatchCodeBySku[sku].prefix).toBe(prefix);expect(agreedPrefixes[sku]).toBe(prefix);expect(packingLabels(round(),sku,lot,emptyTraceState).caseBatchCode).toBe(prefix+'-2610B');
 });
 it('has a prefix for every packet-count paneer SKU without requiring unrelated approvals',()=>{
  for(const sku of paneerSkuDefinitions.filter(d=>d.packMode==='units'))expect(packingLabels(round(),sku.sku,lot,emptyTraceState).packetBatchCode).toMatch(/^\d+-2610B8$/);
 });
 it('preserves a saved printed code despite the approved future prefix change',()=>{
  const old={sku:'MPAN101 SPC CUT',cases:1,packetBatchCode:'15-2610B8',caseBatchCode:'15-2610B',traceabilityProductionDate:'2026-10-26',traceabilityPrefixVersion:'proposed-20261111-v1'};
  const before=JSON.stringify(old);expect(labelsForPacking(round(),old.sku,lot,emptyTraceState,old)).toMatchObject({packetBatchCode:old.packetBatchCode,caseBatchCode:old.caseBatchCode,traceabilityProductionDate:old.traceabilityProductionDate,traceabilityPrefixVersion:old.traceabilityPrefixVersion});expect(JSON.stringify(old)).toBe(before);
 });
});
describe('historical loss review amnesty',()=>{
 it('waives existing loss review without changing quantities or balances',()=>{
  const r=round(),sources=[r],before=JSON.stringify(sources),balance=getPaneerRoundRemainingBalance(r);
  const entry=createLossAmnesty(lot,sources,'sa','2026-11-25T10:00:00Z');const state:TraceState={...emptyTraceState,historicalLossAmnesties:{[lot.id]:entry}};
  expect(roundLossReviewWaived(r,state)).toBe(true);expect(lotLossReviewWaived(lot.id,sources,state)).toBe(true);expect(getPaneerRoundRemainingBalance(r)).toBe(balance);expect(JSON.stringify(sources)).toBe(before);
 });
 it('does not waive later lots, newly recorded rounds or changed source quantities',()=>{
  const r=round(),state={...emptyTraceState,historicalLossAmnesties:{[lot.id]:createLossAmnesty(lot,[r],'sa','now')}};
  expect(roundLossReviewWaived(round({id:'new-round'}),state)).toBe(false);
  expect(roundLossReviewWaived(round({outputWeight:73}),state)).toBe(false);
  expect(roundLossReviewWaived(round({packedSkus:[{sku:'RPAN100',cases:4,loose:0}]}),state)).toBe(false);
  expect(lotLossReviewWaived(lot.id,[r,round({id:'new'})],state)).toBe(false);
  for(const code of ['171126','191126','241126'])expect(()=>createLossAmnesty({...lot,lotCode:code},[r],'sa','now')).toThrow('four owner-approved');
 });
 it('retains the waiver through metadata-only changes and excludes external cream sources',()=>{
  const r=round(),external=round({id:'external',creamSource:'external'}),state={...emptyTraceState,historicalLossAmnesties:{[lot.id]:createLossAmnesty(lot,[r,external],'sa','now')}};
  expect(roundLossReviewWaived({...r,status:'packed',notes:'Metadata correction',packedSkus:r.packedSkus!.map(p=>({...p,recordedBy:'Corrected name'}))},state)).toBe(true);
  expect(roundLossReviewWaived(external,state)).toBe(false);expect(state.historicalLossAmnesties[lot.id].rounds).toHaveLength(1);
 });
});
