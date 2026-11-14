import { makePaneerQaFixture } from './qaFixture';
import { PREFIX } from './storage';
const recoveryKey = 'vejoy_traceability_recovery:before-features-20261111';
if (localStorage.getItem(PREFIX+'initialized') && !localStorage.getItem(recoveryKey)) {
  const data=Object.fromEntries(Object.keys(localStorage).filter(k=>k.startsWith(PREFIX)).map(k=>[k,localStorage.getItem(k)]));
  localStorage.setItem(recoveryKey,JSON.stringify({savedAt:new Date().toISOString(),data}));
}
// Fictional records, seeded once. Never reseed over existing test work.
if (!localStorage.getItem(PREFIX + 'initialized')) {
  const at = '2026-11-10T05:00:00+02:00';
  const lot = { id: 'trace-demo-milk', lotCode: '091126', receiptDate: '2026-11-09', receiptTime: '06:00',
    supplier: 'LOCAL TEST SUPPLIER', invoiceNo: 'DEMO-ONLY', litresReceived: 12000, litresConsumed: 0,
    litresRemaining: 12000, litresRejected: 0, litresSpilled: 0, status: 'active', isLatest: true };
  const shift = { id: 'trace-demo-shift', milkLotId: lot.id, milkLotCode: lot.lotCode, shiftNumber: 1,
    startedAt: at, team: ['Test team'], status: 'active' };
  const rounds = ['D', 'C/S'].map((type, index) => ({ id: `trace-demo-round-${index + 1}`,
    milkLotId: lot.id, milkLotCode: lot.lotCode, shiftId: shift.id, shiftNumber: 1, roundNumber: index + 1,
    type, status: 'scheduled', team: ['Test team'], plannedInput: 500, actualInput: 0,
    outputWeight: 0, startTime: at, locked: false }));
  for (const key of ['creamLots', 'intermediateLots', 'finishedStock', 'temperatureReadings', 'wasteEvents',
    'utilityLogs', 'cipRecords', 'butterLotClosures', 'crumbingBatches', 'distributionHandovers', 'breadDoughBatches',
    'factoryChecklists', 'instructions']) localStorage.setItem(PREFIX + 'vejoy_' + key, '[]');
  for (const [key, value] of Object.entries({ milkLots: [lot], productionShifts: [shift], productionRounds: rounds })) {
    localStorage.setItem(PREFIX + 'vejoy_' + key, JSON.stringify(value));
  }
  if(location.port==='4342'){
    const qa=makePaneerQaFixture(true);
    for(const [key,value] of Object.entries({milkLots:qa.lots,productionRounds:qa.rounds,productionShifts:[qa.shift],traceability:qa.state}))localStorage.setItem(PREFIX+'vejoy_'+key,JSON.stringify(value));
  }
  localStorage.setItem(PREFIX + 'initialized', new Date().toISOString());
}
if (!localStorage.getItem('vejoy_user_role')) localStorage.setItem('vejoy_user_role', 'owner');
if (!localStorage.getItem('vejoy_user_username')) localStorage.setItem('vejoy_user_username', 'Local test owner');
