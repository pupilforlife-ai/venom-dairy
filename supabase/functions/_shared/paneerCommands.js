// src/data/mockData.ts
var milkProductionTypes = ["D", "C/S", "Halloumi", "Amassi"];
function isMilkProductionRound(round) {
  return milkProductionTypes.includes(round.type);
}
function getRoundMilkInput(round) {
  if (round.status === "scheduled" || round.status === "cancelled") return 0;
  if (round.actualInput > 0) return round.actualInput;
  return Math.max(0, round.plannedInput);
}
function getMilkLotAccounting(lot, rounds) {
  const lotRounds = rounds.filter(
    (round) => (round.milkLotId === lot.id || round.milkLotCode === lot.lotCode) && isMilkProductionRound(round)
  );
  const accountableRounds = lotRounds.filter((round) => getRoundMilkInput(round) > 0);
  const consumed = accountableRounds.length > 0 ? accountableRounds.reduce((total, round) => total + getRoundMilkInput(round), 0) : Math.max(0, lot.litresConsumed);
  const sold = Math.max(0, lot.litresSold || 0);
  const accountedOther = Math.max(0, lot.litresRejected) + Math.max(0, lot.litresSpilled);
  const rawRemaining = lot.litresReceived - consumed - sold - accountedOther;
  const overdraw = Math.max(0, -rawRemaining);
  const remaining = Math.max(0, rawRemaining);
  return { consumed, sold, remaining, overdraw, rawRemaining };
}
var milkStorageVessels = [
  { id: "direct-production", label: "Direct to production", capacity: 3e3 },
  { id: "bmc-2", label: "BMC #2 (Holding Tank)", capacity: 2500 },
  { id: "silo", label: "Silo", capacity: 1e4 },
  { id: "bmc-1", label: "BMC #1", capacity: 3e3 },
  { id: "bmc-3", label: "BMC #3", capacity: 3e3 },
  { id: "auxiliary", label: "Auxiliary storage (cans / buckets)", capacity: null },
  ...Array.from({ length: 10 }, (_, index) => ({
    id: `ibc-${index + 1}`,
    label: `IBC #${index + 1}`,
    capacity: 1e3
  }))
];

// src/lib/milkRejection.ts
function milkRejectionQuote(lot, rounds) {
  const a = getMilkLotAccounting(lot, rounds);
  return { received: lot.litresReceived, consumed: a.consumed, rejected: lot.litresRejected, spilled: lot.litresSpilled, sold: a.sold, remaining: a.remaining, overdraw: a.overdraw };
}
var litres = (n) => Math.round(n * 1e6) / 1e6;
function recordMilkRejection(lots, rounds, p, actor, role, at, id) {
  if (!["owner", "admin"].includes(role)) throw Error("Only Owner/Admin can record rejected milk.");
  const lot = lots.find((l) => l.id === p.lotId);
  if (!lot) throw Error("Milk lot not found.");
  if (lot.receiptStatus === "planned" || lot.litresReceived <= 0) throw Error("Record the delivered milk volume before recording a rejection.");
  const before = milkRejectionQuote(lot, rounds);
  if (!p.expected || Object.entries(before).some(([key, value]) => p.expected[key] !== value)) throw Error("The milk balance changed. Reopen Reject milk and check the current balance.");
  if (!Number.isFinite(p.quantity) || p.quantity <= 0) throw Error("Enter the rejected litres, greater than zero.");
  if (p.quantity > before.remaining) throw Error(`Only ${before.remaining.toLocaleString()} L remains unaccounted for. Review existing production, sales or rejection records first.`);
  if (typeof p.reason !== "string" || p.reason.trim().length < 3) throw Error("Enter a reason for rejecting the milk.");
  if (typeof p.rejectionDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(p.rejectionDate) || !Number.isFinite(Date.parse(p.rejectionDate)) || new Date(p.rejectionDate).toISOString().slice(0, 10) !== p.rejectionDate) throw Error("Enter a valid rejection date.");
  const rejected = litres(before.rejected + p.quantity), remaining = litres(before.remaining - p.quantity);
  const after = { ...before, rejected, remaining, overdraw: 0 };
  const review = { id: "milk-rejection-" + id, kind: "milk_rejection", eventDate: p.rejectionDate, rejectedLitres: p.quantity, reviewedAt: at, reviewedBy: actor, reviewerRole: role, reason: p.reason.trim(), before, after, roundCorrections: [] };
  const allRejected = Math.abs(rejected - before.received) < 1e-6 && before.consumed === 0 && before.sold === 0 && before.spilled === 0;
  return lots.map((l) => l.id !== lot.id ? l : { ...l, litresRejected: rejected, litresRemaining: remaining, status: allRejected ? "rejected" : l.status, milkBalanceReviews: [...l.milkBalanceReviews || [], review] });
}

// src/data/skuConfig.ts
var paneerSkuDefinitions = [
  { sku: "MPAN100", productName: "Malai Paneer - 1kg", unitWeightKg: 1, unitsPerCase: 15, packMode: "units", sourceTypes: ["D"] },
  { sku: "MPAN200", productName: "Malai Paneer - 200g", unitWeightKg: 0.2, unitsPerCase: 24, packMode: "units", sourceTypes: ["D"] },
  { sku: "VJPAN", productName: "Malai Paneer - 200g (VJ)", unitWeightKg: 0.2, unitsPerCase: 20, packMode: "units", sourceTypes: ["D"] },
  { sku: "MPAN400", productName: "Malai Paneer - 400g", unitWeightKg: 0.4, unitsPerCase: 24, packMode: "units", sourceTypes: ["D"] },
  { sku: "MPAN010", productName: "Malai Paneer - Restaurant Blocks", unitWeightKg: 0.4, unitsPerCase: 50, packMode: "weight_loose", sourceTypes: ["D"], cutTypes: ["Restaurant blocks"] },
  { sku: "MPAN101", productName: "Malai Paneer - Clear 1kg", unitWeightKg: 1, unitsPerCase: 15, packMode: "units", sourceTypes: ["D"], cutTypes: ["400g cubes"] },
  { sku: "MPAN101 SPC CUT", productName: "Malai Paneer - Clear 1kg SPC Cut", unitWeightKg: 1, unitsPerCase: 15, packMode: "units", sourceTypes: ["D"], cutTypes: ["200g cubes"] },
  { sku: "YD200", productName: "Malai Paneer - 200g (YD)", unitWeightKg: 0.2, unitsPerCase: 36, packMode: "units", sourceTypes: ["D"] },
  { sku: "RPAN100", productName: "Rozana Paneer - 1kg", unitWeightKg: 1, unitsPerCase: 15, packMode: "units", sourceTypes: ["C/S"] },
  { sku: "RPAN200", productName: "Rozana Paneer - 200g", unitWeightKg: 0.2, unitsPerCase: 24, packMode: "units", sourceTypes: ["C/S"] },
  { sku: "RPAN400", productName: "Rozana Paneer - 400g", unitWeightKg: 0.4, unitsPerCase: 24, packMode: "units", sourceTypes: ["C/S"] },
  { sku: "RPAN100 Rylands", productName: "Rozana Paneer - 1kg (Rylands)", unitWeightKg: 1, unitsPerCase: 15, packMode: "units", sourceTypes: ["C/S"] },
  { sku: "RPAN400 Rylands", productName: "Rozana Paneer - 400g (Rylands)", unitWeightKg: 0.4, unitsPerCase: 24, packMode: "units", sourceTypes: ["C/S"] },
  { sku: "RPAN010", productName: "Rozana Paneer - Restaurant Blocks", unitWeightKg: 0.4, unitsPerCase: 50, packMode: "weight_loose", sourceTypes: ["C/S"], cutTypes: ["Restaurant blocks"] },
  { sku: "RPAN101", productName: "Rozana Paneer - Clear 1kg", unitWeightKg: 1, unitsPerCase: 15, packMode: "units", sourceTypes: ["C/S"], cutTypes: ["400g cubes"] },
  { sku: "RPAN101 SPC CUT", productName: "Rozana Paneer - Clear 1kg SPC Cut", unitWeightKg: 1, unitsPerCase: 15, packMode: "units", sourceTypes: ["C/S"], cutTypes: ["200g cubes"] },
  { sku: "PAN111", productName: "PAN111 - Scramble Paneer", unitWeightKg: 0, packMode: "weight_only", sourceTypes: ["D", "C/S"] }
];
var crumbingSkuDefinitions = [
  { sku: "SPP", productName: "Vejoy Spicy Paneer Poppers", unitWeightKg: 0.25, unitsPerCase: 12, packMode: "units", crumbingType: "SPP" },
  { sku: "ROZ SPP", productName: "Rozana Spicy Paneer Poppers", unitWeightKg: 0.25, unitsPerCase: 12, packMode: "units", crumbingType: "SPP" },
  { sku: "JP", productName: "Vejoy Jalapeno Poppers", unitWeightKg: 0.25, unitsPerCase: 12, packMode: "units", crumbingType: "JP" },
  { sku: "ROZ JP", productName: "Rozana Jalapeno Poppers", unitWeightKg: 0.25, unitsPerCase: 12, packMode: "units", crumbingType: "JP" },
  { sku: "HCP", productName: "Vejoy Halloumi Poppers", unitWeightKg: 0.25, unitsPerCase: 12, packMode: "units", crumbingType: "HCP" },
  { sku: "ROZ HCP", productName: "Rozana Halloumi Poppers", unitWeightKg: 0.25, unitsPerCase: 12, packMode: "units", crumbingType: "HCP" }
];
var gheeSkuDefinitions = [
  { sku: "GHEE-400", productName: "Ghee 400g \u2014 27 bucket case", unitWeightKg: 0.4, bucketsPerCase: 27 },
  { sku: "GHEE-400-24", productName: "Ghee 400g \u2014 24 bucket case", unitWeightKg: 0.4, bucketsPerCase: 24 },
  { sku: "GHEE-1500", productName: "Ghee 1.5kg \u2014 6 bucket case", unitWeightKg: 1.5, bucketsPerCase: 6 }
];
var finishedGoodsBatchCodeDefinitions = [
  { sku: "MPAN100", prefix: "11", mode: "receipt_date", receiptSource: "milk" },
  { sku: "MPAN400", prefix: "13", mode: "receipt_date", receiptSource: "milk" },
  { sku: "MPAN200", prefix: "12", mode: "receipt_date", receiptSource: "milk" },
  { sku: "VJPAN", prefix: "14", mode: "receipt_date", receiptSource: "milk" },
  { sku: "MPAN101", prefix: "15", mode: "receipt_date", receiptSource: "milk" },
  { sku: "MPAN101 SPC CUT", prefix: "15", mode: "receipt_date", receiptSource: "milk" },
  { sku: "MPAN010", prefix: "16", mode: "receipt_date", receiptSource: "milk" },
  { sku: "YD200", prefix: "17", mode: "receipt_date", receiptSource: "milk" },
  { sku: "RPAN100", prefix: "21", mode: "receipt_date", receiptSource: "milk" },
  { sku: "RPAN400", prefix: "23", mode: "receipt_date", receiptSource: "milk" },
  { sku: "RPAN200", prefix: "22", mode: "receipt_date", receiptSource: "milk" },
  { sku: "RPAN100 Rylands", prefix: "24", mode: "receipt_date", receiptSource: "milk" },
  { sku: "RPAN400 Rylands", prefix: "25", mode: "receipt_date", receiptSource: "milk" },
  { sku: "RPAN010", prefix: "26", mode: "receipt_date", receiptSource: "milk" },
  { sku: "SPP", prefix: "31", mode: "manual" },
  { sku: "JP", prefix: "32", mode: "manual" },
  { sku: "HCP", prefix: "33", mode: "manual" },
  { sku: "ROZ SPP", prefix: "41", mode: "manual" },
  { sku: "ROZ JP", prefix: "42", mode: "manual" },
  { sku: "ROZ HCP", prefix: "43", mode: "manual" },
  { sku: "BBO5", prefix: "51", mode: "receipt_date", receiptSource: "cream" },
  { sku: "BB05", prefix: "51", mode: "receipt_date", receiptSource: "cream" },
  { sku: "PUBB", prefix: "52", mode: "receipt_date", receiptSource: "cream" },
  { sku: "PUBBB", prefix: "53", mode: "receipt_date", receiptSource: "cream" },
  { sku: "PSBBB", prefix: "54", mode: "receipt_date", receiptSource: "cream" },
  { sku: "1.5KG", prefix: "61", mode: "receipt_date", receiptSource: "cream" },
  { sku: "GHEE-1500", prefix: "61", mode: "receipt_date", receiptSource: "cream" },
  { sku: "400G", prefix: "62", mode: "receipt_date", receiptSource: "cream" },
  { sku: "GHEE-400", prefix: "62", mode: "receipt_date", receiptSource: "cream" },
  { sku: "GHEE-400-24", prefix: "62", mode: "receipt_date", receiptSource: "cream" },
  { sku: "TN3-(TBN PROMO)", prefix: "71", mode: "manual" },
  { sku: "TBN", prefix: "72", mode: "manual" },
  { sku: "GBN (PROMO)", prefix: "73", mode: "manual" },
  { sku: "GBN", prefix: "74", mode: "manual" }
];
var finishedGoodsBatchCodeBySku = Object.fromEntries(
  finishedGoodsBatchCodeDefinitions.map((definition) => [definition.sku, definition])
);
function normalizeFinishedGoodsSku(sku) {
  const normalized = sku.trim().replace(/\s+/g, " ");
  if (normalized.toUpperCase() === "PAN101") return "MPAN101";
  if (normalized.toUpperCase() === "RPAN100 (RYLANDS)") return "RPAN100 Rylands";
  if (normalized.toUpperCase() === "RPAN400 (RYLANDS)") return "RPAN400 Rylands";
  return normalized;
}
var paneerSkuByCode = Object.fromEntries(paneerSkuDefinitions.map((definition) => [definition.sku, definition]));
var crumbingSkuByCode = Object.fromEntries(crumbingSkuDefinitions.map((definition) => [definition.sku, definition]));
var gheeSkuByCode = Object.fromEntries(gheeSkuDefinitions.map((definition) => [definition.sku, definition]));
function getAllowedPaneerSkus(roundType, cuttingType) {
  return paneerSkuDefinitions.filter((definition) => {
    if (!definition.sourceTypes.includes(roundType)) return false;
    return !definition.cutTypes || !cuttingType || definition.cutTypes.includes(cuttingType);
  });
}
function getDefaultPaneerCaseWeightKg(definition) {
  if (!definition) return 0;
  return (definition.unitsPerCase || 0) * definition.unitWeightKg;
}
function getPaneerPackWeight(definition, cases, loose, looseWeightKg, weightKg, caseWeightKg) {
  if (!definition) return 0;
  if (definition.packMode === "weight_only") return Math.max(0, weightKg);
  const caseWeight = definition.packMode === "weight_loose" ? Math.max(0, caseWeightKg || getDefaultPaneerCaseWeightKg(definition)) : getDefaultPaneerCaseWeightKg(definition);
  const looseWeight = definition.packMode === "weight_loose" ? Math.max(0, looseWeightKg) : Math.max(0, loose) * definition.unitWeightKg;
  return Math.max(0, cases) * caseWeight + looseWeight;
}

// src/lib/paneerBalance.ts
function calculatePaneerRemainingBalance(outputWeight, sppRecordedWeight = 0, packedSkus = [], clothWeightKg = 0) {
  const packedWeight = packedSkus.reduce((total, pack) => {
    const weight = pack.weightKg !== void 0 ? pack.weightKg : getPaneerPackWeight(
      paneerSkuByCode[pack.sku],
      pack.cases || 0,
      pack.loose || 0,
      pack.looseWeightKg || 0,
      0,
      pack.caseWeightKg
    );
    return total + weight;
  }, 0);
  return Math.round((outputWeight - Math.max(0, clothWeightKg) - Math.max(0, sppRecordedWeight) - packedWeight) * 1e9) / 1e9;
}
function getPaneerRoundRemainingBalance(round) {
  if (round.type !== "D" && round.type !== "C/S") return round.remainingBalance ?? round.outputWeight;
  if (round.remainingBalance === void 0 && round.sppRecordedWeight === void 0 && !round.packedSkus?.length && round.paneerCuttingDetails?.clothKg == null) return void 0;
  return calculatePaneerRemainingBalance(round.outputWeight, round.sppRecordedWeight, round.packedSkus || [], round.paneerCuttingDetails?.clothKg ?? 0);
}

// src/lib/halloumiRecipe.ts
var HALLOUMI_RECIPE_MILK_LITRES = 240;
var HALLOUMI_DEFAULT_SALT_G = 750;
var quantity = (n) => Math.round(n * 1e9) / 1e9;
function halloumiPlanningRecipe(milkLitres, saltGPer240L = HALLOUMI_DEFAULT_SALT_G) {
  if (![milkLitres, saltGPer240L].every((n) => Number.isFinite(n) && n >= 0)) throw Error("Halloumi milk and salt allowance must be zero or positive.");
  const rounds = milkLitres / HALLOUMI_RECIPE_MILK_LITRES;
  return { milkLitres, rounds, calciumChlorideKg: quantity(rounds * 0.192), rennetMl: quantity(rounds * 15), saltKg: quantity(rounds * saltGPer240L / 1e3), calciumWaterLitres: quantity(rounds * 3.8), rennetWaterLitres: quantity(rounds * 0.5), saltGPer240L };
}

// src/traceability/liquidIngredients.ts
var ml = (n) => Math.round(n * 1e9) / 1e9;
function liquidChecklistForecast(plan) {
  const recipe = halloumiPlanningRecipe(plan.planHalloumiLitres ?? 0, plan.halloumiSaltGPer240L);
  return recipe.milkLitres > 0 ? [{ id: "rennet", name: "Rennet", unit: "mL", total: recipe.rennetMl }] : [];
}
function liquidPrepared(row) {
  if (row.floorBalanceMl === null || row.containers.some((c) => c.volumeMl === null)) return null;
  return ml(row.floorBalanceMl + row.containers.reduce((n, c) => n + (c.volumeMl ?? 0), 0));
}
function liquidGaps(row, requiredMl) {
  const gaps = [];
  if (!row.responsible.trim()) gaps.push("Enter the responsible person\u2019s name.");
  if (row.floorBalanceMl === null) gaps.push("Enter the floor balance in mL, or 0 if none.");
  else if (row.floorBalanceMl > 0 && !row.floorBatchCodes.trim()) gaps.push("Enter the floor bottle\u2019s batch/lot code.");
  if (row.containers.some((c) => c.volumeMl === null || !c.batchCode.trim())) gaps.push("Enter the volume and batch/lot code of each bottle brought from storage.");
  const prepared = liquidPrepared(row);
  if (prepared !== null && prepared < requiredMl) gaps.push(`Shortfall: ${ml(requiredMl - prepared)} mL (${prepared} mL prepared / ${requiredMl} mL required).`);
  return gaps;
}
function recordLiquidReadiness(state, lotId, entry, expectedRevision, actor, role, at, id) {
  const plan = state.lots[lotId], revision = plan?.audit[plan.audit.length - 1]?.id || "";
  if (!plan || !revision || revision !== expectedRevision) throw Error("The production plan changed. Reload the checklist.");
  const required = liquidChecklistForecast(plan.value).find((r) => r.id === entry.ingredientId);
  if (!required) throw Error("This liquid ingredient is not required by the latest plan.");
  const previous = state.liquidReadiness?.[lotId]?.[entry.ingredientId], draft = entry.draft;
  if ((previous?.audit[previous.audit.length - 1]?.id || "") !== entry.expectedCheckId) throw Error("This ingredient check changed elsewhere. Reload before saving.");
  if (!draft || !Array.isArray(draft.containers) || typeof draft.responsible !== "string" || typeof draft.floorBatchCodes !== "string" || typeof draft.supplier !== "string" || typeof draft.onSite !== "boolean") throw Error("Enter valid liquid preparation details.");
  for (const n of [draft.floorBalanceMl, ...draft.containers.map((c) => c.volumeMl)]) if (n !== null && (!Number.isFinite(n) || n < 0)) throw Error("Liquid quantities must be zero or positive, in mL.");
  if (new Set(draft.containers.map((c) => c.id)).size !== draft.containers.length || draft.containers.some((c) => !c.id || typeof c.batchCode !== "string" || c.volumeMl === 0)) throw Error("Each storage bottle needs its own entry and a positive volume.");
  if (!["owner", "admin"].includes(role) && draft.supplier !== (previous?.value.supplier || "")) throw Error("Only Owner/Admin can change the supplier.");
  if (previous && previous.value.checkedBy !== actor && previous.value.planRevision === revision && !["owner", "admin"].includes(role)) throw Error("Only the original checker or Owner/Admin may revise this check.");
  const gaps = liquidGaps(draft, required.total);
  if (draft.onSite && gaps.length) throw Error(`Rennet: ${gaps.join(" ")}`);
  const value = { ...draft, planRevision: revision, requiredMl: required.total, checkedBy: actor, checkedAt: at };
  const physical = (v) => ({ ...v, supplier: "", checkedBy: "", checkedAt: "" });
  if (previous && JSON.stringify(physical(previous.value)) === JSON.stringify(physical(value))) {
    value.checkedBy = previous.value.checkedBy;
    value.checkedAt = previous.value.checkedAt;
  }
  if (previous && JSON.stringify(previous.value) === JSON.stringify(value)) return state;
  const audit = { id, at, actor, role, reason: draft.onSite ? "Confirmed ready at factory" : "Readiness progress recorded", before: previous?.value ?? null, after: value };
  const saved = { value, audit: [...previous?.audit || [], audit] };
  return { ...state, liquidReadiness: { ...state.liquidReadiness, [lotId]: { ...state.liquidReadiness?.[lotId], [entry.ingredientId]: saved } } };
}

// src/lib/paneerRecipe.ts
var PANEER_RECIPE_VERSION = "paneer-2026-10-28-v1";
var PANEER_RECIPE_BASIS_LITRES = 500;
var shared = [
  { id: "calcium_chloride", name: "Calcium chloride", quantity: 400, unit: "g" },
  { id: "gdl", name: "GDL", quantity: 1850, unit: "g" },
  { id: "potassium_sorbate", name: "Potassium sorbate", quantity: 250, unit: "g" }
];
var csOnly = [
  { id: "fis", name: "FIS", quantity: 835, unit: "g" },
  { id: "af_oil", name: "AF oil", quantity: 20, unit: "kg" }
];
function getPaneerRecipe(type, milkLitres) {
  if (type !== "D" && type !== "C/S") throw new Error("A paneer recipe is available only for D and C/S rounds.");
  if (!Number.isFinite(milkLitres) || milkLitres <= 0) throw new Error("Enter a positive milk quantity for the paneer recipe.");
  return {
    version: PANEER_RECIPE_VERSION,
    paneerType: type,
    basisMilkLitres: PANEER_RECIPE_BASIS_LITRES,
    milkLitres,
    lines: [...shared, ...type === "C/S" ? csOnly : []].map((line) => ({
      ...line,
      quantity: Math.round(line.quantity * milkLitres / PANEER_RECIPE_BASIS_LITRES * 1e6) / 1e6
    }))
  };
}
function getPaneerRecipeMilkLitres(round) {
  return Number.isFinite(round.actualInput) && round.actualInput > 0 ? round.actualInput : round.plannedInput;
}
function latestPaneerIngredientIssue(round) {
  return round.paneerIngredientIssues?.[round.paneerIngredientIssues.length - 1];
}
function paneerIssueMatchesRound(round) {
  const issue = latestPaneerIngredientIssue(round);
  return Boolean(issue && issue.paneerType === round.type && issue.milkLitres === getPaneerRecipeMilkLitres(round));
}
function recordPaneerIngredientAllocation(round, recordedAt, recordedBy, reason, allowInitialIssue = false) {
  if (round.type !== "D" && round.type !== "C/S") return round;
  const previous = latestPaneerIngredientIssue(round);
  if (!previous && (!allowInitialIssue || round.status !== "in_production" || !round.vat)) return round;
  if (previous && paneerIssueMatchesRound(round)) return round;
  const recipe = getPaneerRecipe(round.type, getPaneerRecipeMilkLitres(round));
  const ids = /* @__PURE__ */ new Set([...recipe.lines.map((line) => line.id), ...(previous?.lines || []).map((line) => line.id)]);
  const changes = [...ids].flatMap((id) => {
    const next = recipe.lines.find((line) => line.id === id);
    const old = previous?.lines.find((line) => line.id === id);
    const quantity2 = Math.round(((next?.quantity || 0) - (old?.quantity || 0)) * 1e6) / 1e6;
    return quantity2 === 0 ? [] : [{ ...next || old, quantity: quantity2 }];
  });
  const issue = {
    ...recipe,
    id: `paneer-issue-${round.id}-${(round.paneerIngredientIssues?.length || 0) + 1}`,
    kind: previous ? "adjustment" : "issue",
    recordedAt,
    recordedBy,
    vat: round.vat || previous.vat,
    reason,
    changes
  };
  return {
    ...round,
    paneerIngredientIssues: [...round.paneerIngredientIssues || [], issue],
    historyEvents: [...round.historyEvents || [], {
      id: issue.id,
      type: previous ? "paneer_recipe_adjusted" : "paneer_ingredients_issued",
      stage: previous ? "Paneer Recipe Allocation Adjusted" : "Paneer Ingredients Issued",
      occurredAt: recordedAt,
      recordedBy,
      source: "workflow",
      details: `${recipe.paneerType} \xB7 ${recipe.milkLitres} L \xB7 ${changes.map((line) => `${line.name}: ${previous && line.quantity > 0 ? "+" : ""}${line.quantity} ${line.unit}`).join(" \xB7 ")} \xB7 ${reason}`
    }]
  };
}

// src/traceability/domain.ts
var TRACE_VERSION = "proposed-20261111-v1";
var shifts = ["A", "B", "C", "D", "F", "G", "H", "J", "M", "N"];
var agreedPrefixes = { ...Object.fromEntries(finishedGoodsBatchCodeDefinitions.map((d) => [d.sku, d.prefix])), "C/S": "90", D: "80", MPAN111: "08", RPAN111: "09", RSPP: "91", MSPP: "81", Cream: "92", Halloumi: "93", Butter: "50", PUBBB: "53", PSBBB: "54", Ghee: "60", MPAN100: "11", MPAN200: "12", MPAN400: "13", VJPAN: "14", RPAN100: "21", RPAN200: "22", RPAN400: "23", SPP: "31", "ROZ SPP": "41" };
function validDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = /* @__PURE__ */ new Date(date + "T12:00:00Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}
function batchCode(prefix, date, shift, round) {
  if (!/^[A-Z0-9]{1,8}$/.test(prefix)) throw Error("Confirm a product prefix first.");
  if (!validDate(date)) throw Error("Confirm the start of production date in Milk Receiving.");
  if (!Number.isInteger(shift) || shift < 1 || shift > shifts.length) throw Error("Shift letter is not configured for this shift.");
  if (round !== void 0 && (!Number.isInteger(round) || round < 1)) throw Error("Round must be a positive whole number.");
  return `${prefix}-${date.slice(8, 10)}${date.slice(5, 7)}${shifts[shift - 1]}${round ?? ""}`;
}
function safeCode(prefix, date, shift, round) {
  try {
    return { code: batchCode(prefix || "", date, shift, round), gap: "" };
  } catch (e) {
    return { code: "", gap: e.message };
  }
}
var emptyTraceState = { schema: 1, lots: {}, rounds: {}, prefixes: {} };
function emptyRoundTrace(date = "") {
  return { productionDate: date, vessels: [], ingredients: [], cutting: { clothKg: null, trays: null, scrambleKg: null, samplePieces: null, sampleLocation: "", scrambleLocation: "" }, note: "" };
}
function plannedMilkTotal(plan) {
  const values = [plan.planCsLitres, plan.planDirectLitres, plan.planHalloumiLitres ?? 0];
  if (!values.every((n) => Number.isFinite(n) && n >= 0)) throw Error("Planned milk volumes must be zero or positive.");
  halloumiPlanningRecipe(plan.planHalloumiLitres ?? 0, plan.halloumiSaltGPer240L);
  return Math.round(values.reduce((sum, n) => sum + n, 0) * 1e6) / 1e6;
}
function forecast(cs, direct) {
  if (![cs, direct].every((n) => Number.isFinite(n) && n >= 0)) throw Error("Milk quantities must be zero or positive.");
  const rows = /* @__PURE__ */ new Map();
  for (const [type, litres2, column] of [["C/S", cs, "cs"], ["D", direct, "direct"]]) {
    if (!litres2) continue;
    getPaneerRecipe(type, litres2).lines.forEach((line) => {
      const row = rows.get(line.id) || { id: line.id, name: line.name, unit: line.unit, cs: 0, direct: 0, total: 0 };
      row[column] = line.quantity;
      row.total = Math.round((row.cs + row.direct) * 1e6) / 1e6;
      rows.set(line.id, row);
    });
  }
  return [...rows.values()];
}
function checklistForecast(cs, direct, halloumi = 0, saltGPer240L) {
  const rows = forecast(cs, direct).map((row) => {
    const factor = row.unit === "g" ? 1e-3 : 1;
    const kg3 = (value) => Math.round(value * factor * 1e9) / 1e9;
    return { ...row, unit: "kg", cs: kg3(row.cs), direct: kg3(row.direct), halloumi: 0, total: kg3(row.total) };
  });
  const recipe = halloumiPlanningRecipe(halloumi, saltGPer240L);
  if (halloumi > 0) for (const [id, name, amount] of [["calcium_chloride", "Calcium chloride", recipe.calciumChlorideKg], ["salt", "Salt", recipe.saltKg]]) {
    if (amount === 0) continue;
    const row = rows.find((r) => r.id === id);
    if (row) {
      row.halloumi = amount;
      row.total = Math.round((row.total + amount) * 1e9) / 1e9;
    } else rows.push({ id, name, unit: "kg", cs: 0, direct: 0, halloumi: amount, total: amount });
  }
  return rows;
}
function planRevision(plan) {
  return plan?.audit[plan.audit.length - 1]?.id || "";
}
function storageBagTotal(bags) {
  if (bags.some((b) => b.weightKg === null)) return null;
  return Math.round(bags.reduce((sum, b) => sum + (b.weightKg || 0), 0) * 1e9) / 1e9;
}
function numberedBags(bags) {
  const used = new Set(bags.flatMap((b) => b.number === void 0 ? [] : [b.number]));
  let candidate = 1;
  return bags.map((bag) => {
    if (bag.number !== void 0) return { ...bag };
    while (used.has(candidate)) candidate++;
    const number = candidate++;
    used.add(number);
    return { ...bag, number };
  });
}
function preparationBatchCodes(row) {
  const split = (text) => text.split(/[,;\n]+/).map((code) => code.trim()).filter(Boolean);
  if (row.storageBags === void 0) return [...new Set(split(row.supplierBatches))];
  return [.../* @__PURE__ */ new Set([...row.floorBalanceKg && row.floorBalanceKg > 0 ? split(row.floorBatchCodes || "") : [], ...row.storageBags.filter((b) => b.weightKg !== null && b.weightKg > 0).map((b) => b.batchCode.trim()).filter(Boolean)])];
}
function preparedQuantity(row) {
  if (row.floorBalanceKg === void 0 && row.broughtFromStorageKg === void 0 && row.storageBags === void 0) return row.availableKg;
  const brought = row.storageBags === void 0 ? row.broughtFromStorageKg : storageBagTotal(row.storageBags);
  if (row.floorBalanceKg == null || brought == null) return null;
  return Math.round((row.floorBalanceKg + brought) * 1e9) / 1e9;
}
function readinessGaps(row, requiredKg) {
  const gaps = [];
  if (!row.responsible.trim()) gaps.push("Enter the responsible person\u2019s name.");
  if (row.storageBags !== void 0) {
    if (row.floorBalanceKg == null) gaps.push("Enter the weighed Bag 0 floor balance, or 0 if none.");
    if (row.floorBalanceKg != null && row.floorBalanceKg > 0 && !(row.floorBatchCodes || "").trim()) gaps.push("Enter Bag 0\u2019s batch/lot code.");
    const incomplete = row.storageBags.filter((b) => b.weightKg === null || !b.batchCode.trim());
    if (incomplete.length) gaps.push(`Enter weight and batch/lot code for ${incomplete.length} incomplete bag(s).`);
  }
  const prepared = preparedQuantity(row);
  if (prepared === null && !gaps.length) gaps.push("Record the weighed floor balance and quantity brought from storage.");
  if (!preparationBatchCodes(row).length && !gaps.length) gaps.push("Record the ingredient batch/lot code.");
  if (prepared !== null && prepared + 1e-9 < requiredKg) gaps.push(`Shortfall: ${Math.round((requiredKg - prepared) * 1e9) / 1e9} kg (${prepared} kg prepared / ${requiredKg} kg required).`);
  return gaps;
}
function recordReadiness(state, lotId, ingredientId, draft, expectedPlanRevision, expectedCheckId, actor, role, at, id) {
  const plan = state.lots[lotId], revision = planRevision(plan);
  if (!plan || !revision || revision !== expectedPlanRevision) throw Error("The production plan changed. Reload the checklist and check the latest requirements.");
  const previous = state.readiness?.[lotId]?.[ingredientId];
  if ((previous?.audit[previous.audit.length - 1]?.id || "") !== expectedCheckId) throw Error("This ingredient check changed elsewhere. Reload before saving.");
  const required = checklistForecast(plan.value.planCsLitres, plan.value.planDirectLitres, plan.value.planHalloumiLitres ?? 0, plan.value.halloumiSaltGPer240L).find((r) => r.id === ingredientId);
  if (!required) throw Error("This ingredient is not required by the latest plan.");
  for (const quantity2 of [draft.availableKg, draft.floorBalanceKg, draft.broughtFromStorageKg]) if (quantity2 !== null && quantity2 !== void 0 && (!Number.isFinite(quantity2) || quantity2 < 0)) throw Error("Ingredient weights must be zero or positive, in kg.");
  if (draft.storageBags !== void 0) {
    if (new Set(draft.storageBags.map((b) => b.id)).size !== draft.storageBags.length) throw Error("Each bag must have a separate entry.");
    const numbers = draft.storageBags.flatMap((b) => b.number === void 0 ? [] : [b.number]);
    if (numbers.some((n) => !Number.isInteger(n) || n < 1) || new Set(numbers).size !== numbers.length) throw Error("Storage bag numbers must be unique positive whole numbers; Bag 0 is the floor balance.");
    if (draft.storageBags.some((b) => !b.id || b.weightKg !== null && (!Number.isFinite(b.weightKg) || b.weightKg <= 0))) throw Error("Enter a positive weight for each bag.");
  }
  const prepared = preparedQuantity(draft);
  const gaps = readinessGaps(draft, required.total);
  if (draft.onSite && gaps.length) throw Error(`${required.name}: ${gaps.join(" ")}`);
  if (!["owner", "admin"].includes(role) && draft.supplier !== (previous?.value.supplier || "")) throw Error("Only owner/admin can enter or change the supplier.");
  if (previous && previous.value.checkedBy !== actor && previous.value.planRevision === revision && !["owner", "admin"].includes(role)) throw Error("Only the original checker or owner/admin may revise this check.");
  const value = { ...draft, ...draft.storageBags !== void 0 ? { broughtFromStorageKg: storageBagTotal(draft.storageBags), supplierBatches: preparationBatchCodes(draft).join("; ") } : {}, availableKg: prepared, planRevision: revision, requiredKg: required.total, checkedBy: actor, checkedAt: at };
  if (previous) {
    const physical = (v) => ({ ...v, supplier: "", checkedBy: "", checkedAt: "" });
    if (JSON.stringify(physical(previous.value)) === JSON.stringify(physical(value))) {
      value.checkedBy = previous.value.checkedBy;
      value.checkedAt = previous.value.checkedAt;
    }
  }
  if (previous && JSON.stringify({ ...previous.value, checkedBy: "", checkedAt: "" }) === JSON.stringify({ ...value, checkedBy: "", checkedAt: "" })) return state;
  const audit = { id, at, actor, role, reason: draft.onSite ? "Confirmed ready at factory" : "Readiness progress recorded", before: previous?.value ?? null, after: value };
  const entry = { value, audit: [...previous?.audit || [], audit] };
  return { ...state, readiness: { ...state.readiness, [lotId]: { ...state.readiness?.[lotId], [ingredientId]: entry } } };
}
function recordChecklist(state, lotId, entries, revision, actor, role, at, id, liquidEntries = []) {
  const weighed = entries.reduce((next, entry, index) => recordReadiness(next, lotId, entry.ingredientId, entry.draft, revision, entry.expectedCheckId, actor, role, at, `${id}:${index}`), state);
  return liquidEntries.reduce((next, entry, index) => recordLiquidReadiness(next, lotId, entry, revision, actor, role, at, `${id}:liquid:${index}`), weighed);
}
function onlyCompletesMissing(before, after) {
  if (before === null || before === void 0 || before === "") return true;
  if (Array.isArray(before)) {
    if (!Array.isArray(after) || after.length < before.length) return false;
    return before.every((item, index) => {
      const id = item && typeof item === "object" && "id" in item ? item.id : void 0;
      const next = id ? after.find((x) => x && typeof x === "object" && x.id === id) : after[index];
      return next !== void 0 && onlyCompletesMissing(item, next);
    });
  }
  if (typeof before === "object" && before !== null) return typeof after === "object" && after !== null && Object.entries(before).every(([key, value]) => onlyCompletesMissing(value, after[key]));
  return Object.is(before, after);
}
function changeRecord(previous, value, actor, role, reason, at, id, allowCompletion = false) {
  if (previous && JSON.stringify(previous.value) === JSON.stringify(value)) return previous;
  const completing = Boolean(previous && allowCompletion && onlyCompletesMissing(previous.value, value));
  if (previous && !completing && !["owner", "admin"].includes(role)) throw Error("Owner/admin must correct an existing traceability record.");
  if (previous && !completing && reason.trim().length < 5) throw Error("Enter a correction reason of at least 5 characters.");
  return { value, audit: [...previous?.audit || [], { id, at, actor, role, reason: reason.trim() || (previous ? "Completed missing details" : "Initial entry"), before: previous?.value ?? null, after: value }] };
}

// src/traceability/labels.ts
function packingLabels(round, sku, lot, state) {
  const productionDate = state.rounds[round.id]?.value.productionDate || round.traceabilityProductionDate || state.lots[round.milkLotId]?.value.productionDate || lot?.traceabilityProductionDate || "";
  const prefixKey = sku === "PAN111" ? round.type === "D" ? "MPAN111" : "RPAN111" : sku;
  const prefix = state.prefixes[prefixKey]?.value || agreedPrefixes[prefixKey];
  const packet = safeCode(prefix, productionDate, round.shiftNumber, round.roundNumber), outer = safeCode(prefix, productionDate, round.shiftNumber);
  return {
    packetBatchCode: packet.code,
    caseBatchCode: outer.code,
    traceabilityProductionDate: productionDate,
    traceabilityPrefixVersion: TRACE_VERSION,
    traceabilityGap: packet.gap
  };
}
function labelsForPacking(round, sku, lot, state, previous) {
  const calculated = packingLabels(round, sku, lot, state);
  if (!previous?.packetBatchCode || previous.sku !== sku) return calculated;
  return {
    ...calculated,
    packetBatchCode: previous.packetBatchCode,
    caseBatchCode: previous.caseBatchCode || calculated.caseBatchCode,
    traceabilityProductionDate: previous.traceabilityProductionDate || calculated.traceabilityProductionDate,
    traceabilityPrefixVersion: previous.traceabilityPrefixVersion || calculated.traceabilityPrefixVersion,
    traceabilityGap: previous.traceabilityGap || ""
  };
}

// src/lib/finishedStock.ts
var butterPackingBySku = {
  PUBB: { productName: "Pure Unsalted Butter Balls", unitsPerCase: 36 },
  PUBBB: { productName: "Pure Unsalted Blended Butter Balls", unitsPerCase: 36 },
  PSBBB: { productName: "Pure Salted Blended Butter Balls", unitsPerCase: 36 },
  BB05: { productName: "Butter Bricks 500g", unitsPerCase: 30 },
  BBO5: { productName: "Butter Bricks 500g", unitsPerCase: 30 }
};
function getFinishedPackingDefinition(sku) {
  const paneer = paneerSkuByCode[sku];
  if (paneer) return {
    productName: paneer.productName,
    unitsPerCase: paneer.unitsPerCase || 0,
    unitBased: paneer.packMode === "units"
  };
  const ghee = gheeSkuByCode[sku];
  if (ghee) return { productName: ghee.productName, unitsPerCase: ghee.bucketsPerCase, unitBased: true };
  const butter = butterPackingBySku[sku];
  if (butter) return { ...butter, unitBased: true };
  return void 0;
}
function getProductionSourceBatchCode(round) {
  return round.batchCode || round.sourceBatchCode || `${round.milkLotCode}/S${round.shiftNumber}/R${round.roundNumber}/${round.type}`;
}
function getLegacyPackingRunId(roundId, packIndex) {
  return `legacy-${roundId}-${packIndex}`;
}
function getProductionPackingEntries(rounds) {
  return rounds.flatMap((round) => {
    if (["cancelled", "spoiled"].includes(round.status)) return [];
    const sourceBatchCode = getProductionSourceBatchCode(round);
    return (round.packedSkus || []).flatMap((rawPack, packIndex) => {
      const sku = normalizeFinishedGoodsSku(rawPack.sku);
      if (sku === "PAN111" || !getFinishedPackingDefinition(sku)) return [];
      const pack = { ...rawPack, sku };
      return [{
        round,
        pack,
        packIndex,
        packingRunId: pack.packingRunId || getLegacyPackingRunId(round.id, packIndex),
        sourceBatchCode
      }];
    });
  });
}
function matchesLegacyStock(stock, entry) {
  return normalizeFinishedGoodsSku(stock.sku) === entry.pack.sku && (stock.sourceBatchCodes || []).includes(entry.sourceBatchCode) && (stock.cases || 0) === (entry.pack.cases || 0) && (stock.loosePackets || 0) === (entry.pack.loose || 0) && (stock.caseWeightKg ?? 0) === (entry.pack.caseWeightKg ?? 0);
}
function reconcileFinishedStock(rounds, finishedStock) {
  const entries = getProductionPackingEntries(rounds);
  const claimedStockIds = /* @__PURE__ */ new Set();
  const productionLines = entries.map((entry) => {
    const linkedStock = finishedStock.find(
      (stock) => !claimedStockIds.has(stock.id) && (stock.packingRunId === entry.packingRunId || !entry.pack.packingRunId && matchesLegacyStock(stock, entry))
    );
    if (linkedStock) {
      claimedStockIds.add(linkedStock.id);
      return {
        ...linkedStock,
        packetBatchCode: linkedStock.packetBatchCode || entry.pack.packetBatchCode,
        caseBatchCode: linkedStock.caseBatchCode || entry.pack.caseBatchCode,
        traceabilityProductionDate: linkedStock.traceabilityProductionDate || entry.pack.traceabilityProductionDate,
        traceabilityPrefixVersion: linkedStock.traceabilityPrefixVersion || entry.pack.traceabilityPrefixVersion,
        traceabilityGap: linkedStock.traceabilityGap || entry.pack.traceabilityGap,
        sku: normalizeFinishedGoodsSku(linkedStock.sku),
        persisted: true,
        sourceRoundId: entry.round.id,
        sourcePackIndex: entry.packIndex
      };
    }
    const definition = getFinishedPackingDefinition(entry.pack.sku);
    const totalPackets = definition?.unitBased ? (entry.pack.cases || 0) * definition.unitsPerCase + (entry.pack.loose || 0) : 0;
    return {
      id: `synthetic-${entry.packingRunId}`,
      sku: entry.pack.sku,
      productName: definition?.productName || entry.pack.sku,
      packingRunId: entry.packingRunId,
      packetBatchCode: entry.pack.packetBatchCode,
      caseBatchCode: entry.pack.caseBatchCode,
      traceabilityProductionDate: entry.pack.traceabilityProductionDate,
      traceabilityPrefixVersion: entry.pack.traceabilityPrefixVersion,
      traceabilityGap: entry.pack.traceabilityGap,
      cases: entry.pack.cases || 0,
      loosePackets: entry.pack.loose || 0,
      totalPackets,
      storageLocation: "Dairy Container (Finished Stock)",
      status: "awaiting_handover",
      createdAt: entry.round.completedAt || entry.round.startTime,
      sourceBatchCodes: [entry.sourceBatchCode],
      ...entry.pack.weightKg !== void 0 ? { weightKg: entry.pack.weightKg } : {},
      ...entry.pack.caseWeightKg !== void 0 ? { caseWeightKg: entry.pack.caseWeightKg } : {},
      ...entry.pack.looseWeightKg !== void 0 ? { looseWeightKg: entry.pack.looseWeightKg } : {},
      persisted: false,
      sourceRoundId: entry.round.id,
      sourcePackIndex: entry.packIndex
    };
  });
  const otherPersistedLines = finishedStock.filter((stock) => !claimedStockIds.has(stock.id)).map((stock) => ({
    ...stock,
    sku: normalizeFinishedGoodsSku(stock.sku),
    persisted: true
  }));
  return [...productionLines, ...otherPersistedLines];
}

// src/traceability/unitStockTransfer.ts
function stockTransferAllocation(stock, cases, loosePackets) {
  if (stock.mixedCaseId && loosePackets) throw Error("A mixed case must retain its full packet composition. Record whole-case handover.");
  return { stockId: stock.id, packingRunId: stock.packingRunId, cases, loosePackets, sourceBatchCodes: stock.sourceBatchCodes, mixedCaseId: stock.mixedCaseId, mixedCaseParts: stock.mixedCaseParts?.map((p) => ({ ...p, packets: p.packets * cases / (stock.mixedCaseCount || 1) })) };
}

// src/traceability/server/handover.ts
var canonical = (x) => JSON.stringify(x, (_, v) => v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]])) : v);
function preparePaneerHandover(d, q, actor, role, at) {
  if (!["owner", "admin"].includes(role)) throw Error("Owner/Admin must verify the quantity and batch code.");
  const { form: f, candidate: c } = q.payload || {};
  const definition = paneerSkuByCode[c?.sku];
  if (!definition || c.sourceType !== "finished_stock" || !c.stockLines?.length) throw Error("Select recorded paneer stock.");
  const lines = reconcileFinishedStock(d.vejoy_productionRounds, d.vejoy_finishedStock);
  const quoted = c.stockLines.map((old) => {
    const current = lines.find((x) => x.id === old.id);
    if (!current || canonical(current) !== canonical(old)) throw Error("Stock changed. Reopen the handover and verify the quantity again.");
    if (current.sku !== c.sku || !["awaiting_handover", "returned"].includes(current.status)) throw Error("Stock is no longer on site.");
    return current;
  });
  const integer = (n) => Number.isSafeInteger(n) && n >= 0, positive = (n) => Number.isFinite(n) && n >= 0;
  if (![f.verifiedCases, f.verifiedLoose].every(integer) || !positive(f.verifiedLooseWeightKg) || !positive(f.quantity)) throw Error("Enter valid cases, packets and weight.");
  const review = f.quantity === 0 && f.partialTransferDisposition === "incorrectly_recorded";
  if (!review && !f.quantityVerified) throw Error("Confirm the physical packed quantity.");
  if (!review && !["Distribution Coldroom", "Rental Cold Storage"].includes(f.destination)) throw Error("Choose the receiving storage location.");
  if (!review && !f.finishedGoodsBatchCode?.trim()) throw Error("Enter the finished-goods batch code.");
  if (!f.handedOverBy?.trim()) throw Error("Enter the person handing over the goods.");
  const units = definition.unitsPerCase || 0, weight = (x) => getPaneerPackWeight(definition, x.cases || 0, x.loosePackets || 0, x.looseWeightKg || 0, x.weightKg || 0, x.caseWeightKg);
  const availableCases = quoted.reduce((a, x) => a + (x.cases || 0), 0), availableLoose = quoted.reduce((a, x) => a + (x.loosePackets || 0), 0), availableLooseKg = quoted.reduce((a, x) => a + (x.looseWeightKg || 0), 0);
  const available = definition.packMode === "units" ? quoted.reduce((a, x) => a + x.totalPackets, 0) : quoted.reduce((a, x) => a + weight(x), 0);
  const requested = definition.packMode === "units" ? f.verifiedCases * units + f.verifiedLoose : definition.packMode === "weight_loose" ? f.verifiedCases * (c.caseWeightKg || getDefaultPaneerCaseWeightKg(definition)) + f.verifiedLooseWeightKg : f.quantity;
  if (Math.abs(requested - f.quantity) > 0.01) throw Error("The verified case/packet count differs from the transfer quantity.");
  const extraCases = Math.max(0, f.verifiedCases - availableCases), extraLoose = Math.max(0, f.verifiedLoose - availableLoose), extraLooseKg = Math.max(0, f.verifiedLooseWeightKg - availableLooseKg);
  const extraKg = definition.packMode === "units" ? (extraCases * units + extraLoose) * definition.unitWeightKg : definition.packMode === "weight_loose" ? extraCases * (c.caseWeightKg || getDefaultPaneerCaseWeightKg(definition)) + extraLooseKg : Math.max(0, f.quantity - available);
  const remaining = Math.max(0, available - Math.min(available, f.quantity));
  if (remaining > 0.01 && !["still_in_production", "incorrectly_recorded"].includes(f.partialTransferDisposition)) throw Error("Classify the untransferred balance.");
  if (remaining > 0.01 && f.partialTransferDisposition === "incorrectly_recorded" && !f.partialDispositionReason?.trim()) throw Error("Enter the discrepancy reason.");
  if (remaining > 0.01 && f.partialTransferDisposition === "still_in_production" && !["Dairy Container (Finished Stock)", "Chiller"].includes(f.partialStorageLocation)) throw Error("Choose Container or Chiller for the remaining stock.");
  let stock = [...d.vejoy_finishedStock], rounds = d.vejoy_productionRounds;
  const allocations = [];
  let serial = 0;
  const add = (row) => {
    const item = { ...row, id: `fs-${q.id}-${++serial}` };
    stock.push(item);
    return item;
  };
  const reviewed = { status: "handed_over", storageLocation: f.destination, finishedGoodsBatchCode: f.finishedGoodsBatchCode.trim(), finishedGoodsBatchCodeReviewedBy: actor, finishedGoodsBatchCodeReviewedAt: at, finishedGoodsBatchCodeReviewMethod: c.finishedGoodsBatchCode === f.finishedGoodsBatchCode.trim() ? "automatic_suggestion" : "owner_admin_override" };
  const remainingState = f.partialTransferDisposition === "incorrectly_recorded" ? "incorrectly_recorded" : "awaiting_handover";
  const remainderInfo = { status: remainingState, storageLocation: f.partialTransferDisposition === "still_in_production" ? f.partialStorageLocation : void 0, productionRemainderReviewId: q.id, ...remainingState === "incorrectly_recorded" ? { incorrectlyRecordedAt: at, incorrectlyRecordedBy: actor, incorrectlyRecordedReason: f.partialDispositionReason.trim() } : {} };
  if (extraKg > 5e-3) {
    const round = rounds.find((x) => x.id === f.extraSourceRoundId);
    if (!round || !["D", "C/S"].includes(round.type) || !definition.sourceTypes.includes(round.type)) throw Error("Choose the paneer source round for the extra packing.");
    if (extraKg > (getPaneerRoundRemainingBalance(round) ?? 0) + 0.01) throw Error("Extra packing exceeds that round\u2019s recorded balance.");
    const pack = { sku: c.sku, cases: extraCases, loose: extraLoose, ...definition.packMode === "weight_loose" ? { caseWeightKg: c.caseWeightKg || getDefaultPaneerCaseWeightKg(definition), looseWeightKg: extraLooseKg } : definition.packMode === "weight_only" ? { weightKg: extraKg } : {}, packingRunId: `pb-${round.id}-${q.id}`, recordedBy: actor, recordedAt: at, lastSaveOperationId: q.id, ...labelsForPacking(round, c.sku, d.vejoy_milkLots.find((x) => x.id === round.milkLotId), d.vejoy_traceability) };
    const balance = (getPaneerRoundRemainingBalance(round) || 0) - extraKg;
    rounds = rounds.map((x) => x.id !== round.id ? x : { ...x, packedSkus: [...x.packedSkus || [], pack], remainingBalance: balance, historyEvents: [...x.historyEvents || [], { id: q.id, type: "packing_recorded", stage: "Packing Recorded", source: "workflow", recordedBy: actor, occurredAt: at, details: `Physical handover verification: ${extraCases} cases + ${extraLoose} loose \xB7 ${extraKg} kg` }] });
    const row = add({ ...pack, productName: c.productName, loosePackets: extraLoose, totalPackets: definition.packMode === "units" ? extraCases * units + extraLoose : 0, sourceBatchCodes: [getProductionSourceBatchCode(round)], createdAt: at, ...reviewed });
    allocations.push(stockTransferAllocation(row, extraCases, extraLoose));
  }
  let casesLeft = Math.min(f.verifiedCases, availableCases), looseLeft = Math.min(f.verifiedLoose, availableLoose), looseKgLeft = Math.min(f.verifiedLooseWeightKg, availableLooseKg), kgLeft = Math.min(f.quantity, available);
  for (const original of quoted) {
    const source = stock.find((x) => x.id === original.id) || original;
    const takeCases = Math.min(original.cases || 0, casesLeft), takeLoose = Math.min(original.loosePackets || 0, looseLeft), takeLooseKg = Math.min(original.looseWeightKg || 0, looseKgLeft);
    const transferred = definition.packMode === "units" ? { cases: takeCases, loosePackets: takeLoose, totalPackets: takeCases * units + takeLoose } : definition.packMode === "weight_loose" ? { cases: takeCases, loosePackets: 0, totalPackets: 0, caseWeightKg: original.caseWeightKg || c.caseWeightKg || getDefaultPaneerCaseWeightKg(definition), looseWeightKg: takeLooseKg } : { cases: 0, loosePackets: 0, totalPackets: 0, weightKg: Math.min(weight(original), kgLeft) };
    const transferredQuantity = definition.packMode === "units" ? transferred.totalPackets : weight({ ...source, ...transferred });
    casesLeft -= takeCases;
    looseLeft -= takeLoose;
    looseKgLeft -= takeLooseKg;
    kgLeft -= transferredQuantity;
    const remainder = definition.packMode === "units" ? { cases: original.cases - takeCases, loosePackets: original.loosePackets - takeLoose, totalPackets: original.totalPackets - transferred.totalPackets } : definition.packMode === "weight_loose" ? { cases: original.cases - takeCases, loosePackets: 0, totalPackets: 0, caseWeightKg: transferred.caseWeightKg, looseWeightKg: (original.looseWeightKg || 0) - takeLooseKg } : { cases: 0, loosePackets: 0, totalPackets: 0, weightKg: weight(original) - transferredQuantity };
    const remainderQuantity = definition.packMode === "units" ? remainder.totalPackets : weight({ ...source, ...remainder });
    const materialize2 = (value) => {
      if (original.persisted) stock = stock.map((x) => x.id === original.id ? { ...x, ...value } : x);
      else add({ ...source, ...value, sourceStockId: original.id });
    };
    if (transferredQuantity <= 0) {
      materialize2({ ...remainder, ...remainderInfo, storageLocation: remainderInfo.storageLocation || original.storageLocation });
      continue;
    }
    if (original.mixedCaseId && takeLoose) throw Error("Mixed cases must move as whole cases.");
    allocations.push(stockTransferAllocation(original, takeCases, takeLoose));
    if (remainderQuantity <= 5e-3) materialize2({ ...transferred, ...reviewed });
    else {
      materialize2({ ...remainder, ...remainderInfo, storageLocation: remainderInfo.storageLocation || original.storageLocation });
      add({ ...source, ...transferred, ...reviewed, packingRunId: `${source.packingRunId}-handover-${q.id}`, sourceStockId: source.id });
    }
  }
  const record = { id: q.id, recordKind: review ? "balance_review" : "handover", sourceType: "finished_stock", sourceId: c.sourceId, sku: c.sku, stockAllocations: allocations, sourceBatchCodes: c.sourceBatchCodes, milkLotCodes: c.milkLotCodes, milkLotGroupLabel: c.milkLotLabel, productName: c.productName, batchCode: c.batchCode, finishedGoodsBatchCode: f.finishedGoodsBatchCode.trim(), finishedGoodsBatchCodeReviewedBy: actor, finishedGoodsBatchCodeReviewedAt: at, finishedGoodsBatchCodeReviewMethod: reviewed.finishedGoodsBatchCodeReviewMethod, quantity: f.quantity, unit: definition.packMode === "units" ? "packets" : "kg", cases: f.verifiedCases, looseQuantity: f.verifiedLoose, storageLocation: f.destination, destination: f.destination, handedOverBy: f.handedOverBy.trim(), handedOverAt: at, quantityVerified: !review, quantityVerifiedBy: actor, quantityVerifiedAt: at, recordedQuantityBeforeVerification: available, quantityVariance: f.quantity - available, notes: f.notes?.trim() || void 0, ...remaining > 0.01 ? { partialTransferDisposition: f.partialTransferDisposition, partialRemainderQuantity: remaining, partialDispositionReason: f.partialDispositionReason?.trim(), partialReviewedBy: actor, partialStorageLocation: f.partialStorageLocation } : {} };
  return { documents: { ...d, vejoy_productionRounds: rounds, vejoy_finishedStock: stock, vejoy_distributionHandovers: [...d.vejoy_distributionHandovers, record] }, result: record };
}

// src/traceability/mixedPaneerCases.ts
var packingSourceKey = (roundId, pack, index) => JSON.stringify([roundId, pack.packingRunId || `legacy-index:${index}`]);
function loosePacketSources(rounds, lots, state) {
  const used = /* @__PURE__ */ new Map();
  for (const item of Object.values(state.mixedCases || {})) if (!item.voided) for (const part of item.parts) used.set(part.source.key, (used.get(part.source.key) || 0) + part.packets);
  return rounds.filter((r) => ["D", "C/S"].includes(r.type) && !["cancelled", "spoiled"].includes(r.status)).flatMap((round) => (round.packedSkus || []).flatMap((pack, index) => {
    const definition = paneerSkuByCode[pack.sku];
    if (definition?.packMode !== "units" || !definition.unitsPerCase) return [];
    const labels = packingLabels(round, pack.sku, lots.find((l) => l.id === round.milkLotId), state), key = packingSourceKey(round.id, pack, index), usedLoose = used.get(key) || 0;
    return [{
      key,
      roundId: round.id,
      packIndex: index,
      packingRunId: pack.packingRunId,
      fingerprint: JSON.stringify({ pack, lotId: round.milkLotId, lotCode: round.milkLotCode, shift: round.shiftNumber, round: round.roundNumber, type: round.type, productionDate: pack.traceabilityProductionDate || labels.traceabilityProductionDate }),
      sku: pack.sku,
      lotId: round.milkLotId,
      lotCode: round.milkLotCode,
      shift: round.shiftNumber,
      round: round.roundNumber,
      productionDate: pack.traceabilityProductionDate || labels.traceabilityProductionDate,
      shiftStartedAt: round.startTime || "",
      packetBatchCode: pack.packetBatchCode || "",
      caseBatchCode: pack.caseBatchCode || "",
      recordedLoose: pack.loose || 0,
      usedLoose,
      availableLoose: Math.max(0, (pack.loose || 0) - usedLoose)
    }];
  }));
}
function requestFingerprint(request) {
  return JSON.stringify({ sku: request.sku, caseCount: request.caseCount, parts: [...request.parts].sort((a, b) => a.key.localeCompare(b.key)) });
}
function buildMixedPaneerCase(request, rounds, lots, state, actor, at) {
  const definition = paneerSkuByCode[request.sku];
  if (definition?.packMode !== "units" || !definition.unitsPerCase) throw Error("Choose a paneer SKU packed by packet count.");
  if (!Number.isSafeInteger(request.caseCount) || request.caseCount < 1) throw Error("Enter a positive whole number of cases.");
  if (!request.id || !actor.trim()) throw Error("The case reference and recorder are required.");
  if (request.parts.length < 1 || new Set(request.parts.map((p) => p.key)).size !== request.parts.length) throw Error("Choose at least one loose-packet entry, once each.");
  const sources = loosePacketSources(rounds, lots, state);
  const parts = request.parts.map((part) => {
    const source = sources.find((s) => s.key === part.key);
    if (!source || source.sku !== request.sku) throw Error("The selected packing source no longer matches this SKU.");
    if (source.fingerprint !== part.expectedFingerprint) throw Error("A source packing entry changed. Reopen this form and review the remaining loose packets.");
    if (!Number.isSafeInteger(part.packets) || part.packets < 1) throw Error("Enter a positive whole packet count for each source.");
    if (part.packets > source.availableLoose) throw Error(`Lot ${source.lotCode}, S${source.shift}/R${source.round}: only ${source.availableLoose} loose packets remain available.`);
    return { source: structuredClone(source), packets: part.packets };
  });
  if (request.parts.some((p) => p.packets % request.caseCount !== 0)) throw Error("Grouped cases must have the same packet contribution per case. Record different compositions separately.");
  const required = request.caseCount * definition.unitsPerCase;
  if (parts.reduce((sum, p) => sum + p.packets, 0) !== required) throw Error(`${request.caseCount} case(s) require exactly ${required} packets in total.`);
  const groups = /* @__PURE__ */ new Map();
  for (const part of parts) {
    const key = JSON.stringify([part.source.lotId, part.source.productionDate, part.source.shift]), previous = groups.get(key);
    groups.set(key, { source: previous && previous.source.shiftStartedAt > part.source.shiftStartedAt ? previous.source : part.source, packets: (previous?.packets || 0) + part.packets });
  }
  const latestShift = (a, b) => {
    if (a.lotId === b.lotId && a.shift !== b.shift) return b.shift - a.shift;
    const timeA = Date.parse(a.shiftStartedAt), timeB = Date.parse(b.shiftStartedAt);
    if (Number.isFinite(timeA) && Number.isFinite(timeB) && timeA !== timeB) return timeB - timeA;
    return b.productionDate.localeCompare(a.productionDate) || b.shift - a.shift;
  };
  const majority = [...groups.values()].sort((a, b) => b.packets - a.packets || latestShift(a.source, b.source))[0].source;
  const round = rounds.find((r) => r.id === majority.roundId);
  const label = majority.caseBatchCode || packingLabels(round, request.sku, lots.find((l) => l.id === majority.lotId), state).caseBatchCode;
  if (!label) throw Error("Confirm this SKU\u2019s prefix and start of production date before assigning the case label.");
  return { id: request.id, number: Math.max(0, ...Object.values(state.mixedCases || {}).map((c) => c.number || 0)) + 1, sku: request.sku, caseCount: request.caseCount, packetsPerCase: definition.unitsPerCase, caseBatchCode: label, productionDate: majority.productionDate, labelLotId: majority.lotId, labelShift: majority.shift, parts, recordedAt: at, recordedBy: actor, requestFingerprint: requestFingerprint(request) };
}
function recordMixedPaneerCase(state, request, rounds, lots, actor, at) {
  const previous = state.mixedCases?.[request.id];
  if (previous) {
    if (previous.requestFingerprint !== requestFingerprint(request) || previous.recordedBy !== actor) throw Error("This case reference already belongs to a different entry.");
    return state;
  }
  const entry = buildMixedPaneerCase(request, rounds, lots, state, actor, at);
  return { ...state, mixedCases: { ...state.mixedCases, [entry.id]: entry } };
}
function voidMixedPaneerCase(state, id, reason, actor, role, at) {
  if (!["owner", "admin"].includes(role)) throw Error("Only owner/admin may correct a case assembly.");
  if (reason.trim().length < 5) throw Error("Enter a reason for cancelling this assembly record.");
  const entry = state.mixedCases?.[id];
  if (!entry) throw Error("Case assembly not found.");
  if (entry.voided) return state;
  return { ...state, mixedCases: { ...state.mixedCases, [id]: { ...entry, voided: { at, by: actor, reason: reason.trim() } } } };
}

// src/traceability/mixedCaseStock.ts
var onSite = (line) => ["awaiting_handover", "returned"].includes(line.status);
function stockForLooseSource(source, lines) {
  const run = source.packingRunId || getLegacyPackingRunId(source.roundId, source.packIndex);
  return lines.filter((l) => !l.mixedCaseId && l.sku === source.sku && (l.sourceRoundId === source.roundId && l.sourcePackIndex === source.packIndex || l.packingRunId === run || l.packingRunId.startsWith(run + "-")));
}
function materialize(state, stock, entry, rounds, lots, actor, at) {
  if (entry.voided) throw Error("A cancelled case cannot be linked to stock.");
  if (entry.stockLink) {
    if (!stock.some((s) => s.mixedCaseId === entry.id)) throw Error("The linked case stock record is missing. Owner review required.");
    return { state, stock };
  }
  let nextStock = [...stock];
  const allocations = [], before = [], after = [];
  const sources = loosePacketSources(rounds, lots, state);
  for (const part of entry.parts) {
    const current = sources.find((s) => s.key === part.source.key);
    if (!current || current.fingerprint !== part.source.fingerprint || current.usedLoose > current.recordedLoose) throw Error("A case source changed. Review its original packing entry before linking stock.");
    const lines = stockForLooseSource(current, reconcileFinishedStock(rounds, nextStock)).filter(onSite).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    let left = part.packets;
    for (const line2 of lines) {
      const take = Math.min(left, line2.loosePackets);
      if (take <= 0) continue;
      const updated = { ...line2, loosePackets: line2.loosePackets - take, totalPackets: line2.totalPackets - take };
      before.push(structuredClone(line2));
      after.push(structuredClone(updated));
      allocations.push({ sourceKey: current.key, stockId: line2.id, packets: take });
      nextStock = nextStock.some((s) => s.id === line2.id) ? nextStock.map((s) => s.id === line2.id ? updated : s) : [...nextStock, updated];
      left -= take;
    }
    if (left) throw Error(`Lot ${part.source.lotCode} S${part.source.shift}/R${part.source.round}: ${left} required loose packets are not on site. Already transferred stock cannot be assembled again.`);
  }
  const id = `mixed-stock-${entry.id}`;
  if (nextStock.some((s) => s.id === id || s.mixedCaseId === entry.id)) throw Error("Case stock already exists without its allocation link. Owner review required.");
  const sourcesCodes = [...new Set(entry.parts.map((p) => getProductionSourceBatchCode(rounds.find((r) => r.id === p.source.roundId))))];
  const line = { id, sku: entry.sku, productName: paneerSkuByCode[entry.sku].productName, packingRunId: `mixed-case-${entry.id}`, cases: entry.caseCount, loosePackets: 0, totalPackets: entry.caseCount * entry.packetsPerCase, storageLocation: "Dairy Container (Finished Stock)", status: "awaiting_handover", createdAt: at, sourceBatchCodes: sourcesCodes, finishedGoodsBatchCode: entry.caseBatchCode, caseBatchCode: entry.caseBatchCode, traceabilityProductionDate: entry.productionDate, mixedCaseId: entry.id, mixedCaseCount: entry.caseCount, mixedCaseParts: structuredClone(entry.parts) };
  nextStock.push(line);
  after.push(structuredClone(line));
  const linked = { ...entry, stockLink: { at, by: actor, stockId: id, allocations } };
  const event = { id: "assemble-" + entry.id, kind: "assembly", at, by: actor, reason: "Existing loose packets physically assembled into cases", caseId: entry.id, before, after };
  return { state: { ...state, mixedCases: { ...state.mixedCases, [entry.id]: linked }, stockEvents: { ...state.stockEvents, [event.id]: event } }, stock: nextStock };
}
function assembleMixedCaseStock(state, stock, request, rounds, lots, actor, at) {
  const next = recordMixedPaneerCase(state, request, rounds, lots, actor, at);
  return materialize(next, stock, next.mixedCases[request.id], rounds, lots, actor, at);
}
function linkExistingMixedCaseStock(state, stock, id, rounds, lots, actor, role, at) {
  if (!["owner", "admin"].includes(role)) throw Error("Owner/Admin must review an earlier assembly before linking its stock.");
  const entry = state.mixedCases?.[id];
  if (!entry) throw Error("Case not found.");
  return materialize(state, stock, entry, rounds, lots, actor, at);
}
function cancelMixedCaseStock(state, stock, id, reason, actor, role, at) {
  const entry = state.mixedCases?.[id];
  if (!entry) throw Error("Case not found.");
  if (entry.voided) return { state, stock };
  const next = voidMixedPaneerCase(state, id, reason, actor, role, at);
  if (!entry.stockLink) return { state: next, stock };
  const caseLines = stock.filter((s) => s.mixedCaseId === id), total = caseLines.reduce((n, s) => n + s.totalPackets, 0);
  if (caseLines.some((s) => s.totalPackets > 0 && !onSite(s)) || total !== entry.caseCount * entry.packetsPerCase) throw Error("Return all case stock to production before cancelling this assembly. Transferred or discrepancy stock cannot be released as loose again.");
  const before = structuredClone(caseLines), after = [];
  let nextStock = stock.map((s) => s.mixedCaseId === id ? { ...s, cases: 0, loosePackets: 0, totalPackets: 0, status: "incorrectly_recorded", incorrectlyRecordedAt: at, incorrectlyRecordedBy: actor, incorrectlyRecordedReason: "Assembly cancelled: " + reason } : s);
  entry.parts.forEach((part, index) => {
    const run = part.source.packingRunId || getLegacyPackingRunId(part.source.roundId, part.source.packIndex);
    const original = stock.find((s) => s.id === entry.stockLink.allocations.find((a) => a.sourceKey === part.source.key)?.stockId);
    if (!original) throw Error("Original source stock reference missing. Owner review required.");
    const released = { ...original, id: `released-${id}-${index}`, packingRunId: `${run}-assembly-release-${id}`, cases: 0, loosePackets: part.packets, totalPackets: part.packets, status: "awaiting_handover", storageLocation: "Dairy Container (Finished Stock)", createdAt: at, mixedCaseId: void 0, mixedCaseParts: void 0, mixedCaseCount: void 0, sourceStockId: original.id };
    nextStock.push(released);
    after.push(released);
  });
  const event = { id: "disassemble-" + id, kind: "disassembly", at, by: actor, reason, caseId: id, before, after };
  return { state: { ...next, stockEvents: { ...next.stockEvents, [event.id]: event } }, stock: nextStock };
}
function returnMixedCaseStock(state, stock, request, actor, role, at) {
  if (!["owner", "admin"].includes(role)) throw Error("Owner/Admin must record returns.");
  const prior = state.stockEvents?.[request.id];
  if (prior) {
    if (prior.requestFingerprint !== JSON.stringify(request) || prior.by !== actor) throw Error("Return reference already used.");
    return { state, stock };
  }
  const line = stock.find((s) => s.id === request.stockId);
  if (!line?.mixedCaseId || line.status !== "handed_over") throw Error("Select transferred mixed-case stock.");
  if (JSON.stringify(line) !== request.expectedStock) throw Error("Stock changed. Reopen the return.");
  if (!Number.isSafeInteger(request.cases) || request.cases <= 0 || request.cases > line.cases || request.reason.trim().length < 5) throw Error("Enter available whole cases and a return reason.");
  if (!["Dairy Container (Finished Stock)", "Chiller"].includes(request.location)) throw Error("Choose a production return location.");
  const units = paneerSkuByCode[line.sku].unitsPerCase, returned = { ...line, id: "return-" + request.id, packingRunId: line.packingRunId + "-return-" + request.id, cases: request.cases, loosePackets: 0, totalPackets: request.cases * units, status: "returned", storageLocation: request.location, sourceStockId: line.id };
  const remaining = { ...line, cases: line.cases - request.cases, totalPackets: line.totalPackets - request.cases * units };
  const event = { id: request.id, kind: "return", requestFingerprint: JSON.stringify(request), at, by: actor, reason: request.reason, caseId: line.mixedCaseId, before: [structuredClone(line)], after: [remaining, returned] };
  return { state: { ...state, stockEvents: { ...state.stockEvents, [event.id]: event } }, stock: [...stock.map((s) => s.id === line.id ? remaining : s), returned] };
}

// src/traceability/pan111Reconciliation.ts
var kg = (n) => Math.round(n * 1e9) / 1e9;
function lotScrambleSummary(rounds, lotId, state) {
  const sources = rounds.filter((r) => r.milkLotId === lotId && ["D", "C/S"].includes(r.type) && !["cancelled", "spoiled"].includes(r.status)).filter((r) => r.blockWeights?.length || r.cutBy || r.paneerCuttingDetails || state.rounds[r.id]?.value.cutting.scrambleKg != null).map((r) => ({ roundId: r.id, shift: r.shiftNumber, round: r.roundNumber, kg: r.paneerCuttingDetails?.scrambleKg ?? state.rounds[r.id]?.value.cutting.scrambleKg ?? null })).sort((a, b) => a.shift - b.shift || a.round - b.round || a.roundId.localeCompare(b.roundId));
  if (sources.some((s) => s.kg !== null && (!Number.isFinite(s.kg) || s.kg < 0))) throw Error("A scramble weight is invalid. Review its source round.");
  return { sources, totalKg: kg(sources.reduce((n, s) => n + (s.kg || 0), 0)), missingRoundIds: sources.filter((s) => s.kg === null).map((s) => s.roundId) };
}
function sourceStock(lot, stock) {
  return stock.filter((s) => s.productId === "pan111" && s.sourceMilkLotCode === lot.lotCode);
}
function pan111Fingerprint(rounds, lot, state, stock) {
  return JSON.stringify({ lotId: lot.id, lotCode: lot.lotCode, sources: lotScrambleSummary(rounds, lot.id, state).sources, stock: sourceStock(lot, stock) });
}
function reconcilePan111(state, stock, request, rounds, lots, actor, role, at) {
  if (!["owner", "admin"].includes(role.toLowerCase())) throw Error("Only Owner/Admin may confirm final PAN111.");
  if (!request.id || !actor.trim()) throw Error("A save reference and recorder are required.");
  const requestKey = JSON.stringify(request), previous = state.pan111Reconciliations?.[request.lotId];
  if (previous) {
    if (previous.id === request.id && previous.requestKey === requestKey && previous.recordedBy === actor) return { state, stock };
    throw Error("Final PAN111 has already been recorded for this milk lot. Review the saved reconciliation; do not add it twice.");
  }
  const lot = lots.find((l) => l.id === request.lotId);
  if (!lot) throw Error("Milk lot not found.");
  if (!Number.isFinite(request.measuredKg) || request.measuredKg < 0) throw Error("Final PAN111 must be zero or positive, in kg.");
  if (pan111Fingerprint(rounds, lot, state, stock) !== request.expectedFingerprint) throw Error("Scramble or PAN111 stock changed. Reopen the form before confirming.");
  const summary = lotScrambleSummary(rounds, lot.id, state), measuredKg = kg(request.measuredKg), differenceKg = kg(measuredKg - summary.totalKg);
  if ((Math.abs(differenceKg) > 1e-9 || summary.missingRoundIds.length) && request.reason.trim().length < 5) throw Error("Enter a reason for the lot-level difference or missing round measurements.");
  const existing = sourceStock(lot, stock), existingKg = kg(existing.reduce((n, s) => n + s.producedQuantity, 0));
  if (existing.some((s) => !Number.isFinite(s.producedQuantity) || s.producedQuantity < 0) || existingKg > measuredKg) throw Error(`Existing PAN111 recovery records total ${existingKg} kg. Owner must review those recoveries before confirming a lower final amount; they will not be overwritten.`);
  const additional = kg(measuredKg - existingKg), id = "pan111-final-" + request.id;
  const added = [];
  if (additional > 0) {
    if (stock.some((s) => s.id === id)) throw Error("This stock reference already exists. Review the saved recovery.");
    added.push({ id, lotCode: `PAN111-${lot.lotCode}`, productId: "pan111", productName: "PAN111 (Recovered Paneer)", productClass: "intermediate", sourceBatchId: lot.id, sourceBatchCode: lot.lotCode, producedQuantity: additional, currentQuantity: additional, uom: "kg", storageLocation: "Chiller", status: "available", producedAt: at, sourceMilkLotCode: lot.lotCode, sourceShift: 0, sourceRound: 0, qualityClass: "standard", shelfLifeDays: 730, useByDate: new Date(Date.parse(at) + 730 * 864e5).toISOString(), priorityUse: false });
  }
  const entry = { id: request.id, lotId: lot.id, lotCode: lot.lotCode, sources: structuredClone(summary.sources), scrambleKg: summary.totalKg, measuredKg, differenceKg, missingRoundIds: summary.missingRoundIds, reason: request.reason.trim(), recordedAt: at, recordedBy: actor, requestKey, stockIds: [...existing, ...added].map((s) => s.id) };
  return { state: { ...state, pan111Reconciliations: { ...state.pan111Reconciliations, [lot.id]: entry } }, stock: added.length ? [...stock, ...added] : stock };
}

// src/traceability/paneerTrays.ts
function trayAssignment(round) {
  const numbers = round.paneerCuttingDetails?.trayNumbers || [], history = round.paneerCuttingHistory || [];
  let last2, previous = "";
  for (const entry of history) {
    const key = JSON.stringify(entry.details.trayNumbers || []);
    if (key !== previous) {
      if (key === JSON.stringify(numbers)) last2 = entry;
      previous = key;
    }
  }
  return { numbers, sequence: last2?.sequence || 0, at: last2?.recordedAt || "", key: JSON.stringify({ numbers, eventId: last2?.id || "legacy" }) };
}
function trayPackingProgress(round) {
  const assignment = trayAssignment(round), history = round.paneerTrayPackingHistory || [], matching = history.filter((e) => e.assignmentKey === assignment.key), last2 = matching[matching.length - 1];
  const inferred = ["packed", "handed_over"].includes(round.status);
  const packed = inferred ? [...assignment.numbers] : last2 ? assignment.numbers.filter((n) => last2.packedNumbers.includes(n)) : [];
  return { assignment, packed, pending: assignment.numbers.filter((n) => !packed.includes(n)), explicit: Boolean(last2), inferred, assignmentChanged: !inferred && history.length > 0 && !last2 };
}
function trayPackingFingerprint(round) {
  return JSON.stringify({ assignment: trayAssignment(round).key, history: round.paneerTrayPackingHistory || [], wholeRoundPacked: ["packed", "handed_over"].includes(round.status) });
}
function saveTrayPacking(rounds, request, actor, role, at) {
  if (!request.id || !actor.trim()) throw Error("A save reference and recorder are required.");
  const requestKey = JSON.stringify(request), prior = rounds.find((r) => r.paneerTrayPackingHistory?.some((h) => h.id === request.id));
  if (prior) {
    const entry2 = prior.paneerTrayPackingHistory.find((h) => h.id === request.id);
    if (prior.id !== request.roundId || entry2.requestKey !== requestKey || entry2.recordedBy !== actor) throw Error("This save reference belongs to a different tray packing record.");
    return rounds;
  }
  const round = rounds.find((r) => r.id === request.roundId);
  if (!round) throw Error("Round not found.");
  const progress = trayPackingProgress(round), assigned = progress.assignment.numbers;
  if (!["D", "C/S"].includes(round.type) || !assigned.length) throw Error("Record this paneer round\u2019s physical tray numbers first.");
  if (["scheduled", "in_production", "coagulation", "pressing", "cooling", "resting", "ready_cutting", "clingwrapped", "cancelled"].includes(round.status)) throw Error("Record cutting before tray packing.");
  if (trayPackingFingerprint(round) !== request.expectedFingerprint) throw Error("Tray details changed. Reopen tray packing before saving.");
  const selected = request.packedNumbers;
  if (selected.some((n) => !Number.isSafeInteger(n) || n < 1 || n > 20 || !assigned.includes(n)) || new Set(selected).size !== selected.length) throw Error("Select each assigned tray once, from 1 to 20.");
  if (progress.inferred) {
    if (selected.length !== assigned.length) throw Error("This whole round is recorded packed, so all its trays are empty. Owner/Admin must correct the round status before reopening a tray.");
    return rounds;
  }
  const packed = [...selected].sort((a, b) => a - b), before = progress.explicit ? progress.packed : [], reopened = before.filter((n) => !packed.includes(n));
  if (reopened.length) {
    if (!["owner", "admin"].includes(role.toLowerCase())) throw Error("Only Owner/Admin can reopen trays already recorded packed.");
    if (request.reason.trim().length < 5) throw Error("Enter a reason for reopening packed trays.");
  }
  if (!progress.explicit && !packed.length) throw Error("Select at least one tray that has been fully packed and emptied.");
  if (progress.explicit && JSON.stringify(before) === JSON.stringify(packed)) return rounds;
  const entry = { id: request.id, assignmentKey: progress.assignment.key, assignedNumbers: [...assigned], beforePacked: [...before], packedNumbers: packed, recordedAt: at, recordedBy: actor, reason: request.reason.trim(), requestKey };
  const pending = assigned.filter((n) => !packed.includes(n));
  return rounds.map((r) => r.id === round.id ? { ...r, paneerTrayPackingHistory: [...r.paneerTrayPackingHistory || [], entry], historyEvents: [...r.historyEvents || [], { id: request.id, type: "tray_packing_recorded", stage: "Tray packing", occurredAt: at, recordedBy: actor, source: reopened.length ? "correction" : "workflow", details: `Fully packed trays: ${packed.join(", ") || "none"} \xB7 Still waiting: ${pending.join(", ") || "none"}${reopened.length ? ` \xB7 Reopened ${reopened.join(", ")}: ${entry.reason}` : ""} \xB7 Case and packet quantities recorded separately` }] } : r);
}

// src/traceability/automaticPaneer.ts
var last = (items) => items[items.length - 1];
var rounded = (n) => Math.round(n * 1e9) / 1e9;
var codes = (text) => [...new Set(text.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean))];
function paneerBagQueue(state, lotId, ingredientId) {
  const entry = state.readiness?.[lotId]?.[ingredientId];
  if (!entry) return [];
  const row = entry.value, checkId = entry.audit[entry.audit.length - 1]?.id || "";
  const floor = { number: 0, id: "floor", weightKg: row.floorBalanceKg ?? null, batchCodes: codes(row.floorBatchCodes || ""), checkId };
  const bags = numberedBags(row.storageBags || []).map((b) => ({ number: b.number, id: b.id, weightKg: b.weightKg, batchCodes: codes(b.batchCode), checkId }));
  return [floor, ...bags.sort((a, b) => a.number - b.number)];
}
function nextSequence(rounds, lotId) {
  return Math.max(0, ...rounds.filter((r) => r.milkLotId === lotId).flatMap((r) => [r.paneerAutomaticTrace?.sequence || 0, ...(r.paneerBagCorrections || []).map((c) => c.sequence)])) + 1;
}
function paneerBagSequence(rounds, lotId) {
  return nextSequence(rounds, lotId) - 1;
}
function changedIssues(rounds, lotId) {
  return rounds.filter((r) => r.milkLotId === lotId && r.paneerAutomaticTrace && latestPaneerIngredientIssue(r)?.id !== r.paneerAutomaticTrace.recipeIssueId).map((r) => latestPaneerIngredientIssue(r)?.id || "missing-issue");
}
function latestCursor(rounds, lotId, ingredientId) {
  const events = [];
  let order = 0;
  for (const round of rounds) {
    if (round.milkLotId !== lotId) continue;
    const trace = round.paneerAutomaticTrace, line = trace?.ingredients.find((x) => x.id === ingredientId);
    if (trace && line?.cursorAfter) events.push({ at: trace.recordedAt, sequence: trace.sequence, order: order++, cursor: line.cursorAfter, issueId: trace.recipeIssueId });
    for (const change of round.paneerBagCorrections || []) if (change.ingredientId === ingredientId) events.push({ at: change.recordedAt, sequence: change.sequence, order: order++, cursor: { bagNumber: change.source.number, remainingKg: change.remainingKg, acknowledgedIssueIds: change.acknowledgedIssueIds } });
  }
  const event = last(events.sort((a, b) => a.sequence - b.sequence || a.order - b.order));
  const amendment = event && changedIssues(rounds, lotId).some((id) => !event.cursor.acknowledgedIssueIds?.includes(id));
  return event ? { ...event.cursor, remainingKg: amendment ? null : event.cursor.remainingKg } : rounds.some((r) => r.milkLotId === lotId && r.paneerAutomaticTrace?.ingredients.some((i) => i.id === ingredientId)) || changedIssues(rounds, lotId).length ? { bagNumber: 0, remainingKg: null } : void 0;
}
function allocatePaneerIngredient(line, queue, cursor) {
  const result = { ...line, allocations: [], warnings: [] };
  let need = rounded(line.quantity * (line.unit === "g" ? 1e-3 : 1));
  let index = cursor ? queue.findIndex((b) => b.number === cursor.bagNumber) : 0;
  if (index < 0 || !queue.length) {
    result.warnings.push("Numbered bag details missing; production was not blocked.");
    return result;
  }
  let balance = cursor ? cursor.remainingKg : queue[index].weightKg;
  while (need > 1e-9) {
    const source = queue[index];
    if (!source) {
      result.warnings.push("More numbered bags are needed to identify this ingredient source.");
      result.cursorAfter = { bagNumber: (last(queue)?.number || 0) + 1, remainingKg: null };
      break;
    }
    if (!source.batchCodes.length && balance !== 0) result.warnings.push(`Bag ${source.number} batch code missing.`);
    if (balance === null) {
      result.allocations.push({ source, expectedKg: null });
      result.cursorAfter = { bagNumber: source.number, remainingKg: null };
      result.warnings.push(`Bag ${source.number} remaining weight unknown; confirm it to resume automatic bag changes.`);
      break;
    }
    if (balance < 0 || !Number.isFinite(balance)) {
      result.warnings.push("Recorded bag weight is invalid; confirm the weighed remaining amount.");
      result.cursorAfter = { bagNumber: source.number, remainingKg: null };
      break;
    }
    if (balance <= 1e-9) {
      index++;
      balance = queue[index]?.weightKg ?? null;
      continue;
    }
    const used = Math.min(need, balance);
    result.allocations.push({ source, expectedKg: rounded(used) });
    need = rounded(need - used);
    balance = rounded(balance - used);
    result.cursorAfter = { bagNumber: source.number, remainingKg: balance };
    if (need > 1e-9) {
      index++;
      balance = queue[index]?.weightKg ?? null;
    }
  }
  if (result.cursorAfter && cursor?.acknowledgedIssueIds) result.cursorAfter.acknowledgedIssueIds = cursor.acknowledgedIssueIds;
  return result;
}
function captureAutomaticPaneer(round, rounds, state, actor, at) {
  if (round.paneerAutomaticTrace || !["D", "C/S"].includes(round.type) || round.status !== "in_production" || !round.vat) return round;
  const issue = latestPaneerIngredientIssue(round);
  if (!issue) return round;
  const productionDate = round.traceabilityProductionDate || state.lots[round.milkLotId]?.value.productionDate || "";
  const code = safeCode(state.prefixes[round.type]?.value || agreedPrefixes[round.type], productionDate, round.shiftNumber, round.roundNumber);
  const ingredients = issue.lines.map((line) => allocatePaneerIngredient(line, paneerBagQueue(state, round.milkLotId, line.id), latestCursor(rounds, round.milkLotId, line.id)));
  const trace = { version: 1, sequence: nextSequence(rounds, round.milkLotId), recordedAt: at, recordedBy: actor, productionDate, code: code.code, recipeIssueId: issue.id, milkLitres: issue.milkLitres, paneerType: issue.paneerType, ingredients };
  return { ...round, traceabilityProductionDate: productionDate || void 0, paneerAutomaticTrace: trace, historyEvents: [...round.historyEvents || [], { id: `paneer-trace-${issue.id}`, type: "paneer_traceability_captured", stage: "Paneer Traceability Captured", occurredAt: at, recordedBy: actor, source: "workflow", details: `Automatic recipe-based bag estimate \xB7 ${code.code || "Code pending"} \xB7 ${ingredients.map((i) => `${i.name}: ${i.allocations.map((a) => "Bag " + a.source.number + " " + a.source.batchCodes.join("/")).join(" \u2192 ") || "source pending"}`).join(" \xB7 ")}` }] };
}
function correctPaneerBag(rounds, state, request, actor, at) {
  const duplicate = rounds.flatMap((r) => (r.paneerBagCorrections || []).map((event2) => ({ roundId: r.id, event: event2 }))).find((e) => e.event.id === request.id);
  if (duplicate) {
    const e = duplicate.event;
    if (duplicate.roundId !== request.roundId || e.ingredientId !== request.ingredientId || e.source.number !== request.bagNumber || e.previousSource?.number !== (request.duringRound ? request.previousBagNumber : void 0) || e.remainingKg !== request.remainingKg || e.duringRound !== request.duringRound || e.reason !== request.reason.trim() || e.recordedBy !== actor) throw Error("This correction reference was already used for a different change.");
    return rounds;
  }
  const round = rounds.find((r) => r.id === request.roundId);
  if (!round?.paneerAutomaticTrace) throw Error("Select a round recorded with automatic paneer traceability.");
  if (request.expectedSequence !== void 0 && paneerBagSequence(rounds, round.milkLotId) !== request.expectedSequence) throw Error("Production or another bag correction has progressed. Reopen this form and check the weighed balance again.");
  if (!request.reason.trim()) throw Error("Enter a reason for correcting the physical bag.");
  const queue = paneerBagQueue(state, round.milkLotId, request.ingredientId), source = queue.find((b) => b.number === request.bagNumber);
  if (!source || !source.batchCodes.length) throw Error("Record the bag and its batch code in the Ingredient checklist first.");
  if (request.expectedCheckId !== void 0 && source.checkId !== request.expectedCheckId) throw Error("This bag\u2019s preparation details changed. Reopen the form and confirm the bag code.");
  if (!round.paneerAutomaticTrace.ingredients.some((line) => line.id === request.ingredientId)) throw Error("This ingredient is not part of the selected round\u2019s recipe.");
  if (request.remainingKg !== null && (!Number.isFinite(request.remainingKg) || request.remainingKg < 0)) throw Error("Enter a valid zero or positive remaining weight.");
  const previousSource = request.duringRound ? queue.find((b) => b.number === request.previousBagNumber) : void 0;
  if (request.duringRound && (!previousSource || !previousSource.batchCodes.length)) throw Error("Choose the previous bag used during this round.");
  const event = { id: request.id, sequence: nextSequence(rounds, round.milkLotId), acknowledgedIssueIds: request.remainingKg === null ? void 0 : changedIssues(rounds, round.milkLotId), warnings: request.remainingKg !== null && source.weightKg !== null && request.remainingKg > source.weightKg ? ["Weighed remaining amount exceeds the checklist bag weight; owner review required."] : [], ingredientId: request.ingredientId, source: structuredClone(source), previousSource: previousSource ? structuredClone(previousSource) : void 0, remainingKg: request.remainingKg, duringRound: request.duringRound, recordedAt: at, recordedBy: actor, reason: request.reason.trim() };
  return rounds.map((r) => r.id !== round.id ? r : { ...r, paneerBagCorrections: [...r.paneerBagCorrections || [], event], historyEvents: [...r.historyEvents || [], { id: request.id, type: "paneer_bag_corrected", stage: "Ingredient Bag Corrected", occurredAt: at, recordedBy: actor, source: "workflow", details: `${request.ingredientId}: Bag ${request.bagNumber} \xB7 ${source.batchCodes.join(", ")} \xB7 ${request.remainingKg === null ? "remaining weight unknown" : request.remainingKg + " kg remaining"} \xB7 ${event.reason}` }] });
}

// src/traceability/paneerJourney.ts
var kg2 = (n) => Math.round(n * 1e9) / 1e9;
function cuttingSaveDecision(details, acknowledged = false, phase = "all") {
  const missing = [];
  if (phase !== "after_cutting" && details.clothKg === null) missing.push("Cloth: confirm no cloth, or enter its weight");
  if (phase !== "weighing" && !details.trayNumbers?.length) missing.push("Trays: select the physical tray numbers");
  if (phase === "after_cutting" && details.scrambleKg === null) missing.push("Scramble: enter the weighed amount, or 0 if none");
  if (phase !== "weighing" && details.samplePieces === null) missing.push("Samples: enter the number taken");
  else if (phase !== "weighing" && details.samplePieces === 0) missing.push("Samples: no retention sample taken");
  return { missing, canSave: missing.length === 0 || acknowledged };
}
function validatePaneerCutting(details, blockKg) {
  for (const key of ["clothKg", "trays", "scrambleKg", "samplePieces"]) {
    const v = details[key];
    if (v !== null && (!Number.isFinite(v) || v < 0 || ["trays", "samplePieces"].includes(key) && !Number.isInteger(v))) throw Error("Cutting details: weights must be zero or positive; trays and sample pieces must be whole numbers.");
  }
  if (details.trayNumbers && (details.trayNumbers.some((n) => !Number.isInteger(n) || n < 1 || n > 20) || new Set(details.trayNumbers).size !== details.trayNumbers.length)) throw Error("Choose each physical tray number once, from 1 to 20.");
  if (details.trayNumbers && details.trays !== details.trayNumbers.length) throw Error("Tray count must match the selected tray numbers.");
  if (details.clothKg !== null && details.clothKg > blockKg) throw Error("Cloth weight cannot exceed the recorded block weight.");
}
function capturePaneerCutting(round, event) {
  if (!["D", "C/S"].includes(round.type) || !round.paneerCuttingDetails) return round;
  if (round.paneerCuttingHistory?.some((e) => e.id === event.id)) return round;
  const blockKg = kg2((round.blockWeights || []).reduce((n, w) => n + w, 0));
  validatePaneerCutting(round.paneerCuttingDetails, blockKg);
  const snapshot = { id: event.id, sequence: event.sequence, recordedAt: event.occurredAt, recordedBy: event.recordedBy || "Recorder not recorded", stage: event.stage, blockKg, netKg: round.paneerCuttingDetails.clothKg === null ? null : kg2(blockKg - round.paneerCuttingDetails.clothKg), details: structuredClone(round.paneerCuttingDetails), phase: event.phase, requestKey: event.requestKey, previousDetails: event.previousDetails ? structuredClone(event.previousDetails) : void 0, correctionReason: event.correctionReason, missingChecks: cuttingSaveDecision(round.paneerCuttingDetails, false, event.phase).missing, pendingAcknowledged: round.paneerCuttingDetails.pendingAcknowledged === true };
  return { ...round, paneerCuttingHistory: [...round.paneerCuttingHistory || [], snapshot] };
}
function paneerOrigin(round, lot, state) {
  const date = round.paneerAutomaticTrace?.productionDate || round.traceabilityProductionDate || state.rounds[round.id]?.value.productionDate || state.lots[round.milkLotId]?.value.productionDate || lot?.traceabilityProductionDate || "";
  const code = round.paneerAutomaticTrace?.code || safeCode(state.prefixes[round.type]?.value || agreedPrefixes[round.type], date, round.shiftNumber, round.roundNumber).code;
  return { date, code };
}
function retentionPacketBatchCode(round, lot, state) {
  return round.paneerCuttingDetails?.samplePacketBatchCode || state.rounds[round.id]?.value.cutting.samplePacketBatchCode || paneerOrigin(round, lot, state).code;
}

// src/traceability/paneerStorage.ts
var retentionCrateCode = (lotCode) => `RS-${lotCode}`;
function cuttingStorageDefaults(lotCode, previous) {
  return { ...emptyRoundTrace().cutting, ...previous, scrambleLocation: previous?.scrambleLocation || "Container", sampleLocation: previous?.sampleLocation || "Container", sampleCrateCode: previous?.sampleCrateCode || retentionCrateCode(lotCode) };
}
function retentionSamples(rounds, lot, state) {
  return rounds.filter((r) => r.milkLotId === lot.id && ["D", "C/S"].includes(r.type)).flatMap((r) => {
    const details = r.paneerCuttingDetails || state.rounds[r.id]?.value.cutting;
    if (!details || details.samplePieces == null || !Number.isSafeInteger(details.samplePieces) || details.samplePieces <= 0) return [];
    const value = { roundId: r.id, lotId: lot.id, lotCode: lot.lotCode, shift: r.shiftNumber, round: r.roundNumber, pieces: details.samplePieces, batchCode: retentionPacketBatchCode(r, lot, state), crateCode: details.sampleCrateCode || retentionCrateCode(lot.lotCode), recordedLocation: details.sampleLocation || "Not recorded" };
    return [{ ...value, fingerprint: JSON.stringify(value) }];
  });
}
function retentionStorage(rounds, lot, state) {
  const samples = retentionSamples(rounds, lot, state), transfers = Object.values(state.retentionTransfers || {}).filter((t) => t.lotId === lot.id);
  const moved = new Set(transfers.flatMap((t) => effectiveTransferSamples(t).map((s) => s.fingerprint)));
  const rows = samples.map((s) => ({ ...s, location: moved.has(s.fingerprint) ? "Coldroom" : s.recordedLocation, changedAfterMove: transfers.some((t) => effectiveTransferSamples(t).some((old) => old.roundId === s.roundId && old.fingerprint !== s.fingerprint)) && !moved.has(s.fingerprint) }));
  const pending = rows.filter((s) => s.location === "Container");
  return { crateCode: transfers[0]?.crateCode || samples[0]?.crateCode || retentionCrateCode(lot.lotCode), rows, pending, transfers, unconfirmedPieces: rows.filter((s) => !["Container", "Coldroom"].includes(s.location)).reduce((n, s) => n + s.pieces, 0), containerPieces: pending.reduce((n, s) => n + s.pieces, 0), coldroomPieces: rows.filter((s) => s.location === "Coldroom").reduce((n, s) => n + s.pieces, 0), fingerprint: JSON.stringify(pending.map((s) => s.fingerprint).sort()) };
}
function transferRetentionSamples(state, request, rounds, lots, actor, at) {
  const previous = state.retentionTransfers?.[request.id];
  if (previous) {
    if (previous.lotId !== request.lotId || JSON.stringify(previous.samples.map((s) => s.fingerprint).sort()) !== request.expectedSamples || previous.recordedBy !== actor) throw Error("This transfer reference already belongs to a different transfer.");
    return state;
  }
  const lot = lots.find((l) => l.id === request.lotId);
  if (!lot) throw Error("Milk lot not found.");
  if (!lot.productionClosed) throw Error("Close milk production before moving its retention samples into the Coldroom case.");
  const info = retentionStorage(rounds, lot, state);
  if (!info.pending.length) throw Error("No recorded retention samples are awaiting transfer.");
  if (info.fingerprint !== request.expectedSamples) throw Error("Retention samples changed. Reopen the transfer and check the listed samples.");
  if (info.pending.some((s) => s.changedAfterMove)) throw Error("A sample record changed after an earlier transfer. Owner review is needed before recording another movement of that sample.");
  if (!actor.trim()) throw Error("A recorder is required.");
  const entry = { id: request.id, lotId: lot.id, crateCode: info.crateCode, from: "Container", to: "Coldroom", packaging: "Case", samples: info.pending.map(({ location, changedAfterMove, ...sample }) => sample), recordedAt: at, recordedBy: actor };
  return { ...state, retentionTransfers: { ...state.retentionTransfers, [entry.id]: entry } };
}
function reviewRetentionTransfer(state, request, rounds, lots, actor, role, at) {
  if (!["owner", "admin"].includes(role)) throw Error("Only owner/admin can review a corrected retention transfer.");
  if (request.reason.trim().length < 5) throw Error("Enter a reason and confirm the physical case contents.");
  const entry = state.retentionTransfers?.[request.id];
  if (!entry) throw Error("Retention transfer not found.");
  const before = effectiveTransferSamples(entry);
  if (JSON.stringify(before) !== request.expectedSamples) throw Error("This transfer changed. Reopen it before reviewing.");
  const lot = lots.find((l) => l.id === entry.lotId);
  if (!lot) throw Error("Milk lot not found.");
  const roundIds = new Set(entry.samples.map((s) => s.roundId)), after = retentionSamples(rounds, lot, state).filter((s) => roundIds.has(s.roundId));
  if (JSON.stringify(before) === JSON.stringify(after)) return state;
  const correction = { at, by: actor, reason: request.reason.trim(), before: structuredClone(before), after: structuredClone(after) };
  return { ...state, retentionTransfers: { ...state.retentionTransfers, [entry.id]: { ...entry, reviews: [...entry.reviews || [], correction] } } };
}
function effectiveTransferSamples(entry) {
  return entry.reviews?.[entry.reviews.length - 1]?.after || entry.samples;
}

// src/traceability/afterCutting.ts
function canRecordAfterCutting(round) {
  return ["D", "C/S"].includes(round.type) && Boolean(round.blockWeights?.length) && ["cut", "chiller_storage", "frozen", "packed", "handed_over", "spp_pending", "pan111_pending", "spoilage_pending", "spoiled"].includes(round.status);
}
function cuttingDetailsForRound(round, state) {
  return round.paneerCuttingDetails || state.rounds[round.id]?.value.cutting || emptyRoundTrace().cutting;
}
function afterCuttingValues(details) {
  return { trayNumbers: details.trayNumbers, trays: details.trays, scrambleKg: details.scrambleKg, scrambleLocation: details.scrambleLocation, samplePieces: details.samplePieces };
}
function afterCuttingFingerprint(round, state) {
  return JSON.stringify({ details: cuttingDetailsForRound(round, state), blockWeights: round.blockWeights });
}
function changedRecordedCuttingFields(before, after) {
  const changes = [];
  if (before.trayNumbers?.length && JSON.stringify(before.trayNumbers) !== JSON.stringify(after.trayNumbers)) changes.push("tray numbers");
  else if (before.trays !== null && before.trays !== after.trays) changes.push("tray count");
  if (before.scrambleKg !== null && before.scrambleKg !== after.scrambleKg) changes.push("scramble weight");
  if (before.scrambleKg !== null && before.scrambleLocation && before.scrambleLocation !== after.scrambleLocation) changes.push("scramble location");
  if (before.samplePieces !== null && before.samplePieces !== after.samplePieces) changes.push("sample pieces");
  return changes;
}
function savePaneerAfterCutting(rounds, state, lots, request, actor, role, at) {
  if (!request.id || !actor.trim()) throw Error("A save reference and recorder are required.");
  const requestKey = JSON.stringify(request);
  const prior = rounds.find((r) => r.paneerCuttingHistory?.some((h) => h.id === request.id));
  if (prior) {
    const snapshot = prior.paneerCuttingHistory.find((h) => h.id === request.id);
    if (prior.id !== request.roundId || snapshot.requestKey !== requestKey || snapshot.recordedBy !== actor) throw Error("This save reference belongs to a different cutting record.");
    return rounds;
  }
  const round = rounds.find((r) => r.id === request.roundId);
  if (!round) throw Error("Round not found.");
  if (!canRecordAfterCutting(round)) throw Error("Save block weights and cutting first.");
  if (afterCuttingFingerprint(round, state) !== request.expectedFingerprint) throw Error("Cutting details or block weights changed. Reopen After cutting before saving.");
  const before = cuttingDetailsForRound(round, state), changes = changedRecordedCuttingFields(before, request.details);
  if (changes.length) {
    if (!["owner", "admin"].includes(role.toLowerCase())) throw Error("Owner/Admin must correct already recorded cutting details.");
    if (request.reason.trim().length < 5) throw Error("Enter a reason for correcting the recorded details.");
  }
  const details = { ...cuttingStorageDefaults(round.milkLotCode, before), ...afterCuttingValues(request.details) };
  details.samplePacketBatchCode = before.samplePacketBatchCode || retentionPacketBatchCode(round, lots.find((l) => l.id === round.milkLotId), state);
  const blockKg = (round.blockWeights || []).reduce((n, w) => n + w, 0);
  validatePaneerCutting(details, blockKg);
  const decision = cuttingSaveDecision(details, request.acknowledged, "after_cutting");
  if (!decision.canSave) throw Error("Complete the after-cutting details or explicitly leave the listed items pending.");
  details.pendingAcknowledged = decision.missing.length > 0 && request.acknowledged;
  const sequence = Math.max(0, ...rounds.flatMap((r) => (r.paneerCuttingHistory || []).map((h) => h.sequence || 0))) + 1;
  const event = {
    id: request.id,
    type: "cutting_details_recorded",
    stage: "After cutting details",
    occurredAt: at,
    recordedBy: actor,
    source: changes.length ? "correction" : "workflow",
    details: `Trays ${details.trayNumbers?.join(", ") || "pending"} \xB7 Scramble ${details.scrambleKg ?? "pending"} kg (${details.scrambleLocation}) \xB7 Samples ${details.samplePieces ?? "pending"} pieces \xB7 Packet ${details.samplePacketBatchCode || "pending"}${changes.length ? ` \xB7 Corrected ${changes.join(", ")}: ${request.reason.trim()}` : ""}${decision.missing.length ? ` \xB7 Left pending: ${decision.missing.join("; ")}` : ""}`
  };
  const next = capturePaneerCutting({ ...round, paneerCuttingDetails: details, historyEvents: [...round.historyEvents || [], event] }, { ...event, sequence, phase: "after_cutting", requestKey, previousDetails: changes.length ? before : void 0, correctionReason: changes.length ? request.reason.trim() : void 0 });
  return rounds.map((r) => r.id === round.id ? next : r);
}

// src/traceability/server/commands.ts
var traceKeys = ["vejoy_distributionHandovers", "vejoy_finishedStock", "vejoy_intermediateLots", "vejoy_milkLots", "vejoy_productionRounds", "vejoy_traceability"];
function prepareTraceCommand(d, request, actor, role, at) {
  if (!["owner", "admin", "staff"].includes(role)) throw Error("Approved production access required.");
  if (!request.id || request.id.length > 120) throw Error("A save reference is required.");
  const p = request.payload || {}, s = d.vejoy_traceability || emptyTraceState, r = d.vejoy_productionRounds, l = d.vejoy_milkLots, stock = d.vejoy_finishedStock;
  const next = { ...d };
  let result = null;
  const owner = () => {
    if (!["owner", "admin"].includes(role)) throw Error("Owner/Admin access required.");
  };
  const lot = (id) => {
    if (!l.some((x) => x.id === id)) throw Error("Milk lot not found.");
  };
  if (request.kind === "handover") return preparePaneerHandover(d, request, actor, role, at);
  switch (request.kind) {
    case "milk_rejection":
      owner();
      next.vejoy_milkLots = recordMilkRejection(l, r, p, actor, role, at, request.id);
      break;
    case "save": {
      if (!["lots", "rounds", "prefixes"].includes(p.kind)) throw Error("Invalid traceability record.");
      if (p.kind === "prefixes") {
        owner();
        const previous = s.prefixes[p.id];
        if ((previous?.audit[previous.audit.length - 1]?.id || "") !== p.expectedRevision) throw Error("The prefix changed. Reopen it before saving.");
      } else if (p.kind === "lots") {
        lot(p.id);
        if (planRevision(s.lots[p.id]) !== p.expectedRevision) throw Error("The plan changed. Reopen it before saving.");
        if (!validDate(p.value.productionDate)) throw Error("Confirm the start of production date.");
        plannedMilkTotal(p.value);
        checklistForecast(p.value.planCsLitres, p.value.planDirectLitres, p.value.planHalloumiLitres ?? 0, p.value.halloumiSaltGPer240L);
      } else {
        owner();
        if (!r.some((x) => x.id === p.id)) throw Error("Paneer round not found.");
        if ((s.rounds[p.id]?.audit[s.rounds[p.id].audit.length - 1]?.id || "") !== p.expectedRevision) throw Error("Round details changed. Reopen before correcting.");
      }
      const entry = changeRecord(s[p.kind][p.id], p.value, actor, role, p.reason, at, request.id, p.kind === "rounds");
      next.vejoy_traceability = { ...s, [p.kind]: { ...s[p.kind], [p.id]: entry } };
      result = entry.audit[entry.audit.length - 1]?.id || request.id;
      break;
    }
    case "checklist":
      lot(p.lotId);
      next.vejoy_traceability = recordChecklist(s, p.lotId, p.entries, p.revision, actor, role, at, request.id, p.liquidEntries || []);
      break;
    case "readiness":
      lot(p.lotId);
      next.vejoy_traceability = recordReadiness(s, p.lotId, p.ingredientId, p.draft, p.revision, p.checkId, actor, role, at, request.id);
      break;
    case "assemble": {
      const a = assembleMixedCaseStock(s, stock, p, r, l, actor, at);
      next.vejoy_traceability = a.state;
      next.vejoy_finishedStock = a.stock;
      break;
    }
    case "cancel_assembly": {
      const a = cancelMixedCaseStock(s, stock, p.id, p.reason, actor, role, at);
      next.vejoy_traceability = a.state;
      next.vejoy_finishedStock = a.stock;
      break;
    }
    case "link_assembly": {
      const a = linkExistingMixedCaseStock(s, stock, p.id, r, l, actor, role, at);
      next.vejoy_traceability = a.state;
      next.vejoy_finishedStock = a.stock;
      break;
    }
    case "return": {
      const a = returnMixedCaseStock(s, stock, p, actor, role, at);
      next.vejoy_traceability = a.state;
      next.vejoy_finishedStock = a.stock;
      break;
    }
    case "pan111": {
      const a = reconcilePan111(s, d.vejoy_intermediateLots, p, r, l, actor, role, at);
      next.vejoy_traceability = a.state;
      next.vejoy_intermediateLots = a.stock;
      break;
    }
    case "retention_transfer":
      next.vejoy_traceability = transferRetentionSamples(s, p, r, l, actor, at);
      break;
    case "retention_review":
      next.vejoy_traceability = reviewRetentionTransfer(s, p, r, l, actor, role, at);
      break;
    case "bag":
      next.vejoy_productionRounds = correctPaneerBag(r, s, p, actor, at);
      break;
    case "after_cutting":
      next.vejoy_productionRounds = savePaneerAfterCutting(r, s, l, p, actor, role, at);
      break;
    case "trays":
      next.vejoy_productionRounds = saveTrayPacking(r, p, actor, role, at);
      break;
    case "intermediate_packing": {
      const source = d.vejoy_intermediateLots.find((x) => x.id === p.lotId);
      if (!source || JSON.stringify(source) !== JSON.stringify(p.expectedLot)) throw Error("The source balance changed. Reopen packing.");
      const round = r.find((x) => x.id === source.sourceBatchId), definition = paneerSkuByCode[p.sku];
      if (!definition || !round || !getAllowedPaneerSkus(round.type, round.cuttingType).some((x) => x.sku === p.sku)) throw Error("That SKU is not permitted for this source.");
      if (![p.cases, p.loosePackets].every((n) => Number.isSafeInteger(n) && n >= 0)) throw Error("Enter whole case/packet counts.");
      const kg3 = getPaneerPackWeight(definition, p.cases, p.loosePackets, p.looseWeightKg, p.weightKg, p.caseWeightKg);
      if (!Number.isFinite(kg3) || kg3 <= 0 || kg3 > source.currentQuantity + 1e-3) throw Error("Enter a valid packing weight within the source quantity.");
      if (definition.packMode === "weight_only") owner();
      const labels = labelsForPacking(round, p.sku, l.find((x) => x.id === round.milkLotId), s), balance = Math.max(0, source.currentQuantity - kg3);
      const pack = { ...labels, sku: p.sku, cases: p.cases, loose: p.loosePackets, packingRunId: "pk-" + request.id, recordedBy: actor, recordedAt: at, lastSaveOperationId: request.id, ...definition.packMode === "weight_only" ? { weightKg: kg3 } : definition.packMode === "weight_loose" ? { caseWeightKg: p.caseWeightKg, looseWeightKg: p.looseWeightKg } : {} };
      next.vejoy_productionRounds = r.map((x) => x.id !== round.id ? x : { ...x, status: balance <= 0 ? "packed" : x.status, packedSkus: [...x.packedSkus || [], pack], remainingBalance: balance, intermediateBalance: balance, historyEvents: [...x.historyEvents || [], { id: request.id, type: "packing_recorded", stage: "Packing Recorded", occurredAt: at, recordedBy: actor, source: "workflow", details: `${p.sku} \xB7 ${p.cases} cases + ${p.loosePackets} loose \xB7 ${kg3} kg` }] });
      next.vejoy_intermediateLots = d.vejoy_intermediateLots.map((x) => x.id !== source.id ? x : { ...x, currentQuantity: balance, status: balance <= 0 ? "consumed" : "available" });
      next.vejoy_finishedStock = [...stock, { ...pack, id: "fs-" + request.id, productName: definition.productName, loosePackets: p.loosePackets, totalPackets: definition.packMode === "units" ? p.cases * (definition.unitsPerCase || 0) + p.loosePackets : 0, storageLocation: "Dairy Container (Finished Stock)", status: "awaiting_handover", createdAt: at, sourceBatchCodes: [source.sourceBatchCode] }];
      break;
    }
    case "activity": {
      const old = r.find((x) => x.id === p.roundId);
      if (!old || !["D", "C/S"].includes(old.type)) throw Error("Paneer round not found.");
      if (!p.expectedRound || old.status !== p.expectedRound.status) throw Error("The round has moved on. Reopen this action.");
      const blocked = ["id", "type", "milkLotId", "milkLotCode", "shiftId", "shiftNumber", "roundNumber", "packedSkus", "historyEvents", "paneerAutomaticTrace", "paneerBagCorrections", "paneerCuttingHistory", "paneerTrayPackingHistory", "paneerIngredientIssues"];
      for (const key of Object.keys(p.updates || {})) {
        if (blocked.includes(key)) throw Error("This action cannot change round identity, packing or audit records.");
        if (JSON.stringify(old[key]) !== JSON.stringify(p.expectedRound[key])) throw Error("Round values changed. Review the current record before saving.");
      }
      if (p.event.source === "correction") owner();
      if (old.locked && p.event.source !== "correction") throw Error("This round is locked.");
      if (!["owner", "admin"].includes(role) && p.updates.status && p.updates.status !== old.status) {
        const transitions = { scheduled: ["in_production"], in_production: ["coagulation"], coagulation: ["pressing"], pressing: ["cooling", "cut"], cooling: ["resting"], resting: ["ready_cutting"], ready_cutting: ["cut", "clingwrapped", "spp_pending"], clingwrapped: ["cut", "spp_pending"], cut: ["frozen", "chiller_storage"], spp_pending: ["frozen"], chiller_storage: ["frozen"] };
        if (!transitions[old.status]?.includes(p.updates.status)) throw Error("This stage change needs Owner/Admin review.");
      }
      if (p.updates.status === "in_production" && (!["vat2", "vat3"].includes(p.updates.vat) || !Number.isFinite(p.updates.startingTemperature))) throw Error("Record the vat and starting milk temperature.");
      const event = { ...p.event, id: request.id, recordedBy: actor, occurredAt: at };
      let updated = { ...old, ...p.updates, historyEvents: [...old.historyEvents || [], event] };
      updated = recordPaneerIngredientAllocation(updated, at, actor, p.event.details, old.status === "scheduled" && p.updates.status === "in_production" && !!p.updates.vat);
      if (old.status === "scheduled" && p.updates.status === "in_production") updated = captureAutomaticPaneer(updated, r, s, actor, at);
      else if (["cut", "clingwrapped"].includes(p.event.type) && p.updates.paneerCuttingDetails) updated = capturePaneerCutting(updated, { ...event, phase: "weighing", sequence: Math.max(0, ...r.flatMap((x) => (x.paneerCuttingHistory || []).map((h) => h.sequence || 0))) + 1 });
      if (["outputWeight", "paneerCuttingDetails", "sppRecordedWeight", "remainingBalance"].some((key) => key in (p.updates || {})) && updated.paneerCuttingDetails?.clothKg != null) {
        const balance = getPaneerRoundRemainingBalance(updated);
        if (balance !== void 0) updated = { ...updated, remainingBalance: balance };
      }
      next.vejoy_productionRounds = r.map((x) => x.id === old.id ? updated : x);
      break;
    }
    default:
      throw Error("Unknown paneer traceability command.");
  }
  return { documents: next, result };
}
export {
  prepareTraceCommand,
  traceKeys
};
