/* ========================================================================== 
   ShoreVest One — Cross-Border Asset Tracing V2 triage engine

   Synthetic, deterministic design module. It converts a reviewed subject profile
   into investigation-readiness measures, search prerequisites and a controlled
   next-step recommendation. It does not search the web, handle files, make legal
   conclusions or calculate recoverability.
   ========================================================================== */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SVAssetTracingV2 = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MATTER_STAGES = ['Pre-action', 'During proceedings', 'Before foreign enforcement'];
  var INVESTIGATION_PHASES = ['Origin profiling', 'Targeted international investigation', 'Reporting for legal action'];
  var METHODS = ['OSINT', 'HUMINT', 'Fieldwork', 'Legal / disclosure process'];
  var ASSET_CLASSES = ['Real estate', 'Company shares / interests', 'Cash / bank accounts', 'Aircraft / vessels', 'High-value movables', 'Digital assets'];
  var RECOMMENDATIONS = [
    'Request better information from creditor',
    'Continue free internal profiling',
    'Purchase specified record',
    'Conduct approved targeted OSINT search',
    'Commission narrow external preliminary search',
    'Commission full external asset trace',
    'Begin or continue monitoring',
    'Obtain jurisdiction-specific legal advice',
    'Preserve lead and defer',
    'Stop further investigation',
    'Send reviewed evidence package to NPL underwriting'
  ];

  function arr(value) { return Array.isArray(value) ? value : []; }
  function text(value) { return String(value == null ? '' : value).trim(); }
  function bool(value) { return value === true; }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function daysUntil(value, now) {
    if (!value) return null;
    var when = new Date(value).getTime();
    var base = now ? new Date(now).getTime() : Date.now();
    if (!isFinite(when) || !isFinite(base)) return null;
    return Math.ceil((when - base) / 86400000);
  }

  function identityReadiness(profile) {
    var p = profile || {};
    var checks = [
      { key: 'native-name', label: 'Native-language name', weight: 10, pass: !!text(p.nativeName) },
      { key: 'english-name', label: 'English / romanised name', weight: 8, pass: !!text(p.englishName) },
      { key: 'date-of-birth', label: 'Full or partial date of birth', weight: 14, pass: !!text(p.dateOfBirth) },
      { key: 'government-id', label: 'Full or partial government identifier', weight: 18, pass: !!text(p.governmentId) },
      { key: 'address', label: 'Current or historical address', weight: 18, pass: arr(p.addresses).some(function (x) { return !!text(x && (x.address || x)); }) },
      { key: 'signature', label: 'Signature or equivalent identity anchor', weight: 8, pass: bool(p.signatureAvailable) },
      { key: 'company-anchor', label: 'Verified company or registration anchor', weight: 10, pass: arr(p.companyNumbers).some(function (x) { return !!text(x); }) },
      { key: 'nationality-residency', label: 'Nationality, residency or citizenship clue', weight: 7, pass: arr(p.residencyClues).length > 0 },
      { key: 'network', label: 'Known family or associate relationship', weight: 7, pass: arr(p.family).length + arr(p.associates).length > 0 }
    ];
    var score = checks.reduce(function (sum, check) { return sum + (check.pass ? check.weight : 0); }, 0);
    return {
      score: clamp(score, 0, 100),
      checks: checks,
      missing: checks.filter(function (check) { return !check.pass; }).map(function (check) { return check.label; })
    };
  }

  function footprintScore(screen) {
    var destinations = arr(screen.destinationJurisdictions).filter(function (j) {
      return j && text(j.jurisdiction) && ['Confirmed presence', 'Strong presence clue', 'Commercial activity', 'Residential address', 'Family presence'].indexOf(j.basis) !== -1;
    });
    if (!destinations.length) return 0;
    if (destinations.some(function (j) { return j.basis === 'Confirmed presence' || j.basis === 'Residential address' || j.basis === 'Commercial activity'; })) return 3;
    if (destinations.length >= 2) return 2;
    return 1;
  }

  function networkScore(profile) {
    var family = arr(profile && profile.family).filter(function (x) { return x && text(x.name || x); }).length;
    var associates = arr(profile && profile.associates).filter(function (x) { return x && text(x.name || x); }).length;
    var advisers = arr(profile && profile.advisers).filter(function (x) { return x && text(x.name || x); }).length;
    var total = family + associates + advisers;
    if (total >= 5) return 3;
    if (total >= 2) return 2;
    if (total === 1) return 1;
    return 0;
  }

  function lifestyleScore(screen) {
    var indicators = arr(screen.lifestyleIndicators);
    if (!indicators.length) return 0;
    var documentary = indicators.filter(function (x) { return x && x.evidenceType === 'Documentary evidence'; }).length;
    var corroborated = indicators.filter(function (x) { return x && (x.confidence === 'Confirmed' || x.confidence === 'Corroborated'); }).length;
    if (documentary >= 1 && corroborated >= 2) return 3;
    if (corroborated >= 1 || indicators.length >= 3) return 2;
    return 1;
  }

  function strongestLead(screen) {
    var leads = arr(screen.leads);
    if (!leads.length) return { strength: 0, lead: null };
    var ranked = leads.slice().sort(function (a, b) {
      return Number(b.leadStrength || 0) - Number(a.leadStrength || 0);
    });
    return { strength: clamp(Number(ranked[0].leadStrength || 0), 0, 3), lead: ranked[0] };
  }

  function urgentFlags(screen, now) {
    var deadlineDays = daysUntil(screen.decisionDeadline, now);
    var flags = [];
    if (screen.matterStage === 'Pre-action' && Number(screen.dissipationIndicators || 0) >= 2) flags.push('Possible pre-action dissipation requires urgent human review.');
    if (Number(screen.competingCreditorRisk || 0) >= 2) flags.push('Competing creditors may affect timing and the available recovery pool.');
    if (deadlineDays != null && deadlineDays <= 7) flags.push('Decision deadline is within seven days.');
    if (bool(screen.subjectAlerted)) flags.push('The subject may already be alerted to enforcement or investigation.');
    return { flags: flags, deadlineDays: deadlineDays, urgent: flags.length > 0 };
  }

  function creditorRequests(profile, screen) {
    var p = profile || {};
    var requests = [];
    if (!text(p.dateOfBirth)) requests.push('Full or partial date of birth');
    if (!text(p.governmentId)) requests.push('Complete or partial government ID / passport details');
    if (!arr(p.addresses).length) requests.push('Current and historical residential and business addresses');
    if (!arr(p.companyNumbers).length) requests.push('Known company names and registration numbers');
    if (!bool(screen.guaranteeDocumentAvailable)) requests.push('Executed personal guarantee and amendments');
    if (!bool(screen.kycPackAvailable)) requests.push('Creditor KYC / onboarding file and supporting identity documents');
    if (!bool(screen.transactionCluesAvailable)) requests.push('Known overseas remittance, bank, investment or transaction clues');
    if (!arr(p.family).length) requests.push('Known spouse, children and close-family details');
    return requests;
  }

  function addTask(tasks, data) {
    tasks.push({
      id: 'task-' + (tasks.length + 1),
      jurisdiction: text(data.jurisdiction) || 'Cross-jurisdiction',
      subject: text(data.subject) || 'Primary subject and approved related parties',
      sourceFamily: data.sourceFamily,
      method: data.method || 'OSINT',
      purpose: data.purpose,
      prerequisite: text(data.prerequisite),
      priority: data.priority || 'Medium',
      expectedCost: data.expectedCost == null ? 'Unknown' : data.expectedCost,
      status: data.prerequisite ? 'Blocked pending prerequisite' : 'Proposed'
    });
  }

  function buildSearchPlan(screen) {
    var tasks = [];
    var profile = screen.profile || {};
    var hasAddress = arr(profile.addresses).length > 0;

    arr(screen.destinationJurisdictions).forEach(function (j) {
      if (!j || !text(j.jurisdiction)) return;
      addTask(tasks, {
        jurisdiction: j.jurisdiction,
        sourceFamily: 'Corporate and beneficial-ownership records',
        purpose: 'Confirm current and former companies, directorships, shareholders, addresses and filing history.',
        priority: j.priority || 'High',
        expectedCost: j.corporateRecordCost || 'Free / low cost'
      });
      addTask(tasks, {
        jurisdiction: j.jurisdiction,
        sourceFamily: 'Litigation, insolvency and regulatory records',
        purpose: 'Identify proceedings, asset disclosures, creditor actions, insolvency events and timing clues.',
        priority: j.priority || 'High',
        expectedCost: j.litigationRecordCost || 'Free / low cost'
      });
      addTask(tasks, {
        jurisdiction: j.jurisdiction,
        sourceFamily: 'Land and property records',
        purpose: 'Verify current or former registered ownership, financing, title changes and disposal history.',
        prerequisite: hasAddress ? '' : 'Confirmed address or other property identifier; reverse owner-name searching may be unavailable.',
        priority: j.priority || 'High',
        expectedCost: j.propertyRecordCost || 'Varies by jurisdiction'
      });
    });

    arr(screen.structuringJurisdictions).forEach(function (j) {
      if (!j || !text(j.jurisdiction)) return;
      addTask(tasks, {
        jurisdiction: j.jurisdiction,
        sourceFamily: 'Offshore entity, trust and service-provider records',
        purpose: 'Map the holding layer, agents, directors, shareholders and links to underlying destination assets.',
        priority: j.priority || 'Medium',
        expectedCost: j.recordCost || 'Varies',
        prerequisite: j.companyNumberRequired && !arr(profile.companyNumbers).length ? 'Company name or registration number' : ''
      });
    });

    arr(screen.assetClassClues).forEach(function (clue) {
      if (!clue || ASSET_CLASSES.indexOf(clue.assetClass) === -1) return;
      if (clue.assetClass === 'Cash / bank accounts') {
        addTask(tasks, {
          jurisdiction: clue.jurisdiction,
          sourceFamily: 'Bank relationship / account disclosure',
          method: 'Legal / disclosure process',
          purpose: 'Preserve the bank or transaction clue for counsel; no public ownership database exists.',
          prerequisite: clue.bankOrTransactionAnchor ? '' : 'Named bank, account, transfer or relationship clue',
          priority: 'High',
          expectedCost: 'Legal review required'
        });
      } else if (clue.assetClass === 'Digital assets') {
        addTask(tasks, {
          jurisdiction: clue.jurisdiction || 'Cross-jurisdiction',
          sourceFamily: 'Blockchain and exchange attribution',
          purpose: 'Trace a known wallet or transaction while keeping attribution to the subject separate.',
          prerequisite: clue.walletOrTransactionAnchor ? '' : 'Wallet, transaction, exchange or off-ramp clue',
          priority: clue.priority || 'Medium',
          expectedCost: clue.expectedCost || 'Specialist review may be required'
        });
      } else if (clue.assetClass === 'Aircraft / vessels') {
        addTask(tasks, {
          jurisdiction: clue.jurisdiction,
          sourceFamily: 'Aircraft / vessel registry and operator records',
          purpose: 'Identify registered owner, operator, financier and beneficial-use indicators.',
          prerequisite: clue.registrationOrLocationAnchor ? '' : 'Registration, operator, travel or location anchor',
          priority: clue.priority || 'Medium',
          expectedCost: clue.expectedCost || 'Free / low cost'
        });
      }
    });

    if (screen.matterStage === 'During proceedings') {
      addTask(tasks, {
        sourceFamily: 'Ongoing monitoring',
        purpose: 'Monitor title, directorship, shareholding, litigation and insolvency changes while proceedings continue.',
        priority: 'High',
        expectedCost: screen.monitoringCost || 'Internal / provider-dependent'
      });
    }

    return tasks;
  }

  function adequateNegativeCoverage(screen) {
    var coverage = arr(screen.coverage);
    if (!coverage.length) return false;
    var complete = coverage.filter(function (c) {
      return c && c.status === 'Searched' && text(c.jurisdiction) && text(c.sourceFamily) && text(c.searchDate);
    });
    return complete.length >= 3 && complete.some(function (c) { return c.sourceFamily === 'Land and property records'; }) &&
      complete.some(function (c) { return c.sourceFamily === 'Corporate and beneficial-ownership records'; });
  }

  function recommendation(screen, analysis) {
    var id = analysis.identity;
    var urgent = analysis.urgency;
    var lead = analysis.strongest;
    var plan = analysis.searchPlan;
    var blocked = plan.filter(function (task) { return task.status === 'Blocked pending prerequisite'; });
    var currentStrongAsset = lead.lead && lead.strength === 3 && lead.lead.recordType === 'Current asset' && Number(lead.lead.ownershipConfidence || 0) >= 2;
    var transferComplexity = arr(screen.transferEvents).length >= 2 || bool(screen.proxyHoldingSuspected) || arr(screen.offshoreStructures).length >= 2;

    if (urgent.urgent && (screen.matterStage === 'Pre-action' || Number(screen.competingCreditorRisk || 0) >= 2)) {
      return {
        action: 'Obtain jurisdiction-specific legal advice',
        reason: 'Timing, dissipation or competing-creditor indicators may require legal action before further ordinary research.',
        secondary: screen.matterStage === 'During proceedings' ? 'Begin or continue monitoring' : 'Conduct approved targeted OSINT search'
      };
    }
    if (id.score < 50) {
      return {
        action: 'Request better information from creditor',
        reason: 'The identity pack is not yet strong enough for reliable same-name matching or address-led research.',
        secondary: 'Continue free internal profiling'
      };
    }
    if (!analysis.footprint && !lead.strength) {
      return {
        action: 'Continue free internal profiling',
        reason: 'No genuine overseas footprint or credible asset lead is yet established.',
        secondary: 'Request better information from creditor'
      };
    }
    if (blocked.length && blocked.some(function (task) { return /address|identifier|company/i.test(task.prerequisite); })) {
      return {
        action: 'Request better information from creditor',
        reason: 'The highest-yield searches are blocked by missing identifiers, addresses or company anchors.',
        secondary: 'Purchase specified record'
      };
    }
    if (currentStrongAsset && transferComplexity) {
      return {
        action: 'Commission full external asset trace',
        reason: 'A strong current asset lead exists, but proxy, transfer or offshore complexity requires deeper investigation and legal coordination.',
        secondary: 'Obtain jurisdiction-specific legal advice'
      };
    }
    if (currentStrongAsset) {
      return {
        action: 'Commission narrow external preliminary search',
        reason: 'The current lead is strong enough to justify targeted independent verification of ownership, encumbrances and enforceability inputs.',
        secondary: 'Purchase specified record'
      };
    }
    if (lead.strength >= 2) {
      return {
        action: 'Conduct approved targeted OSINT search',
        reason: 'Credible leads exist, but targeted records and identity verification should be completed before broader external spend.',
        secondary: 'Purchase specified record'
      };
    }
    if (!lead.strength && adequateNegativeCoverage(screen)) {
      return {
        action: Number(screen.futureMonitoringValue || 0) >= 2 ? 'Preserve lead and defer' : 'Stop further investigation',
        reason: 'Adequately scoped searches have not produced a meaningful lead; absence remains limited to the recorded scope.',
        secondary: 'Begin or continue monitoring'
      };
    }
    return {
      action: 'Conduct approved targeted OSINT search',
      reason: 'The profile is sufficiently developed for a controlled jurisdiction-by-jurisdiction first pass.',
      secondary: 'Purchase specified record'
    };
  }

  function operationalPriority(screen, analysis) {
    var deadline = analysis.urgency.deadlineDays;
    var urgencyPoints = analysis.urgency.urgent ? 25 : (deadline != null && deadline <= 21 ? 15 : 5);
    var score = urgencyPoints + analysis.strongest.strength * 15 + analysis.footprint * 8 +
      Math.round(analysis.identity.score * 0.2) + analysis.network * 4 + analysis.lifestyle * 3;
    return {
      score: clamp(score, 0, 100),
      label: score >= 75 ? 'Immediate operational priority' : score >= 50 ? 'High operational priority' : score >= 30 ? 'Normal operational priority' : 'Low operational priority',
      disclaimer: 'Operational priority ranks investigative attention only. It is not a recoverability, expected-recovery or investment score.'
    };
  }

  function assess(screen, options) {
    var s = screen || {};
    var analysis = {
      identity: identityReadiness(s.profile || {}),
      footprint: footprintScore(s),
      network: networkScore(s.profile || {}),
      lifestyle: lifestyleScore(s),
      strongest: strongestLead(s),
      urgency: urgentFlags(s, options && options.now),
      creditorRequests: creditorRequests(s.profile || {}, s),
      searchPlan: buildSearchPlan(s)
    };
    analysis.recommendation = recommendation(s, analysis);
    analysis.operationalPriority = operationalPriority(s, analysis);
    analysis.investigationPhase = analysis.identity.score < 60 ? 'Origin profiling' :
      (analysis.recommendation.action === 'Obtain jurisdiction-specific legal advice' || analysis.recommendation.action === 'Commission full external asset trace' ? 'Reporting for legal action' : 'Targeted international investigation');
    analysis.prohibitedConclusion = 'This assessment does not determine liability, beneficial ownership, legal reachability, creditor priority, expected recovery or whether ShoreVest should acquire an NPL.';
    return analysis;
  }

  return {
    matterStages: MATTER_STAGES,
    investigationPhases: INVESTIGATION_PHASES,
    methods: METHODS,
    assetClasses: ASSET_CLASSES,
    recommendations: RECOMMENDATIONS,
    identityReadiness: identityReadiness,
    buildSearchPlan: buildSearchPlan,
    assess: assess
  };
});
