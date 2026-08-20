# ShoreVest One - Cross-Border Asset Tracing V2 AI architecture

Status: design baseline for a synthetic prototype. This document contains no real subjects, identifiers, addresses, assets, case facts or third-party report content.

## 1. Design principle

The product should not be a single unconstrained chatbot with access to every case file and the open web. It should be a controlled investigation workspace in which narrow AI jobs produce structured, cited suggestions for human review.

AI assists with intake, extraction, normalization, search planning, source triage, contradiction detection, evidence-linked drafting and quality control. It must not independently decide liability, beneficial ownership, legal reachability, expected recovery, litigation strategy, NPL acquisition or external dissemination.

## 2. Proposed Microsoft architecture

### User interface

- ShoreVest One web application or a Power App for the production case workspace.
- Microsoft Entra ID authentication and case-team authorization.
- Case-specific views for intake, identity, jurisdictions, documents, searches, leads, assets, review and report generation.

### System of record

- Dataverse for structured case, subject, source, lead, asset, relationship, coverage, assessment, approval and audit records.
- SharePoint restricted case libraries for source documents, with unique case permissions and Microsoft Purview sensitivity labels.
- OneDrive may be used only as a user-facing drop location. A Power Automate flow should move accepted documents into the restricted SharePoint case library rather than leaving the operating repository in personal OneDrive folders.

### Orchestration

- Power Automate for document intake, malware/format checks, metadata capture, queue creation, approval tasks, notification and controlled export.
- AI Builder or Azure AI Document Intelligence for OCR, page segmentation and repeatable field extraction where templates or document families justify it.
- Copilot Studio for the analyst-facing agent and guided actions, grounded only in the selected case and approved knowledge sources.
- A custom Azure service may be required for advanced entity resolution, graph analysis, provider connectors, web capture, immutable source snapshots and precise model controls.

### Retrieval

- Retrieval must be case-scoped and permission-aware.
- Every retrieved passage must retain document ID, file version, page, paragraph or record reference, source type, access classification and retrieval time.
- Production should use SharePoint/Dataverse permissions directly where possible. If an Azure AI Search index is introduced, document-level ACL metadata must be preserved and enforced at query time.

## 3. AI jobs

Each job has a defined input, output schema, allowed sources and human approval state.

### Job A - Intake completeness checker

Input: structured case intake and selected internal documents.

Output:

- missing obligation documents;
- missing identifiers;
- missing known-address information;
- missing family, associate or company clues;
- deadline, budget and jurisdiction conflicts;
- questions for the originating investment or enforcement team.

It must not infer that a guarantee is valid or enforceable.

### Job B - Document classifier and source register builder

Input: newly accepted case documents.

Output:

- document type;
- language;
- date;
- issuer/source;
- confidentiality and sharing flags;
- page count;
- possible subject names and identifiers;
- source-register entry;
- extraction quality warnings.

The original file remains authoritative. AI output is a proposed index entry only.

### Job C - Identity attribute extractor

Input: one document or a tightly scoped set of documents.

Output: proposed attributes with exact citations:

- native and English names;
- aliases and transliterations;
- date-of-birth clues;
- nationality, residency and citizenship clues;
- partial identifiers;
- addresses and address types;
- phone, email and social identifiers;
- companies and roles;
- relatives and associates.

Each attribute needs its own confidence and source. The system must not merge two people merely because names match.

### Job D - Entity-resolution assistant

Input: proposed attributes and existing case entities.

Output:

- possible match;
- possible duplicate;
- possible conflict;
- reasons supporting and opposing the match;
- missing identifiers that would resolve the ambiguity.

All merges require human confirmation. Uncertain identities remain separate nodes.

### Job E - Jurisdiction hypothesis generator

Input: approved identity attributes, addresses, company links, citizenship/residency clues, transaction history and internal case clues.

Output for each jurisdiction:

- supporting clues;
- target subjects;
- likely record families;
- search prerequisites;
- free versus paid availability;
- estimated effort and cost band;
- priority;
- limitations;
- recommended human approval.

The agent should explicitly explain when address-led research is required and when reverse property ownership is unavailable, costly or impractical.

### Job F - Search-plan composer

Input: approved jurisdiction hypotheses and a jurisdiction playbook.

Output:

- ordered search tasks;
- exact subject/name variants;
- sources to search;
- date ranges;
- expected result type;
- capture requirements;
- stop conditions;
- escalation conditions.

The agent creates tasks. It does not silently search restricted, paid or legally sensitive sources.

### Job G - Controlled public-web research assistant

This should be introduced only after the document workflow is proven.

Allowed behavior:

- run approved queries against permitted public sources;
- capture the source URL, title, publisher, publication date, access date and relevant excerpt;
- save a snapshot or approved evidentiary copy where licensing permits;
- propose leads rather than conclusions;
- record negative searches as scoped search events.

Disallowed behavior:

- bypass access controls or CAPTCHAs;
- scrape sources contrary to terms;
- use personal accounts or consumer AI tools;
- expose confidential clues in public queries without approval;
- treat search-engine summaries as evidence;
- represent an unsearched jurisdiction as clear.

### Job H - Provider-report and registry-record extractor

Input: manually downloaded reports and records placed in the approved case library.

Output:

- cited identities;
- companies;
- properties;
- transactions;
- litigation;
- liens and charges;
- former assets;
- transfers;
- potential proxies;
- stated limitations;
- recommended next steps.

The extraction must preserve whether a statement is a primary record, media report, provider analysis or human-source allegation.

### Job I - Lead and asset candidate builder

Input: approved extracted facts.

Output: separate structured records for:

- jurisdiction clue;
- address lead;
- company or trust interest;
- asset candidate;
- former or sold asset;
- transfer event;
- proxy/nominee hypothesis;
- creditor or encumbrance;
- litigation or enforcement lead;
- financial-institution clue.

AI must not turn every address or company role into an asset.

### Job J - Contradiction and gap detector

Checks for:

- conflicting dates, names and identifiers;
- inconsistent ownership or transaction histories;
- current/sold/transferred status conflicts;
- assets without primary-source support;
- conclusions unsupported by citations;
- missing encumbrance checks;
- same-name false positives;
- negative searches without recorded scope;
- jurisdiction claims without supporting clues;
- stale records;
- circular citations between AI-generated notes.

### Job K - Assessment assistant

AI may propose separate assessments, each with reasons and citations:

- identity confidence;
- jurisdiction relevance;
- asset-link strength;
- current-ownership confidence;
- encumbrance risk;
- transfer/dissipation risk;
- competing-claim risk;
- liquidity/realizability;
- enforcement complexity;
- information completeness;
- likely value of further investigation.

It may recommend a next action but may not calculate a definitive recovery probability unless ShoreVest later approves a separately validated methodology.

### Job L - Cited drafting assistant

Produces a preliminary report from reviewer-approved records only.

Required sections:

- purpose and decision supported;
- subjects and identity limitations;
- scope and methodology;
- executive summary;
- asset and lead tables;
- ownership, status, transfers, encumbrances and competing claims;
- jurisdiction coverage;
- contradictions and unresolved issues;
- potential next steps;
- recommendation category;
- source register and citations;
- legal and investigative limitations.

No uncited generated factual sentence may enter an approved report.

### Job M - Reviewer copilot

The reviewer can ask:

- What evidence supports this statement?
- What evidence cuts against it?
- Is this current ownership or historical ownership?
- Is this an asset, an address, an associate link or only a jurisdiction clue?
- Which searched sources produced no result?
- Which likely record families remain unsearched?
- What would most efficiently resolve the top uncertainty?
- Which findings depend only on secondary or human sources?

The reviewer copilot should answer from structured case records and citations, not improvise.

## 4. Human gates

Separate approvals are required for:

1. identity merge;
2. jurisdiction plan;
3. public-web query containing confidential clues;
4. paid record purchase;
5. provider/API use;
6. finding approval;
7. asset-candidate classification;
8. asset-lead score;
9. recommendation to commission an external tracer;
10. recommendation to seek legal advice;
11. report freeze/export;
12. any investment or enforcement decision.

No single approval should imply the later approvals.

## 5. Recommendation categories

The agent should recommend one of the following, with reasons and unresolved conditions:

- obtain better identifiers or documents first;
- continue free internal research;
- purchase targeted public records;
- commission a scoped external preliminary search;
- commission a full asset trace;
- seek jurisdiction-specific legal advice;
- preserve/monitor a lead;
- defer because evidence is too weak or stale;
- stop because likely cost exceeds investigative value;
- refer to the investment team for a separate NPL underwriting decision.

The investment team must see the evidence package and limitations, not an AI-generated buy/no-buy answer.

## 6. Prompt and model controls

Every AI call must receive:

- a narrow task instruction;
- the case and document scope;
- permitted data classes;
- output JSON schema;
- source-citation requirement;
- prohibition on unsupported completion;
- a distinction between fact, inference, allegation and unknown;
- a confidence field;
- instructions to return `insufficient evidence` when appropriate.

Store model name/version, prompt template version, input source IDs, output, citations, user, time, approval state and reviewer changes.

## 7. Security and governance

- Real cases must not use the public/static portal.
- Use a dedicated Power Platform environment and restricted SharePoint site.
- Apply least-privilege Entra groups per case or matter team.
- Apply Purview sensitivity labels and retention policies.
- Configure Power Platform/Copilot Studio data-loss-prevention policies so confidential case data cannot be combined with unapproved consumer or social connectors.
- Separate privileged legal material from general investigation material where counsel requires it.
- Redact full personal identifiers from ordinary screens, logs and prompts unless the specific approved task needs them.
- Disable model training on ShoreVest data under the chosen enterprise service terms.
- Maintain full audit of retrieval, AI generation, edits, approvals, downloads and exports.

## 8. Recommended implementation sequence

### Pilot 1 - AI over synthetic and redacted documents only

- manual upload into a restricted test library;
- document classification;
- page-level extraction;
- identity attribute suggestions;
- lead/asset classification;
- contradiction checks;
- cited preliminary report;
- reviewer approval.

### Pilot 2 - Closed historical case

- use a legally approved, redacted historical matter;
- compare AI extraction and report coverage against the completed external report;
- measure factual precision, citation accuracy, false matches, missed leads and analyst time saved;
- do not allow autonomous web research.

### Pilot 3 - Controlled public research

- introduce a small approved source list and jurisdiction playbooks;
- human approves query sets before execution;
- capture search logs and evidence snapshots;
- compare internal output against an external tracer's preliminary screen.

### Pilot 4 - Live pipeline triage

- deploy only after access control, audit, retention, provider licensing and legal review are complete;
- use AI to prioritise investigative spend, not to approve an NPL purchase.

## 9. Success measures

- percentage of proposed facts with valid page-level citations;
- identity false-match rate;
- unsupported statement rate;
- contradiction detection rate;
- percentage of negative searches with complete scope metadata;
- reviewer override rate by AI job;
- time from intake to preliminary screen;
- external tracing spend avoided or better targeted;
- comparison with external investigator findings;
- user confidence and ease of review;
- zero unauthorized disclosure incidents.
