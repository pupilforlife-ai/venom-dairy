/** Planning recipe per 240 L milk. Salt is an editable allowance, not an enforced production limit. */
export const HALLOUMI_RECIPE_MILK_LITRES=240;
export const HALLOUMI_DEFAULT_SALT_G=750;
const quantity=(n:number)=>Math.round(n*1e9)/1e9;
export function halloumiPlanningRecipe(milkLitres:number,saltGPer240L=HALLOUMI_DEFAULT_SALT_G) {
 if(![milkLitres,saltGPer240L].every(n=>Number.isFinite(n)&&n>=0))throw Error('Halloumi milk and salt allowance must be zero or positive.');
 const rounds=milkLitres/HALLOUMI_RECIPE_MILK_LITRES;
 return {milkLitres,rounds,calciumChlorideKg:quantity(rounds*0.192),rennetMl:quantity(rounds*15),saltKg:quantity(rounds*saltGPer240L/1000),calciumWaterLitres:quantity(rounds*3.8),rennetWaterLitres:quantity(rounds*0.5),saltGPer240L};
}
