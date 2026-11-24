import {describe,it,expect} from 'vitest';
import {prepareTraceCommand,type TraceDocuments} from './commands';
import {makePaneerQaFixture} from '../testing/qaFixture';
import {emptyTraceState} from '../domain';
import {reconcileFinishedStock} from '../../lib/finishedStock';
function fixture():TraceDocuments{const q=makePaneerQaFixture();return {vejoy_distributionHandovers:[],vejoy_finishedStock:[],vejoy_intermediateLots:[],vejoy_productionRounds:q.rounds,vejoy_milkLots:q.lots,vejoy_traceability:q.state};}
const at='2026-11-15T14:00:00Z';
describe('authenticated paneer command boundary',()=>{
 it('rejects unapproved roles without touching documents',()=>{const d=fixture(),before=JSON.stringify(d);expect(()=>prepareTraceCommand(d,{id:'a',kind:'trays',payload:{}},'user','quality_controller',at)).toThrow('access');expect(JSON.stringify(d)).toBe(before);});
 it('does not allow staff to alter prefix settings',()=>{expect(()=>prepareTraceCommand(fixture(),{id:'a',kind:'save',payload:{kind:'prefixes',id:'MPAN200',value:'99',reason:'changed'}},'packer','staff',at)).toThrow('Owner/Admin');});
 it('retains source data and other lots when saving a production plan',()=>{const d=fixture();d.vejoy_traceability=emptyTraceState;const before=JSON.stringify(d);const result=prepareTraceCommand(d,{id:'plan-a',kind:'save',payload:{kind:'lots',id:d.vejoy_milkLots[0].id,value:{productionDate:'2026-11-10',planCsLitres:500,planDirectLitres:500},expectedRevision:'',reason:''}},'owner','owner',at);expect(JSON.stringify(d)).toBe(before);expect(result.documents.vejoy_productionRounds).toBe(d.vejoy_productionRounds);expect(result.documents.vejoy_traceability.lots[d.vejoy_milkLots[0].id].audit[0]).toMatchObject({actor:'owner',at});});
 it('rejects stale plans rather than replacing newer preparation work',()=>{const d=fixture();expect(()=>prepareTraceCommand(d,{id:'p',kind:'save',payload:{kind:'lots',id:d.vejoy_milkLots[0].id,expectedRevision:'old',value:{}}},'owner','owner',at)).toThrow('plan changed');});
 it('protects packing and identity from arbitrary activity updates',()=>{const d=fixture(),r=d.vejoy_productionRounds[0];expect(()=>prepareTraceCommand(d,{id:'a',kind:'activity',payload:{roundId:r.id,expectedRound:r,updates:{packedSkus:[]},event:{source:'workflow'}}},'packer','staff',at)).toThrow('identity');});
 it('uses server actor/time for production and automatically captures ingredient origins',()=>{const d=fixture(),r={...d.vejoy_productionRounds[0],status:'scheduled' as const,paneerAutomaticTrace:undefined};d.vejoy_productionRounds=[r,...d.vejoy_productionRounds.slice(1)];const result=prepareTraceCommand(d,{id:'start-a',kind:'activity',payload:{roundId:r.id,expectedRound:r,updates:{status:'in_production',vat:'vat2',startingTemperature:4},event:{type:'in_production',stage:'In Production',recordedBy:'spoofed',occurredAt:'old',source:'workflow'}}},'real packer','staff',at);const saved=result.documents.vejoy_productionRounds[0];expect(saved.paneerAutomaticTrace).toMatchObject({recordedBy:'real packer',recordedAt:at,milkLitres:500});expect(saved.historyEvents?.some(e=>e.id==='start-a'&&e.recordedBy==='real packer'&&e.occurredAt===at)).toBe(true);});
});
function transfer(){const d=fixture(),line=reconcileFinishedStock(d.vejoy_productionRounds,[])[0];return {d,line,command:{id:'transfer-a',kind:'handover',payload:{candidate:{sourceType:'finished_stock',sku:line.sku,sourceId:line.id,stockLines:[line],productName:line.productName,batchCode:line.packingRunId,milkLotLabel:'091126'},form:{verifiedCases:line.cases,verifiedLoose:line.loosePackets,verifiedLooseWeightKg:0,quantity:line.totalPackets,quantityVerified:true,destination:'Distribution Coldroom',finishedGoodsBatchCode:'23-1011A',handedOverBy:'packing team',partialTransferDisposition:'',notes:''}}}};}
describe('shared paneer handover conservation',()=>{
 it('hands over existing cases and loose packets without changing original packing',()=>{const {d,line,command}=transfer(),before=JSON.stringify(d);const out=prepareTraceCommand(d,command,'owner','owner',at);expect(JSON.stringify(d)).toBe(before);expect(out.documents.vejoy_productionRounds).toBe(d.vejoy_productionRounds);expect(out.documents.vejoy_distributionHandovers).toHaveLength(1);const stock=reconcileFinishedStock(out.documents.vejoy_productionRounds,out.documents.vejoy_finishedStock);expect(stock.filter(x=>x.status==='handed_over').reduce((a,x)=>a+x.totalPackets,0)).toBe(line.totalPackets);});
 it('retains partial stock on site and records Container custody',()=>{const {d,line,command}=transfer();command.payload.form.verifiedCases=1;command.payload.form.verifiedLoose=0;command.payload.form.quantity=15;command.payload.form.partialTransferDisposition='still_in_production';(command.payload.form as any).partialStorageLocation='Dairy Container (Finished Stock)';const out=prepareTraceCommand(d,command,'owner','admin',at);const stock=reconcileFinishedStock(out.documents.vejoy_productionRounds,out.documents.vejoy_finishedStock);expect(stock.filter(x=>x.sourceRoundId===line.sourceRoundId).reduce((a,x)=>a+x.totalPackets,0)).toBe(line.totalPackets);expect(stock.filter(x=>x.status==='handed_over').reduce((a,x)=>a+x.totalPackets,0)).toBe(15);expect(stock.some(x=>x.status==='awaiting_handover'&&x.storageLocation==='Dairy Container (Finished Stock)')).toBe(true);});
 it('moves the untransferred count to discrepancies with a required reason',()=>{const {d,command}=transfer();command.payload.form.verifiedCases=1;command.payload.form.verifiedLoose=0;command.payload.form.quantity=15;command.payload.form.partialTransferDisposition='incorrectly_recorded';expect(()=>prepareTraceCommand(d,command,'owner','owner',at)).toThrow('reason');(command.payload.form as any).partialDispositionReason='Physical count checked';const out=prepareTraceCommand(d,command,'owner','owner',at);expect(out.documents.vejoy_finishedStock.some(x=>x.status==='incorrectly_recorded')).toBe(true);});
 it('rejects a changed source quote, unauthorized reviewer, and inconsistent totals',()=>{const {d,command}=transfer();expect(()=>prepareTraceCommand(d,command,'packer','staff',at)).toThrow('Owner/Admin');command.payload.form.quantity++;expect(()=>prepareTraceCommand(d,command,'owner','owner',at)).toThrow('differs');command.payload.form.quantity--;command.payload.candidate.stockLines[0]={...command.payload.candidate.stockLines[0],loosePackets:999};expect(()=>prepareTraceCommand(d,command,'owner','owner',at)).toThrow('Stock changed');});
});

import {loosePacketSources} from '../mixedPaneerCases';
import {assembleMixedCaseStock} from '../mixedCaseStock';
it('hands over an assembled case with all round shares and returns it without creating more production',()=>{
 const d=fixture();d.vejoy_productionRounds=d.vejoy_productionRounds.slice(0,2).map((r,i)=>({...r,type:'D',packedSkus:[{sku:'MPAN100',cases:4,loose:i?11:13,packingRunId:'p'+i}]}));
 const sources=loosePacketSources(d.vejoy_productionRounds,d.vejoy_milkLots,d.vejoy_traceability);
 const assembled=assembleMixedCaseStock(d.vejoy_traceability,[],{id:'mixed-1',sku:'MPAN100',caseCount:1,parts:sources.map((s,i)=>({key:s.key,packets:i?2:13,expectedFingerprint:s.fingerprint}))},d.vejoy_productionRounds,d.vejoy_milkLots,'packer',at);
 d.vejoy_finishedStock=assembled.stock;d.vejoy_traceability=assembled.state;
 const line=reconcileFinishedStock(d.vejoy_productionRounds,d.vejoy_finishedStock).find(x=>x.mixedCaseId==='mixed-1')!;
 const out=prepareTraceCommand(d,{id:'mixed-transfer',kind:'handover',payload:{candidate:{sourceType:'finished_stock',sku:'MPAN100',stockLines:[line],productName:line.productName,sourceId:line.id,batchCode:line.packingRunId},form:{verifiedCases:1,verifiedLoose:0,verifiedLooseWeightKg:0,quantity:15,quantityVerified:true,destination:'Distribution Coldroom',finishedGoodsBatchCode:'11-1011A',handedOverBy:'team'}}},'owner','owner',at);
 expect(out.documents.vejoy_productionRounds).toBe(d.vejoy_productionRounds);
 expect(out.documents.vejoy_distributionHandovers[0].stockAllocations?.[0].mixedCaseParts?.map(x=>x.packets)).toEqual([13,2]);
 const moved=out.documents.vejoy_finishedStock.find(x=>x.mixedCaseId==='mixed-1'&&x.status==='handed_over')!;
 const returned=prepareTraceCommand(out.documents,{id:'return-1',kind:'return',payload:{id:'return-1',stockId:moved.id,expectedStock:JSON.stringify(moved),cases:1,reason:'Wrong destination checked',location:'Dairy Container (Finished Stock)'}},'owner','owner',at);
 expect(returned.documents.vejoy_productionRounds).toBe(d.vejoy_productionRounds);
 expect(returned.documents.vejoy_finishedStock.some(x=>x.status==='returned'&&x.mixedCaseId==='mixed-1')).toBe(true);
});
it('rejects staff stage skipping and starts lacking a recorded temperature',()=>{
 const d=fixture(),r={...d.vejoy_productionRounds[0],status:'scheduled' as const};d.vejoy_productionRounds=[r];
 expect(()=>prepareTraceCommand(d,{id:'skip',kind:'activity',payload:{roundId:r.id,expectedRound:r,updates:{status:'frozen'},event:{source:'workflow'}}},'packer','staff',at)).toThrow('review');
 expect(()=>prepareTraceCommand(d,{id:'start',kind:'activity',payload:{roundId:r.id,expectedRound:r,updates:{status:'in_production',vat:'vat2'},event:{source:'workflow'}}},'packer','staff',at)).toThrow('temperature');
});

it('uses net cloth weight during cutting and late owner corrections without editing raw measurements or packing',()=>{
 const d=fixture(),old={...d.vejoy_productionRounds[0],status:'ready_cutting' as const,packedSkus:[]};d.vejoy_productionRounds=[old,...d.vejoy_productionRounds.slice(1)];
 const details={clothKg:2,trays:null,scrambleKg:null,samplePieces:null,sampleLocation:'Container',scrambleLocation:'Container'};
 const command={id:'cloth-cut',kind:'activity',payload:{roundId:old.id,expectedRound:old,updates:{status:'cut',outputWeight:72,blockWeights:[12,12,12,12,12,12],numberOfBlocks:6,remainingBalance:72,paneerCuttingDetails:details},event:{type:'cut',stage:'Cut',source:'workflow'}}};
 const saved=prepareTraceCommand(d,command,'cutter','staff',at).documents.vejoy_productionRounds[0];
 expect(saved).toMatchObject({remainingBalance:70,outputWeight:72,blockWeights:[12,12,12,12,12,12]});
 expect(saved.paneerCuttingHistory?.at(-1)?.netKg).toBe(70);
 const packed={...saved,packedSkus:[{sku:'MPAN100',cases:4,loose:0}],remainingBalance:10};d.vejoy_productionRounds=[packed,...d.vejoy_productionRounds.slice(1)];
 const corrected=prepareTraceCommand(d,{id:'cloth-correct',kind:'activity',payload:{roundId:packed.id,expectedRound:packed,updates:{paneerCuttingDetails:{...details,clothKg:1}},event:{type:'weights_corrected',source:'correction'}}},'owner','owner',at).documents;
 expect(corrected.vejoy_productionRounds[0]).toMatchObject({remainingBalance:11,outputWeight:72,packedSkus:packed.packedSkus});
 expect(corrected.vejoy_productionRounds[1]).toBe(d.vejoy_productionRounds[1]);
 expect(packed.remainingBalance).toBe(10);
 expect(()=>prepareTraceCommand(d,{...command,payload:{...command.payload,expectedRound:old}},'cutter','staff',at)).toThrow('moved on');
});

it('records rejection only for the selected milk lot, with server-backed actor/time and no production changes',()=>{
 const d=fixture();d.vejoy_milkLots=[{id:'rejected-lot',lotCode:'191126',receiptStatus:'received',status:'completed',litresReceived:26000,litresConsumed:0,litresRemaining:26000,litresRejected:0,litresSpilled:0} as TraceDocuments['vejoy_milkLots'][number],...d.vejoy_milkLots];
 const p={lotId:'rejected-lot',expected:{received:26000,consumed:0,rejected:0,spilled:0,sold:0,remaining:26000,overdraw:0},quantity:26000,rejectionDate:'2026-11-19',reason:'Tanker rejected on arrival'};
 const command={id:'reject-lot',kind:'milk_rejection',payload:p},before=JSON.stringify(d);
 expect(()=>prepareTraceCommand(d,command,'staff','staff',at)).toThrow('Owner/Admin');
 const saved=prepareTraceCommand(d,command,'sa','owner',at).documents;
 expect(saved.vejoy_milkLots[0]).toMatchObject({status:'rejected',litresRejected:26000});
 expect(saved.vejoy_milkLots[0].milkBalanceReviews?.[0]).toMatchObject({reviewedAt:at,reviewedBy:'sa',reviewerRole:'owner'});
 for(const key of ['vejoy_productionRounds','vejoy_finishedStock','vejoy_distributionHandovers','vejoy_intermediateLots','vejoy_traceability'] as const)expect(saved[key]).toBe(d[key]);
 expect(saved.vejoy_milkLots[1]).toBe(d.vejoy_milkLots[1]);expect(JSON.stringify(d)).toBe(before);
});

it('saves planned Halloumi litres independently of real production and preserves earlier plans',()=>{
 const d=fixture();d.vejoy_traceability=emptyTraceState;
 const value={productionDate:'2026-11-24',planCsLitres:4000,planDirectLitres:1000,planHalloumiLitres:2400};
 const command={id:'halloumi-plan',kind:'save',payload:{kind:'lots',id:d.vejoy_milkLots[0].id,value,expectedRevision:'',reason:''}};
 const result=prepareTraceCommand(d,command,'owner','owner',at).documents;
 expect(result.vejoy_traceability.lots[d.vejoy_milkLots[0].id].value).toEqual(value);
 expect(result.vejoy_productionRounds).toBe(d.vejoy_productionRounds);expect(result.vejoy_milkLots).toBe(d.vejoy_milkLots);
 expect(()=>prepareTraceCommand(d,{...command,payload:{...command.payload,value:{...value,planHalloumiLitres:-240}}},'owner','owner',at)).toThrow('volumes');
});
