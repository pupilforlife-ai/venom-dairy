import { readinessStatus, planRevision, preparationBatchCodes, type IngredientUse, type TraceState } from './domain';

export interface PreparedIngredientSource {
  lotId:string; ingredientId:string; checkId:string; planRevision:string; batchCode:string;
  productCode:string; supplier:string; status:string; checkedBy:string; checkedAt:string;
}
export function preparedIngredientSources(state:TraceState,lotId:string,ingredientId:string):PreparedIngredientSource[] {
  const entry=state.readiness?.[lotId]?.[ingredientId];
  if(!entry)return [];
  const row=entry.value,revision=planRevision(state.lots[lotId]);
  // Delimiters are explicit. Spaces and hyphens within a batch code remain intact.
  return preparationBatchCodes(row).map(batchCode=>({
    lotId,ingredientId,checkId:entry.audit[entry.audit.length-1]?.id||'',planRevision:row.planRevision,batchCode,
    productCode:row.supplierProductCode,supplier:row.supplier,status:readinessStatus(row,revision,row.requiredKg),checkedBy:row.checkedBy,checkedAt:row.checkedAt,
  }));
}
export function applyPreparedSource(use:IngredientUse,source:PreparedIngredientSource):IngredientUse {
  if(use.ingredientId!==source.ingredientId)throw Error('Prepared source is for a different ingredient.');
  return {...use,supplier:source.supplier,supplierProductCode:source.productCode,supplierBatch:source.batchCode,
    preparation:{lotId:source.lotId,ingredientId:source.ingredientId,checkId:source.checkId,planRevision:source.planRevision,batchCode:source.batchCode}};
}
export function fillUnambiguousPreparedSources(uses:IngredientUse[],state:TraceState,lotId:string) {
  return uses.map(use=>{
    if(use.supplier||use.supplierProductCode||use.supplierBatch||use.preparation)return use;
    const options=preparedIngredientSources(state,lotId,use.ingredientId).filter(source=>source.status==='Ready');
    return options.length===1?applyPreparedSource(use,options[0]):use;
  });
}
