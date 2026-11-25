import type {MilkLot,ProductionRound} from '../data/mockData';
import type {TraceState} from './domain';
export const HISTORICAL_LOSS_AMNESTY_LOTS=['270926','011026','111026','261026'] as const;
export interface HistoricalLossAmnesty {id:string;lotId:string;lotCode:string;beforeMilkLot:string;approvedAt:string;approvedBy:string;approvalMethod:string;reason:string;rounds:{id:string;fingerprint:string}[]}
// Only source quantities determine coverage. Labels, names, timers and cached
// balances can change without changing the historical loss under review.
export function roundLossFingerprint(r:ProductionRound) {
 return JSON.stringify({type:r.type,lotId:r.milkLotId,lotCode:r.milkLotCode,output:r.outputWeight??null,blocks:r.blockWeights??null,cloth:r.paneerCuttingDetails?.clothKg??null,scramble:r.paneerCuttingDetails?.scrambleKg??null,spp:r.sppRecordedWeight??null,pan111:r.pan111RequestedWeight??null,pan111Approval:r.pan111ApprovalStatus??null,butter:r.butterOutput??null,butterLosses:r.butterLossHistory??null,
  packing:(r.packedSkus||[]).map(p=>({sku:p.sku,cases:p.cases,loose:p.loose??0,weight:p.weightKg??null,caseWeight:p.caseWeightKg??null,looseWeight:p.looseWeightKg??null}))});
}
export function createLossAmnesty(lot:MilkLot,rounds:ProductionRound[],approvedBy:string,approvedAt:string):HistoricalLossAmnesty {
 if(!HISTORICAL_LOSS_AMNESTY_LOTS.includes(lot.lotCode as typeof HISTORICAL_LOSS_AMNESTY_LOTS[number]))throw Error('Historical loss amnesty is limited to the four owner-approved milk lots.');
 return {id:'historical-loss-amnesty-20261125-'+lot.id,lotId:lot.id,lotCode:lot.lotCode,beforeMilkLot:'171126',approvedAt,approvedBy,approvalMethod:'Owner approval in chat; applied through audited maintenance',reason:'Owner granted review amnesty for historical loss discrepancies before milk lot 171126. Original quantities and stock records are retained.',rounds:rounds.filter(r=>(r.milkLotId===lot.id||(!r.milkLotId&&r.milkLotCode===lot.lotCode))&&r.creamSource!=='external'&&!r.sourceCreamLotId).map(r=>({id:r.id,fingerprint:roundLossFingerprint(r)}))};
}
export function roundLossReviewWaived(round:ProductionRound,state:TraceState) {
 const waiver=state.historicalLossAmnesties?.[round.milkLotId]||(!round.milkLotId?Object.values(state.historicalLossAmnesties||{}).find(e=>e.lotCode===round.milkLotCode):undefined);
 return Boolean(waiver&&waiver.lotCode===round.milkLotCode&&waiver.rounds.some(s=>s.id===round.id&&s.fingerprint===roundLossFingerprint(round)));
}
export function lotLossReviewWaived(lotId:string,rounds:ProductionRound[],state:TraceState) {
 const waiver=state.historicalLossAmnesties?.[lotId];
 if(!waiver)return false;
 const current=rounds.filter(r=>(r.milkLotId===lotId||(!r.milkLotId&&r.milkLotCode===waiver.lotCode))&&r.creamSource!=='external'&&!r.sourceCreamLotId);
 return current.length===waiver.rounds.length&&current.every(r=>roundLossReviewWaived(r,state));
}
