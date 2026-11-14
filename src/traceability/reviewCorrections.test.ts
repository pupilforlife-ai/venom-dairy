import { describe,it,expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { makePaneerQaFixture } from '../preview/qaFixture';
import { buildMilkLotPackedSummary } from '../lib/milkLotPackedSummary';
import { emptyTraceState,emptyRoundTrace,agreedPrefixes } from './domain';
import { assembleMixedCaseStock } from './mixedCaseStock';
import { loosePacketSources } from './mixedPaneerCases';
import { paneerJourney } from './paneerJourney';
import { packingLabels } from './labels';
import PaneerCutDetailsForm from './PaneerCutDetailsForm';

describe('reported paneer review corrections across views',()=>{
 it('milk receiving and case register retain weight but show assembled cases, not consumed loose packets',()=>{
  const qa=makePaneerQaFixture(),rounds=qa.rounds.slice(0,2).map(r=>({...r,type:'C/S' as const,packedSkus:[{...r.packedSkus![0],sku:'RPAN400',cases:6,loose:13}]}));
  const sources=loosePacketSources(rounds,qa.lots,qa.state);
  const before=JSON.stringify(rounds),next=assembleMixedCaseStock(qa.state,[],{id:'assembled',sku:'RPAN400',caseCount:1,parts:sources.map((s,i)=>({key:s.key,packets:i?11:13,expectedFingerprint:s.fingerprint}))},rounds,qa.lots,'packer','2026-11-14T08:00:00Z');
  const a=buildMilkLotPackedSummary(qa.lots[0],rounds,[],qa.state).groups[0].lines[0];
  const b=buildMilkLotPackedSummary(qa.lots[0],rounds,[],next.state).groups[0].lines[0];
  expect(a).toMatchObject({cases:12,loose:26});expect(b).toMatchObject({cases:13,loose:2,weightKg:a.weightKg});expect(b.weightKg).toBeCloseTo(125.6,8);expect(JSON.stringify(rounds)).toBe(before);
 });
 it('tray picker marks another round’s occupied trays in amber, with round details, but does not mark released trays',()=>{
  const qa=makePaneerQaFixture(),r=qa.rounds[2],render=(rounds:typeof qa.rounds)=>renderToStaticMarkup(createElement(PaneerCutDetailsForm,{phase:'after_cutting',roundId:r.id,rounds,value:r.paneerCuttingDetails!,onChange:()=>{},blockKg:80,packetBatchCode:'90-1011A3'}));
  const html=render(qa.rounds);expect(html).toContain('trace-cut-tray-occupied');expect(html).toContain('In use · 091126 S1/R1');expect(html).not.toContain('In use · 091126 S1/R3');
  expect(render(qa.rounds.map(x=>({...x,status:'packed'})))).not.toContain('trace-cut-tray-occupied');
 });
 it('scramble is deducted once in the journey even if PAN111 packing also records that output',()=>{
  const qa=makePaneerQaFixture(),r={...qa.rounds[0],packedSkus:[{sku:'PAN111',cases:0,weightKg:1.2}]};
  const j=paneerJourney(r,qa.lots[0],qa.state);expect(j.pan111Kg).toBe(1.2);expect(j.unaccountedKg).toBe(76.8);
 });
 it('loads existing final SKU prefixes automatically and preserves explicit/saved label overrides',()=>{
  const qa=makePaneerQaFixture(),r=qa.rounds[0];
  expect(agreedPrefixes).toMatchObject({MPAN101:'15',MPAN010:'16',RPAN010:'26',JP:'32',HCP:'33',PUBB:'52','GHEE-1500':'61'});
  expect(packingLabels(r,'MPAN101',qa.lots[0],qa.state).packetBatchCode).toBe('15-1011A1');
  expect(packingLabels(r,'MPAN101',qa.lots[0],{...qa.state,prefixes:{MPAN101:{value:'99',audit:[]}}}).packetBatchCode).toBe('99-1011A1');
 });
});

it('shows amber even when editing the latest claimant of a tray still unresolved on an earlier round',()=>{
 const qa=makePaneerQaFixture(),first=qa.rounds[0],later={...qa.rounds[1],paneerCuttingDetails:{...qa.rounds[1].paneerCuttingDetails!,trayNumbers:[12],trays:1},paneerCuttingHistory:undefined};
 const html=renderToStaticMarkup(createElement(PaneerCutDetailsForm,{phase:'after_cutting',roundId:later.id,rounds:[first,later],value:later.paneerCuttingDetails,onChange:()=>{},blockKg:80,packetBatchCode:'80-1011A2'}));
 expect(html).toContain('trace-cut-tray-occupied');expect(html).toContain('In use · 091126 S1/R1');expect(html).toContain('Selected occupied trays:');
});
