import type { ProductionRound, ProductionRoundHistoryEvent } from '../data/mockData';

export interface RoundHistoryItem {
  key: string;
  stage: string;
  occurredAt?: string;
  details: string;
  recordedBy?: string;
  legacyTimestampMissing?: boolean;
}

const laterPaneerStatuses = new Set([
  'pressing', 'cooling', 'resting', 'ready_cutting', 'cut', 'spp_pending',
  'clingwrapped', 'chiller_storage', 'frozen', 'packed', 'handed_over',
]);

export function formatRoundHistoryTime(occurredAt?: string) {
  if (!occurredAt) return 'Timestamp unavailable · legacy record';
  const parsed = new Date(occurredAt);
  if (Number.isNaN(parsed.getTime())) return 'Invalid timestamp · review required';
  return parsed.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

export function buildProductionRoundHistory(round: ProductionRound): RoundHistoryItem[] {
  const items: RoundHistoryItem[] = [];
  const events = round.historyEvents || [];
  const consumed = new Set<string>();

  const addExactEvents = (types: string[]) => {
    const matches = events.filter(event => types.includes(event.type));
    matches.forEach(event => {
      consumed.add(event.id);
      items.push({
        key: event.id,
        stage: event.stage,
        occurredAt: event.occurredAt,
        details: event.details,
        recordedBy: event.recordedBy,
      });
    });
    return matches.length > 0;
  };

  const addLegacy = (key: string, stage: string, details: string, occurredAt?: string) => {
    items.push({ key, stage, details, occurredAt, legacyTimestampMissing: !occurredAt });
  };

  addLegacy('scheduled', 'Scheduled', `Round created for ${round.plannedInput} L`, round.startTime);

  if (round.typeChangeRequest) {
    const request = round.typeChangeRequest;
    addLegacy(
      'type-change-request',
      `Type-change request ${request.status}`,
      `${request.from} → ${request.to} · ${request.reason} · Requested by ${request.requestedBy}${request.decidedBy ? ` · Reviewed by ${request.decidedBy}` : ''}${request.decisionReason ? ` · ${request.decisionReason}` : ''}`,
      request.decidedAt || request.requestedAt,
    );
  }

  round.typeChangeHistory?.forEach((change, index) => addLegacy(
    `type-change-${index}`,
    `Type corrected: ${change.from} → ${change.to}`,
    `${change.reason} · By ${change.changedBy || 'Admin'}`,
    change.changedAt,
  ));

  if (round.vat && !addExactEvents(['in_production'])) {
    addLegacy('in-production-legacy', 'In Production', `${round.vat === 'vat2' ? 'Vat 2' : 'Vat 3'} · Starting temp: ${round.startingTemperature ?? 'N/A'}°C`);
  }

  addExactEvents(['paneer_ingredients_issued', 'paneer_recipe_adjusted']);

  addExactEvents(['coagulation']);

  if (round.pressingStartedAt || laterPaneerStatuses.has(round.status)) {
    if (!addExactEvents(['pressing'])) addLegacy('pressing-legacy', 'Pressing', '30 min timer', round.pressingStartedAt);
  }
  if (round.coolingStartedAt || ['cooling', 'resting', 'ready_cutting', 'cut', 'spp_pending', 'clingwrapped', 'chiller_storage', 'frozen', 'packed', 'handed_over'].includes(round.status)) {
    if (!addExactEvents(['cooling'])) addLegacy('cooling-legacy', 'Cooling', round.coolingLocation === 'tank' ? 'Cooling Tank · 90 min' : round.coolingLocation === 'chiller' ? 'Chiller · 120 min' : 'Cooling location not recorded', round.coolingStartedAt);
  }
  if (round.restingStartedAt || ['resting', 'ready_cutting', 'cut', 'spp_pending', 'clingwrapped', 'chiller_storage', 'frozen', 'packed', 'handed_over'].includes(round.status)) {
    if (!addExactEvents(['resting'])) addLegacy('resting-legacy', 'Resting', '90 min timer', round.restingStartedAt);
  }
  if (['ready_cutting', 'cut', 'spp_pending', 'clingwrapped', 'chiller_storage', 'frozen', 'packed', 'handed_over'].includes(round.status)) {
    if (!addExactEvents(['ready_cutting'])) addLegacy('ready-cutting-legacy', 'Ready for Cutting', 'Paneer ready to cut');
  }
  if (round.cutBy) {
    if (!addExactEvents(['cut'])) addLegacy('cut-legacy', 'Cut', `By ${round.cutBy} · ${round.cuttingType || 'N/A'} · ${round.numberOfBlocks || 0} blocks · ${round.outputWeight || 0} kg`);
  }
  if (round.clingwrappedAt || round.status === 'clingwrapped') {
    if (!addExactEvents(['clingwrapped'])) addLegacy('clingwrapped-legacy', 'Clingwrapped / Stored', 'Stored in chiller', round.clingwrappedAt);
  }
  if (round.status === 'chiller_storage') {
    if (!addExactEvents(['chiller_storage'])) addLegacy('chiller-legacy', 'Chiller Storage', 'Restaurant blocks stored fresh in the chiller');
  }
  if (round.status === 'frozen' || ['packed', 'handed_over'].includes(round.status)) {
    if (!addExactEvents(['frozen'])) addLegacy('frozen-legacy', 'Frozen', 'Moved to freezer');
  }

  const hasPackingEvents = addExactEvents(['packing_recorded', 'packing_corrected']);
  if (!hasPackingEvents) {
    round.packedSkus?.forEach((pack, index) => addLegacy(
      `packing-legacy-${index}`,
      `Packing ${index + 1}`,
      pack.weightKg !== undefined
        ? `${pack.sku} · ${pack.weightKg.toFixed(2)} kg`
        : pack.looseWeightKg !== undefined
          ? `${pack.sku} · ${pack.cases} cases + ${pack.looseWeightKg.toFixed(2)} kg loose`
          : `${pack.sku} · ${pack.cases} cases + ${pack.loose} loose`,
    ));
  }

  addExactEvents(['spp_weight_recorded']);
  const hasCreamEvents = addExactEvents(['cream_recorded', 'cream_corrected']);
  if (!hasCreamEvents && round.creamRecovered !== undefined) {
    addLegacy('cream-legacy', 'Cream Recovered', `${round.creamRecovered.toFixed(2)} kg${round.creamRecoveredBy ? ` · By ${round.creamRecoveredBy}` : ''}`, round.creamRecoveredAt);
  }

  addExactEvents(['pan111_requested', 'pan111_approved', 'pan111_rejected']);
  const hasSpoilageEvents = addExactEvents(['spoilage_reported', 'spoilage_approved', 'spoilage_rejected']);
  if (!hasSpoilageEvents && round.spoilageApprovalStatus) {
    const occurredAt = round.spoilageApprovedAt || round.spoilageRejectedAt || round.spoilageReportedAt;
    addLegacy(
      'spoilage-legacy',
      round.spoilageApprovalStatus === 'approved' ? 'Spoilage Approved' : round.spoilageApprovalStatus === 'rejected' ? 'Spoilage Rejected' : 'Spoilage Reported',
      `${round.spoilageRequestedQuantity?.toFixed(2) || '0.00'} ${round.spoilageUnit || 'kg'} · ${round.spoilageReason || 'No reason recorded'} · Reported by ${round.spoilageReportedBy || 'Staff'}`,
      occurredAt,
    );
  }

  if (round.status === 'handed_over' && !addExactEvents(['handed_over'])) {
    addLegacy('handover-legacy', 'Handed Over', 'Distribution pickup', round.completedAt);
  }
  if (round.status === 'cancelled' && !addExactEvents(['cancelled'])) {
    addLegacy('cancelled-legacy', 'Cancelled', round.notes || 'Cancellation reason not recorded', round.completedAt);
  }

  events
    .filter((event: ProductionRoundHistoryEvent) => !consumed.has(event.id))
    .sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime())
    .forEach(event => items.push({
      key: event.id,
      stage: event.stage,
      occurredAt: event.occurredAt,
      details: event.details,
      recordedBy: event.recordedBy,
    }));

  return items;
}
