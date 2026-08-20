# ShoreVest One - What Ben actually wants from Asset Tracing

Status: product-intent brief for a synthetic prototype. No real names, identifiers, addresses, case facts or third-party report content belong in the public repository.

## The real job to be done

This is not primarily a case-management system, a report archive or a legal-strategy engine.

It is an internal, low-cost first-screening capability for a pipeline of offshore personal-guarantor NPL opportunities. It should help ShoreVest decide, quickly and consistently, which guarantors or related parties deserve:

1. no further work;
2. a request to the creditor for better identifiers or documents;
3. more free internal research;
4. purchase of specific records or database reports;
5. a narrowly scoped external preliminary search;
6. a full external asset trace;
7. jurisdiction-specific legal advice; or
8. escalation into separate NPL underwriting.

The unit of value is not a polished report. It is a better allocation decision for each name in the pipeline.

## What success looks like

For each subject, the tool should reduce the time and money required to answer five questions:

1. Who exactly is this person or entity?
2. Where are they, and which jurisdictions are genuinely worth searching?
3. What credible asset, ownership, transfer or whereabouts leads exist?
4. What is missing, contradictory, stale or inaccessible?
5. What is the highest-value next step, and what will it cost in time and money?

The system succeeds when it helps the team avoid paying for weak names, identify promising names earlier, ask creditors for the right missing information, and give external tracers a narrower and better-prepared scope.

## Primary users

- Investment / Capital Solutions case owner
- Cross-border enforcement lead
- Legal reviewer
- Research analyst
- Final approver for external spend

The design should reflect James's workflow: a portfolio or pipeline view first, then a subject-level screen, then a deeper case workspace only for selected names.

## Product shape

### 1. Pipeline screen

The default view should compare many subjects side by side. Each row should show:

- matter / exposure;
- subject and related parties;
- identity completeness;
- likely whereabouts and jurisdictions;
- strongest lead type;
- 0-3 asset-lead strength;
- key limitations;
- missing creditor information;
- recommended next action;
- estimated next-step cost and time;
- owner and decision deadline.

This is the main decision surface.

### 2. Guided first screen

Opening a subject should launch a guided sequence:

1. import the creditor pack and internal clues;
2. extract names, aliases, IDs, addresses, companies, family and associates;
3. confirm identity attributes one by one;
4. generate jurisdiction hypotheses;
5. build an approved search plan;
6. run or record free and paid searches;
7. classify leads, assets, former assets, transfers, proxies and encumbrances;
8. review contradictions and gaps;
9. produce a recommendation and creditor request list;
10. generate a short cited screening memo.

### 3. Deep case workspace

The existing source, finding, review and report functions remain useful, but only after a subject has passed the first screen. They are supporting infrastructure, not the product centre.

## AI's actual role

AI should act as a controlled research analyst, not an autonomous investigator.

High-value AI jobs are:

- intake completeness check;
- document classification and extraction;
- multilingual name and alias generation;
- attribute-level entity matching suggestions;
- relationship and company-network extraction;
- address and whereabouts clue extraction;
- jurisdiction hypothesis generation;
- search-plan drafting;
- source-result summarisation with exact citations;
- lead / asset / transfer / encumbrance classification;
- contradiction and stale-information detection;
- creditor information-request drafting;
- next-step and external-scope recommendation;
- cited preliminary memo drafting.

AI must never silently merge identities, treat an address as ownership, convert a scoped negative search into proof of absence, infer beneficial ownership as fact, give legal advice, approve external spend, recommend an NPL purchase or initiate enforcement.

## The recommendation engine

Recommendations should be rule-based and explainable. AI may draft the rationale, but deterministic checks should control the outcome.

Inputs should include:

- identity completeness;
- jurisdiction specificity;
- source quality and recency;
- asset-lead strength;
- ownership-link confidence;
- current / former / sold / transferred status;
- encumbrance and competing-claim information;
- transfer / dissipation indicators;
- legal-access prerequisites;
- remaining research cost;
- decision deadline;
- exposure relevance.

The tool should not collapse these into a single recovery score.

## Required outputs per subject

1. One-line recommendation.
2. 0-3 asset-lead score with narrow definition.
3. Identity completeness and unresolved match risks.
4. Likely whereabouts and ranked jurisdictions.
5. Confirmed facts, plausible leads and unsupported allegations separated.
6. Current assets, former assets, transfers and addresses separated.
7. Encumbrances, competing claims and legal-access unknowns.
8. Searches completed and exact scope of negative results.
9. Missing information to request from the creditor.
10. Cheapest useful next step.
11. Proposed external tracer scope if escalation is recommended.
12. Short cited preliminary memo.

## Cost and workflow discipline

Ben's emphasis on free or low-cost internal work means the tool should show cost before escalation and make the cheapest useful next step obvious. A broad search should not be recommended when one missing identifier, one historical filing or one litigation document could unlock the next stage.

The system should record:

- estimated minutes / hours;
- record or provider cost;
- external tracer budget;
- legal budget;
- deadline;
- expected information gain;
- approval required.

## What the MVP should be

The first production-worthy pilot should do three things well:

1. ingest a synthetic or redacted creditor pack and provider report;
2. extract a cited identity pack, jurisdiction plan, leads and missing-information list for analyst approval;
3. rank a small pipeline and generate an explainable recommendation for each subject.

It should not begin with a general chatbot, automated scraping across the internet or full legal-recovery modelling.

## Design correction to the current prototype

Keep the existing evidence, review and report controls, but move them behind a new pipeline-first workflow. The home experience should answer: "Which names should we spend time and money on next?" rather than "Which case record should I open?"
