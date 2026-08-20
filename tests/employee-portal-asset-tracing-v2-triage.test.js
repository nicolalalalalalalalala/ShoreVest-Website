/* ShoreVest One — Asset Tracing V2 triage regression tests */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const T = require('../assets/js/employee-portal/asset-tracing-v2-triage.js');

function baseScreen() {
  return {
    matterStage: 'Pre-action',
    decisionDeadline: '2026-09-30',
    profile: {
      nativeName: 'Synthetic Native Name',
      englishName: 'Synthetic English Name',
      dateOfBirth: '1975',
      governmentId: 'SYNTHETIC-PARTIAL-ID',
      addresses: [{ address: 'Synthetic overseas address' }],
      signatureAvailable: true,
      companyNumbers: ['SYN-001'],
      residencyClues: ['Synthetic residency clue'],
      family: [{ name: 'Synthetic Family Member' }],
      associates: [{ name: 'Synthetic Associate' }],
      advisers: []
    },
    destinationJurisdictions: [{ jurisdiction: 'Synthetic Country A', basis: 'Residential address', priority: 'High' }],
    structuringJurisdictions: [],
    lifestyleIndicators: [],
    leads: [],
    assetClassClues: [],
    transferEvents: [],
    offshoreStructures: [],
    coverage: [],
    guaranteeDocumentAvailable: true,
    kycPackAvailable: true,
    transactionCluesAvailable: true,
    dissipationIndicators: 0,
    competingCreditorRisk: 0,
    futureMonitoringValue: 0
  };
}

assert.ok(T.matterStages.includes('Pre-action'));
assert.ok(T.investigationPhases.includes('Origin profiling'));
assert.ok(T.assetClasses.includes('Cash / bank accounts'));

{
  const screen = baseScreen();
  screen.profile = { nativeName: 'Synthetic Name', englishName: 'Synthetic Name' };
  const result = T.assess(screen, { now: '2026-07-23' });
  assert.strictEqual(result.recommendation.action, 'Request better information from creditor');
  assert.ok(result.creditorRequests.includes('Complete or partial government ID / passport details'));
}

{
  const screen = baseScreen();
  screen.destinationJurisdictions = [];
  screen.structuringJurisdictions = [{ jurisdiction: 'Synthetic Offshore Centre', priority: 'Medium' }];
  const result = T.assess(screen, { now: '2026-07-23' });
  assert.strictEqual(result.footprint, 0, 'an offshore holding layer is not a real overseas footprint');
}

{
  const screen = baseScreen();
  screen.profile.addresses = [];
  const plan = T.buildSearchPlan(screen);
  const property = plan.find((task) => task.sourceFamily === 'Land and property records');
  assert.ok(property);
  assert.strictEqual(property.status, 'Blocked pending prerequisite');
  assert.ok(/reverse owner-name searching may be unavailable/i.test(property.prerequisite));
}

{
  const screen = baseScreen();
  screen.assetClassClues = [{ assetClass: 'Cash / bank accounts', jurisdiction: 'Synthetic Country A', bankOrTransactionAnchor: false }];
  const plan = T.buildSearchPlan(screen);
  const bank = plan.find((task) => task.sourceFamily === 'Bank relationship / account disclosure');
  assert.ok(bank);
  assert.strictEqual(bank.method, 'Legal / disclosure process');
  assert.strictEqual(bank.status, 'Blocked pending prerequisite');
}

{
  const screen = baseScreen();
  screen.dissipationIndicators = 3;
  screen.competingCreditorRisk = 2;
  screen.decisionDeadline = '2026-07-26';
  const result = T.assess(screen, { now: '2026-07-23' });
  assert.strictEqual(result.recommendation.action, 'Obtain jurisdiction-specific legal advice');
  assert.ok(result.urgency.flags.length >= 2);
}

{
  const screen = baseScreen();
  screen.leads = [{
    title: 'Synthetic current property lead',
    recordType: 'Current asset',
    assetClass: 'Real estate',
    leadStrength: 3,
    ownershipConfidence: 3
  }];
  screen.transferEvents = [{ id: 'synthetic-transfer-1' }, { id: 'synthetic-transfer-2' }];
  const result = T.assess(screen, { now: '2026-07-23' });
  assert.strictEqual(result.recommendation.action, 'Commission full external asset trace');
  assert.ok(/proxy, transfer or offshore complexity/i.test(result.recommendation.reason));
}

{
  const screen = baseScreen();
  screen.leads = [{
    title: 'Synthetic current company interest',
    recordType: 'Current asset',
    assetClass: 'Company shares / interests',
    leadStrength: 3,
    ownershipConfidence: 2
  }];
  const result = T.assess(screen, { now: '2026-07-23' });
  assert.strictEqual(result.recommendation.action, 'Commission narrow external preliminary search');
}

{
  const screen = baseScreen();
  screen.destinationJurisdictions = [{ jurisdiction: 'Synthetic Country A', basis: 'Strong presence clue' }];
  screen.coverage = [
    { jurisdiction: 'Synthetic Country A', sourceFamily: 'Land and property records', status: 'Searched', searchDate: '2026-07-20' },
    { jurisdiction: 'Synthetic Country A', sourceFamily: 'Corporate and beneficial-ownership records', status: 'Searched', searchDate: '2026-07-20' },
    { jurisdiction: 'Synthetic Country A', sourceFamily: 'Litigation, insolvency and regulatory records', status: 'Searched', searchDate: '2026-07-20' }
  ];
  const result = T.assess(screen, { now: '2026-07-23' });
  assert.strictEqual(result.recommendation.action, 'Stop further investigation');
  assert.ok(/limited to the recorded scope/i.test(result.recommendation.reason));
  assert.ok(!/no asset exists/i.test(result.recommendation.reason));
}

{
  const screen = baseScreen();
  screen.lifestyleIndicators = [
    { evidenceType: 'Public-source lead', confidence: 'Indicative' },
    { evidenceType: 'Documentary evidence', confidence: 'Confirmed' },
    { evidenceType: 'Public-source lead', confidence: 'Corroborated' }
  ];
  const result = T.assess(screen, { now: '2026-07-23' });
  assert.strictEqual(result.lifestyle, 3);
  assert.strictEqual(result.footprint, 3);
  assert.strictEqual(result.network, 2);
  assert.notStrictEqual(result.lifestyle, result.strongest.strength, 'investigation-readiness factors must remain separate from asset-lead strength');
}

{
  const result = T.assess(baseScreen(), { now: '2026-07-23' });
  assert.ok(/not a recoverability, expected-recovery or investment score/i.test(result.operationalPriority.disclaimer));
  assert.ok(/does not determine liability/i.test(result.prohibitedConclusion));
}

{
  const source = fs.readFileSync(path.join(__dirname, '../assets/js/employee-portal/asset-tracing-v2-triage.js'), 'utf8');
  ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'localStorage.setItem'].forEach((token) => {
    assert.ok(!source.includes(token), 'V2 triage engine contains prohibited external or persistence action: ' + token);
  });
  ['Pinewood', 'Ingots', 'DaFa', 'Sansheng', 'Ge Hekai'].forEach((term) => {
    assert.ok(!source.includes(term), 'V2 triage engine contains confidential-source term: ' + term);
  });
}

console.log('✓ All 11 ShoreVest One Asset Tracing V2 triage tests passed.');
