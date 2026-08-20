# ShoreVest One - Cross-Border Asset Tracing V2 decision model

Status: design baseline for a synthetic prototype. This document contains no real subjects, identifiers, addresses, assets, case facts or third-party report content.

## 1. Product objective

The module is an internal preliminary-screening and research-management tool for cross-border personal-guarantor and related-party asset leads. It should help the case team decide:

1. whether the available identifiers and clues support meaningful internal research;
2. which jurisdictions and source types should be searched first;
3. which leads require targeted verification;
4. whether a matter justifies paid external asset tracing;
5. whether legal strategy advice is required before reliance or action; and
6. whether the evidence is too weak, stale, encumbered or uneconomic to pursue.

It is not an autonomous asset tracer, a legal-opinion generator, a valuation tool or an acquisition approval engine.

## 2. Core correction to the current model

The existing 0-3 score must be treated only as **asset-lead strength**. It must not be presented as a single measure of recoverability, expected recovery or investment attractiveness.

A current, directly owned property may still be a poor recovery target because it is heavily mortgaged, already subject to competing claims, transferred, protected by a trust, held in a difficult jurisdiction or disproportionate to the cost of enforcement. Conversely, a strong address, residency or family clue may justify deeper tracing without constituting a recoverable asset.

V2 therefore separates evidence quality, asset linkage and recovery practicality.

## 3. Required workflow

### Stage 1 - Decision and exposure intake

Record:

- decision being supported;
- personal guarantee or relevant obligation status;
- creditor and debtor relationship;
- exposure amount and currency;
- acquisition or enforcement deadline;
- available budget for internal records, external tracing and legal advice;
- owner, reviewer and cross-border enforcement lead;
- confidentiality, privilege and third-party sharing restrictions.

The tool must not imply that a subject with assets is liable, or that an identified asset is reachable, unless the underlying obligation and legal route have been separately reviewed.

### Stage 2 - Identity pack

For each person or entity record:

- native-language and English names;
- aliases, transliterations, former names and name-order variants;
- full or partial date of birth;
- nationality, residency, citizenship and immigration clues;
- full or partial government identifiers, stored only in the restricted production environment;
- current, former, residential, business and correspondence addresses;
- phone, email and social identifiers where lawfully available;
- spouse, children, siblings, close associates and known employees;
- current and former companies, trusts, partnerships and holding vehicles;
- source and confidence for each identity attribute.

Identity confidence must be attribute-specific. A confirmed company directorship does not automatically confirm that a same-name property owner is the subject.

### Stage 3 - Jurisdiction hypothesis

The tool should create a reasoned jurisdiction plan from evidence, not a free-text list. Each proposed jurisdiction needs:

- clue supporting the jurisdiction;
- target subject or related party;
- likely searchable record types;
- prerequisites such as a confirmed address, full identifier or company number;
- expected cost and time;
- access method: public web, paid record, licensed provider, manual filing, external tracer or counsel;
- priority and reason;
- status: proposed, approved, searched, blocked, exhausted or deferred.

The interface must explain that reverse property ownership searches are unavailable or impractical in many jurisdictions and that address-led research is often the correct sequence.

### Stage 4 - Search plan and coverage

Coverage must be recorded by jurisdiction, subject, source family and date. Source families include:

- corporate and beneficial-ownership records;
- securities and listed-company disclosures;
- property and land records;
- mortgages, liens, charges and secured lending;
- litigation, insolvency and enforcement records;
- regulatory records;
- trusts, foundations and offshore structures;
- aircraft, vessels and other registrable assets;
- media and open-source research in relevant languages;
- internal creditor material;
- licensed or proprietary databases;
- human-source material, subject to separate restrictions.

A negative result must state the exact names, identifiers, databases, date range and jurisdiction searched. It must never be converted into a conclusion that no asset exists.

### Stage 5 - Lead register

Every lead must be classified as one of:

- current asset;
- former or sold asset;
- current business interest;
- former business interest;
- address or location clue;
- residency or citizenship clue;
- financing or bank relationship;
- litigation or disclosure lead;
- transfer or dissipation indicator;
- family or associate link;
- possible proxy or nominee holding;
- trust or offshore-structure lead;
- negative scoped search;
- contradiction or identity conflict.

A lead is not automatically an asset.

### Stage 6 - Asset register

Potential assets require separate fields for:

- asset type and jurisdiction;
- registered owner;
- claimed beneficial owner;
- subject-to-asset link;
- identity-match confidence;
- ownership confidence;
- current, former, sold, transferred or unknown status;
- acquisition and disposal dates;
- estimated gross value, valuation date and basis;
- mortgages, liens, charges and other encumbrances;
- known litigation, freezing orders and competing creditors;
- transfer-risk or proxy indicators;
- liquidity and saleability;
- enforcement-access note;
- sources and exact references;
- verification required.

Gross value must never be displayed as estimated recoverable value without deductions and legal review.

### Stage 7 - Evidence and inference

The tool must keep these separate:

- source fact;
- analyst inference;
- unresolved hypothesis;
- contradiction;
- legal implication requiring counsel;
- recovery implication requiring case-team review.

Each conclusion must link to one or more source records. Inferences must identify the facts they rely on and what would disprove them.

### Stage 8 - Multi-axis assessment

V2 should display the following axes independently:

1. **Identity certainty** - confidence that records relate to the correct subject.
2. **Asset linkage** - direct ownership, corporate control, beneficial interest, family/associate link, address only or unknown.
3. **Currentness** - current, recently transferred, historical, sold or unknown.
4. **Evidence quality** - primary record, corroborated sources, indicative source, unverified or contradicted.
5. **Value and liquidity** - known, estimated, speculative or unavailable.
6. **Encumbrance and competing claims** - clear, partially known, heavily encumbered, disputed or unknown.
7. **Jurisdiction and enforcement practicality** - initial operational view only, subject to legal advice.
8. **Dissipation or transfer risk** - no indicator, possible, meaningful or acute.
9. **Search completeness** - limited, targeted, substantial or externally comprehensive.
10. **Cost proportionality** - likely proportionate, uncertain or likely disproportionate.

No weighted aggregate should be treated as a legal or investment conclusion. A compact case-level summary may be generated only as an explainable recommendation with open blockers.

### Stage 9 - Recommendation

The permitted preliminary recommendations are:

- improve intake before searching;
- continue free/open-source research;
- purchase targeted records;
- verify a specific identity or ownership link;
- commission external basic asset search;
- commission external full asset trace;
- obtain jurisdiction-specific legal advice;
- preserve or escalate urgently due to dissipation risk;
- hold pending additional creditor information;
- stop because leads are too weak or costs appear disproportionate.

The recommendation must name the evidence, blockers, proposed budget, responsible person and decision deadline.

### Stage 10 - Human approvals

Separate approvals are required for:

- research plan;
- use of restricted internal data;
- purchase of paid records;
- instruction of an external tracer;
- sharing with counsel or third parties;
- preliminary report approval;
- legal strategy;
- NPL acquisition or enforcement action.

Approving a preliminary report does not approve an acquisition or enforcement strategy.

## 4. Intake completeness logic

The system should calculate an intake-readiness state, not a score:

- **Blocked**: no clear decision question, no primary subject, or no legal/exposure context.
- **Weak intake**: identity is mostly name-based and lacks a date of birth, identifier, address or reliable company link.
- **Researchable**: sufficient identifiers or linked entities exist to run a controlled initial search.
- **Targeted-search ready**: jurisdiction hypotheses and prerequisites are documented.

For every missing high-value identifier, the tool should suggest who may hold it: creditor, loan file, KYC file, guarantee, litigation filing, company filing, bank document or external provider.

## 5. Lead-strength score retained from the existing reports

The 0-3 scale may remain for comparability, but only with this label and rubric:

- **0 - No meaningful lead identified in the searched scope.** Not proof of absence.
- **1 - Limited lead.** Weak, historical, indirect or poorly matched clues.
- **2 - Meaningful lead.** Credible current or actionable clues requiring targeted verification.
- **3 - Strong lead.** Confirmed or well-corroborated current asset, ownership, address or jurisdiction lead that materially supports deeper work.

A score of 3 does not mean the asset is unencumbered, enforceable or recoverable.

## 6. Explainable gates

A preliminary report may be approved only when:

- owner and reviewer are different people;
- scope, searched jurisdictions and limitations are recorded;
- every material statement links to a source;
- identity conflicts are surfaced;
- negative searches are properly scoped;
- current versus former assets are distinguished;
- asset leads state ownership confidence and currentness;
- known encumbrances and competing claims are recorded or marked unknown;
- the lead-strength score has a rationale;
- the recommendation names blockers and next actions;
- legal implications are labelled as requiring counsel.

An external-tracer recommendation also requires a proposed scope, jurisdictions, target questions, expected cost, deadline and why internal work is insufficient.

## 7. Production architecture boundary

The public repository remains synthetic. Real implementation requires:

- Entra ID authentication and server-side case permissions;
- restricted SharePoint/OneDrive ingestion with case-specific folders;
- retention, privilege and legal-hold controls;
- approved enterprise AI only;
- immutable source snapshots and page-level citations;
- source licensing and sharing controls;
- separate handling for human-source and highly sensitive identifiers;
- auditable prompts, extraction, review and report versions;
- no autonomous scraping or provider access unless approved legally, contractually and technically.

## 8. V2 build order

1. Replace the single-score review with intake readiness, multi-axis assessment and recommendation.
2. Add structured identity attributes and missing-information requests.
3. Add jurisdiction hypotheses and source-family coverage.
4. Add lead and asset registers with current/former/transfer/encumbrance logic.
5. Harden approval gates and report language.
6. Add synthetic end-to-end cases representing strong lead, false positive, sold asset, address-only clue, heavily encumbered asset and competing-creditor scenarios.
7. Add production ingestion and AI architecture only after the synthetic decision model is approved by Investment, Legal and the cross-border enforcement group.
