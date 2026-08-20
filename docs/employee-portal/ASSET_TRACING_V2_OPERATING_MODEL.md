# ShoreVest One - Cross-Border Asset Tracing V2 operating model

Status: deck-grounded design baseline for the synthetic prototype. This file contains no real subject names, identifiers, addresses, assets, case facts or third-party report content.

## 1. What the tool is actually for

The tool is an internal preliminary-screening capability for overseas personal-guarantor and related-party matters. It should help ShoreVest decide what to do next, not pretend to complete a full asset trace automatically.

The central output is a controlled recommendation for the next investigative step, supported by an auditable subject profile, jurisdiction plan, search log and cited evidence.

The tool must support two entry points:

1. a single urgent subject; and
2. a pipeline of many subjects requiring prioritisation.

## 2. Core investigative doctrine

### 2.1 Following and tracing are different

- **Following** concerns movement of the same asset.
- **Tracing** concerns transformation of value into another form.

The system must not imply that public web research can reconstruct complex fund flows. Where cash has moved repeatedly, the correct preliminary-screening response is often to stop trying to follow each transfer and work from the other end: profile the subject, identify likely destination jurisdictions, locate assets, structures, proxies and lifestyle indicators, and then determine whether court-assisted disclosure or a deeper investigation is justified.

### 2.2 Start with the person or entity, not the asset search box

The investigation begins with subject profiling:

- identity and background;
- current and former addresses;
- family and household;
- professional history and directorships;
- litigation, insolvency and regulatory history;
- financial profile and known wealth;
- lifestyle indicators;
- network of associates, advisers and possible nominees.

The profile then determines:

- where to look;
- whose names to search;
- which structures to test;
- when value may have moved; and
- which records are likely to produce useful evidence.

### 2.3 Destination jurisdictions and structuring jurisdictions are different

The product must distinguish:

- **destination jurisdictions**, where people live or assets are likely to sit; and
- **structuring jurisdictions**, where holding companies, trusts or nominee arrangements are registered.

A BVI or Cayman entity is usually a holding layer, not proof that the underlying asset is located there. The search plan should continue through the structure to the likely asset jurisdiction.

### 2.4 No global asset database exists

The system must work jurisdiction by jurisdiction and asset class by asset class. It must never describe a broad name search as comprehensive.

## 3. Investigation stages

Every matter must be assigned one legal/investigative stage because the useful output changes by stage.

### A. Pre-action

Objective: capture the asset picture before the subject reacts and before competing creditors move.

Tool emphasis:

- rapid profiling;
- dissipation indicators;
- current-ownership evidence;
- urgent legal escalation flags;
- preservation and monitoring recommendations.

### B. During proceedings

Objective: monitor movements and changes while proceedings continue.

Tool emphasis:

- changes in title, directorship, shareholding and control;
- new litigation or insolvency events;
- movement alerts;
- competing-creditor developments;
- evidence suitable for counsel review.

### C. Before foreign enforcement

Objective: identify foreign-held assets and select jurisdictions in which enforcement or fresh proceedings may be practical.

Tool emphasis:

- current asset location;
- ownership and beneficial-ownership evidence;
- judgment or award status;
- recognition route;
- local counsel requirements;
- encumbrances and creditor priority.

## 4. Three-phase workflow

### Phase 1 - Origin profiling

Build the subject and network profile from creditor materials, ShoreVest clues, approved public sources and manually downloaded reports.

Outputs:

- identity pack;
- family and associate map;
- company and trust map;
- address timeline;
- litigation and insolvency timeline;
- lifestyle and wealth indicators;
- initial jurisdiction hypotheses;
- missing-information request to the creditor.

### Phase 2 - Targeted international investigation

Search approved jurisdictions, entities and people in order of likely yield. Findings from one jurisdiction should be allowed to create new hypotheses and search tasks in another.

Outputs:

- approved search plan;
- source-by-source coverage log;
- asset and lead register;
- proxy and offshore-structure hypotheses;
- transfer and dissipation events;
- contradictions and unresolved matches;
- next-step cost and time estimate.

### Phase 3 - Reporting for legal action

Compile reviewed findings for a defined legal or enforcement question.

Outputs:

- cited preliminary screening memo;
- external tracer brief;
- counsel handoff pack;
- monitoring plan;
- explicit limitations and prohibited conclusions.

The system does not itself produce a legal opinion, freezing-order application, disclosure application, recognition analysis or enforcement strategy.

## 5. Asset-class logic

### Real estate

Priority: high when a credible address or ownership clue exists.

Rules:

- reverse owner-name property search is often unavailable;
- address-led searches are usually more productive;
- separate registered ownership, residence, mailing address and beneficial-ownership hypothesis;
- capture acquisition, disposal, financing, title changes, mortgages, liens, litigation and current status.

### Company shares and interests

Priority: high.

Rules:

- listed shares: use exchange filings and shareholder disclosures;
- private interests: use company registries, filings and accounts;
- distinguish directorship from shareholding and shareholding from beneficial ownership;
- map common directors, addresses, agents, service providers and intercompany relationships;
- treat offshore entities as structure clues until an underlying asset or value is identified.

### Cash and bank accounts

Priority: only where a bank, account, transaction or relationship clue exists.

Rules:

- no searchable public database exists;
- AI must not claim to have found an account from general web research;
- public-source output may identify bank relationships or transfer indicators only;
- account disclosure generally requires bank cooperation, court process or other lawful authority.

### Aircraft and vessels

Priority: when travel, registration, ownership or operator clues exist.

Rules:

- use registries and physical-location evidence;
- distinguish registered owner, operator, financier and beneficial-use hypothesis.

### Art, jewellery, watches and other movables

Priority: low without a physical, transactional, insurance, auction or lifestyle anchor.

Rules:

- no broad ownership registry exists;
- classify as lifestyle intelligence unless supported by a reliable transaction or possession record.

### Digital assets

Priority: only with a wallet, transaction, exchange or off-ramp clue.

Rules:

- blockchain activity may be traceable;
- attribution to a subject is a separate evidential question;
- AI must not infer wallet ownership from speculation.

## 6. Concealment and dissipation model

The tool must classify concealment patterns separately:

1. transfer to spouse, child, parent, sibling, associate or nominee;
2. transformation into cash, digital assets or high-value movables;
3. cross-border movement;
4. offshore holding structure;
5. trust or generational-planning structure;
6. sale below market value or friendly transaction;
7. title or share transfer near distress, default, litigation or insolvency;
8. use of unrelated third parties or professional nominees.

For every transfer or proxy hypothesis, store:

- asset or value concerned;
- transferor and transferee;
- date and timing relative to distress or proceedings;
- stated consideration;
- source;
- relationship evidence;
- subject-control evidence;
- source-of-wealth inconsistency;
- legal-review requirement;
- confidence and contradictory evidence.

A family or associate relationship is a lead, not proof of beneficial ownership.

## 7. Evidence taxonomy

The product must preserve evidential weight.

### Documentary evidence

Examples: registry filing, title record, court filing, exchange filing, formal corporate account, official aircraft or vessel register.

### Public-source lead

Examples: reputable media, archived website, business network, social media, listing advertisement.

### Intelligence

Examples: lifestyle indicator, business-community information, HUMINT, field observation.

### Analyst inference

A reasoned conclusion drawn from cited material. It must be separately labelled and reviewable.

### Legal conclusion

Not generated or approved by the AI. Reserved for qualified counsel.

## 8. AI operating model

The AI is a controlled junior investigative analyst, not an autonomous investigator.

### AI may

- classify incoming documents;
- extract proposed identity attributes and relationships;
- generate name variants and transliteration candidates;
- build address and company timelines;
- suggest destination and structuring jurisdictions;
- propose an ordered search plan;
- classify a result into the correct lead or asset category;
- identify contradictions, stale information and missing prerequisites;
- draft creditor information requests;
- draft narrow external-tracer scopes;
- prepare a cited preliminary memo from approved facts;
- answer questions only from the selected case record and approved sources.

### AI may not

- merge same-name people automatically;
- label an address as owned property without title evidence;
- label a company officer as beneficial owner without supporting evidence;
- claim that no asset exists from a negative scoped search;
- infer a bank account without a lawful source;
- recommend surveillance, HUMINT or fieldwork without approval and legal/compliance review;
- decide liability, enforceability, creditor priority or admissibility;
- recommend acquiring the NPL;
- initiate external searches, purchases, communications or legal actions without approval.

## 9. OSINT, HUMINT and fieldwork controls

### OSINT

Default first-line method. Every search must record:

- approved query;
- subject and aliases searched;
- jurisdiction;
- source family;
- date;
- result;
- exact source reference;
- limitations;
- whether the source is preserved.

### HUMINT

Requires separate approval, restricted access, source-protection controls and corroboration. It cannot silently become a confirmed fact.

### Fieldwork

Requires jurisdiction-specific legal and compliance approval, licensed investigators where required, a defined purpose and a separate evidence-handling protocol.

## 10. Practical screening factors

The tool should make four source-derived screening factors visible:

1. **Real overseas footprint** - genuine presence or operations rather than only a paper offshore company.
2. **Lifestyle versus declared position** - a visible mismatch that produces concrete investigative hypotheses.
3. **Identifiable network** - family, associates, advisers and partners who can lawfully be investigated as possible holders or facilitators.
4. **Existing leads** - a known asset, address, jurisdiction, transaction or structure that narrows scope.

These are investigation-readiness factors. They are not proof of ownership or recoverability.

## 11. Required risk and strategy fields

Every screen must separately capture:

- identity readiness;
- whereabouts confidence;
- real overseas footprint;
- network visibility;
- asset-lead strength;
- ownership confidence;
- current versus former asset status;
- transfer/dissipation indicators;
- encumbrances;
- competing creditors;
- litigation and insolvency posture;
- timing urgency;
- evidence quality;
- information freshness;
- search prerequisites;
- estimated next-step cost and time;
- legal/compliance approval required.

No single number may be labelled recoverability, expected recovery or investment attractiveness.

## 12. Recommendation set

The tool must return one primary next-step recommendation from a controlled set:

1. request better information from the creditor;
2. continue free internal profiling;
3. purchase a specified record;
4. conduct an approved targeted OSINT search;
5. commission a narrow external preliminary search;
6. commission a full external trace;
7. begin or continue monitoring;
8. obtain jurisdiction-specific legal advice;
9. preserve the lead and defer;
10. stop further investigation;
11. send the reviewed evidence package to separate NPL underwriting.

Every recommendation must show:

- why it is recommended;
- prerequisites;
- expected information gain;
- expected time;
- expected external cost;
- decision owner;
- approval required;
- what would change the recommendation.

## 13. Product hierarchy

### Pipeline screen

Compare subjects by investigation readiness, strongest lead, missing information, urgency and recommended next step.

### Guided subject screen

Walk the analyst through profiling, identity review, jurisdiction planning, search coverage, lead classification, contradictions and recommendation.

### Deep case workspace

Used only where a subject proceeds to detailed investigation, monitoring, legal handoff or external tracing.

## 14. Production architecture principle

The public/static prototype may use synthetic data only. Production must use:

- authenticated access;
- case-level permissions;
- restricted document storage;
- structured records with immutable source lineage;
- sensitivity and retention controls;
- approved enterprise AI endpoints;
- separate handling for HUMINT, fieldwork and privileged legal material;
- full audit history for AI proposals, human edits, approvals and exports.
