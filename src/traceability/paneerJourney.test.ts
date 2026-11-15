import { describe,it,expect } from 'vitest';
import type { MilkLot,ProductionRound } from '../data/mockData';
import { emptyRoundTrace,emptyTraceState,type TraceState } from './domain';
import { capturePaneerCutting,cuttingSaveDecision,paneerJourney,paneerOrigin,validatePaneerCutting } from './paneerJourney';
import { packingLabels,labelsForPacking } from './labels';
const lot={id:'milk',lotCode:'091126',traceabilityProductionDate:'2026-11-10'} as MilkLot;
const raw=():ProductionRound=>({id:'round',milkLotId:'milk',milkLotCode:'091126',shiftNumber:2,roundNumber:8,type:'D',status:'cut',plannedInput:500,actualInput:500,outputWeight:80,blockWeights:[40,40],remainingBalance:80,cutBy:'Cutter',historyEvents:[],packedSkus:[]} as unknown as ProductionRound);
const event={id:'cut1',occurredAt:'2026-11-12T10:00:00Z',recordedBy:'Staff',stage:'Cut'};
describe('paneer cutting and output source trail',()=>{
 it('records net after cloth and sample/tray details once without altering output or packing balances',()=>{
  const round={...raw(),paneerCuttingDetails:{...emptyRoundTrace().cutting,clothKg:2,trays:4,samplePieces:6,sampleLocation:'Sample crate A'}};
  const next=capturePaneerCutting(round,event);expect(next.paneerCuttingHistory).toHaveLength(1);
  expect(next.paneerCuttingHistory![0]).toMatchObject({blockKg:80,netKg:78,recordedBy:'Staff',recordedAt:event.occurredAt});
  expect(next.outputWeight).toBe(80);expect(next.remainingBalance).toBe(80);expect(next.packedSkus).toEqual([]);expect(round.paneerCuttingHistory).toBeUndefined();
  expect(capturePaneerCutting(next,event)).toBe(next);
  const corrected=capturePaneerCutting({...next,paneerCuttingDetails:{...round.paneerCuttingDetails,clothKg:1}}, {...event,id:'cut2'});
  expect(corrected.paneerCuttingHistory!.map(c=>c.netKg)).toEqual([78,79]);
 });
 it('accepts missing optional details but never invents zero cloth or sample weight',()=>{
  const details=emptyRoundTrace().cutting;expect(()=>validatePaneerCutting(details,80)).not.toThrow();
  const next=capturePaneerCutting({...raw(),paneerCuttingDetails:details},event);
  const journey=paneerJourney(next,lot,emptyTraceState);expect(journey.netKg).toBeNull();expect(journey.unaccountedKg).toBeNull();expect(journey.cutting.samplePieces).toBeNull();
  expect(journey.gaps).toContain('Cloth weight / no-cloth confirmation missing.');
  expect(()=>validatePaneerCutting({...details,trays:1.5},80)).toThrow();expect(()=>validatePaneerCutting({...details,clothKg:81},80)).toThrow();
  expect(()=>validatePaneerCutting({...details,samplePieces:-1},80)).toThrow();
 });
 it('uses source packing records, excludes cream from paneer maths, and does not count scramble observations twice',()=>{
  const r={...raw(),type:'C/S' as const,creamRecovered:33.4,sppRecordedWeight:5,paneerCuttingDetails:{...emptyRoundTrace().cutting,clothKg:0,scrambleKg:3,samplePieces:6},packedSkus:[{sku:'RPAN100',cases:4,loose:1},{sku:'PAN111',cases:0,loose:0,weightKg:3}]};
  const before=JSON.stringify(r),j=paneerJourney(r,lot,emptyTraceState);
  expect(j.packedKg).toBe(61);expect(j.pan111Kg).toBe(3);expect(j.sppKg).toBe(5);expect(j.unaccountedKg).toBe(11);
  expect(j.pan111Code).toBe('09-1011B8');expect(j.sppCode).toBe('91-1011B8');expect(j.creamCode).toBe('92-1011B8');expect(JSON.stringify(r)).toBe(before);
 });
 it('uses recorded variable case weights, and treats unknown SKU weights as unknown',()=>{
  const r={...raw(),packedSkus:[{sku:'MPAN010',cases:2,loose:0,caseWeightKg:30},{sku:'MPAN010',cases:1,loose:0,caseWeightKg:10}]};
  expect(paneerJourney(r,lot,emptyTraceState).packedKg).toBe(70);
  expect(paneerJourney({...r,packedSkus:[...r.packedSkus,{sku:'UNKNOWN',cases:10,loose:0}]},lot,emptyTraceState).packedKg).toBeNull();
 });
 it('keeps historical source identity after date/prefix settings change and isolates the lot plan',()=>{
  const r={...raw(),paneerAutomaticTrace:{productionDate:'2026-11-10',code:'80-1011B8',ingredients:[]} } as unknown as ProductionRound;
  const state={...emptyTraceState,lots:{milk:{value:{productionDate:'2026-12-01'},audit:[]},another:{value:{productionDate:'2026-12-02'},audit:[]}},prefixes:{D:{value:'99',audit:[]}}} as unknown as TraceState;
  expect(paneerOrigin(r,lot,state)).toEqual({date:'2026-11-10',code:'80-1011B8'});
  expect(paneerJourney(r,lot,state).gaps).not.toContain('Automatic ingredient snapshot not captured for this older round.');
  expect(paneerJourney(raw(),lot,emptyTraceState).gaps).toContain('Automatic ingredient snapshot not captured for this older round.');
 });
 it('uses the seven confirmed finished SKU prefixes and source-specific PAN111 prefixes',()=>{
  for(const [sku,prefix] of [['MPAN100','11'],['MPAN200','12'],['MPAN400','13'],['VJPAN','14'],['RPAN100','21'],['RPAN200','22'],['RPAN400','23']]){
   const labels=packingLabels(raw(),sku,lot,emptyTraceState);expect(labels.packetBatchCode).toBe(`${prefix}-1011B8`);expect(labels.caseBatchCode).toBe(`${prefix}-1011B`);
  }
  expect(packingLabels(raw(),'PAN111',lot,emptyTraceState).packetBatchCode).toBe('08-1011B8');
  expect(packingLabels({...raw(),type:'C/S'},'PAN111',lot,emptyTraceState).packetBatchCode).toBe('09-1011B8');
 });
 it('never reassigns an existing packet label while correcting a packing quantity',()=>{
  const saved={sku:'MPAN100',cases:1,loose:0,packetBatchCode:'OLD',caseBatchCode:'CASE',traceabilityProductionDate:'2026-10-26'};
  expect(labelsForPacking(raw(),'MPAN100',lot,emptyTraceState,saved)).toMatchObject({packetBatchCode:'OLD',caseBatchCode:'CASE',traceabilityProductionDate:'2026-10-26'});
  expect(paneerJourney({...raw(),packedSkus:[saved]},lot,emptyTraceState).paneerPacked[0].pack.packetBatchCode).toBe('OLD');
 });
});

describe('compact cutting checks: explicit pending acknowledgement',()=>{
 it('prompts on missing cloth, physical trays and samples before saving',()=>{
  const details=emptyRoundTrace().cutting;
  expect(cuttingSaveDecision(details)).toMatchObject({canSave:false});
  expect(cuttingSaveDecision(details).missing).toHaveLength(3);
  expect(cuttingSaveDecision({...details,clothKg:0,trays:2,samplePieces:0}).missing).toEqual(['Trays: select the physical tray numbers','Samples: no retention sample taken']);
 });
 it('accepts completed checks including confirmed no cloth without an acknowledgement',()=>{
  const details={...emptyRoundTrace().cutting,clothKg:0,trayNumbers:[1,20],trays:2,samplePieces:6};
  expect(cuttingSaveDecision(details)).toEqual({canSave:true,missing:[]});
  expect(cuttingSaveDecision({...details,trayNumbers:[],trays:0}).canSave).toBe(false);
 });
 it('retains missing checks and explicit acknowledgement with the actor and timestamp, without changing balances',()=>{
  const details={...emptyRoundTrace().cutting,pendingAcknowledged:true,samplePieces:0};
  expect(cuttingSaveDecision(details,true).canSave).toBe(true);
  const source={...raw(),paneerCuttingDetails:details},before=JSON.stringify(source),next=capturePaneerCutting(source,event);
  expect(next.paneerCuttingHistory![0]).toMatchObject({pendingAcknowledged:true,recordedBy:'Staff',recordedAt:event.occurredAt,netKg:null,details:{samplePieces:0}});
  expect(next.paneerCuttingHistory![0].missingChecks).toHaveLength(3);
  expect(next.remainingBalance).toBe(source.remainingBalance);expect(next.packedSkus).toEqual(source.packedSkus);expect(JSON.stringify(source)).toBe(before);
  expect(paneerJourney(next,lot,emptyTraceState).gaps).toContain('No retention sample taken.');
 });
 it('does not let acknowledgement bypass invalid weights or physical tray numbers',()=>{
  const details={...emptyRoundTrace().cutting,pendingAcknowledged:true};
  expect(()=>validatePaneerCutting({...details,clothKg:-1},80)).toThrow();
  expect(()=>validatePaneerCutting({...details,trayNumbers:[21],trays:1},80)).toThrow();
 });
});
