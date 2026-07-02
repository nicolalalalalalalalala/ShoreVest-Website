# ShoreVest Website — Institutional Reset (Pass Report)

A refinement pass toward an institutional-asset-manager read (Oaktree / Brookfield /
Ares / HPS standard), preserving brand continuity (Cinnabar accent, circular logo
logic, layout grammar). This pass **supersedes the Brand Compliance Audit on the
simplified-vs-traditional question** and acts on the firm-leadership redirect.

---

## 1. Characters — simplified site-wide; traditional reserved for the logo lockup (§2 / §4)

Reverses the prior pass's "traditional everywhere" enforcement.

- **Content converted to Simplified Chinese** (full traditional→simplified, via OpenCC
  `t2s`, not just `資→资`) across the bilingual content pages:
  `index_cn.html`, `index-cn.html`, `strategy_cn.html`, `team_cn.html`,
  `press_cn.html`, `insights_cn.html`. These pages were previously written in heavily
  *mixed* traditional/simplified script (e.g. `為`, `信貸`, `動態`, `願景`); they now
  read cleanly as Simplified (`为`, `信贷`, `动态`, `愿景`, `新岸资本`).
- **Logo lockup kept Traditional `新岸資本`** consistently as the heritage mark
  (the established choice across the nav/footer brand SVG, `shared-header.js`
  wordmark/alt, `firm.html` `.cev-mark`, `shorevest-logo-download.html`, the CDD
  publication mastheads, and the logo-image `alt` attributes). One script, used on
  every logo instance — no mixing within a lockup.
- **Protected from conversion:** the personal name `潘夏峯` (left exactly as written)
  and the logo-image `alt="新岸資本 logo"` (matches the heritage mark).
- Nav link labels were already Simplified (`公司 / 策略 / 洞察 / 团队 / 联系`) — unchanged.

Verification: no residual traditional forms remain in converted-page content; markup
tag counts are byte-for-byte equal to pre-conversion (no structural damage).

## 2. Risk audit — public exposure stripped (§5 / §10)

Removed from indexed public pages (keep these for gated LP materials only):

- **Specific LTV / CTV percentages** on `strategy.html`: the "30–60%" entry threshold,
  the per-sleeve "40–50% LTV", "50–60% CTV", "30–40% LTV" attribute rows, and the
  "Conservative LTV/CTV bands" bullet — replaced with neutral framing
  ("Conservative basis / entry below assessed collateral value", "Conservative entry
  basis with stressed recovery assumptions"). Mirrored on `strategy_cn.html`.
- **Named counterparty / transaction** in the Fanger bio (`team.html` + `team_cn.html`):
  the "Morgan Stanley's 2001 acquisition … first successful large-scale foreign NPL
  purchase" claim is softened to a non-named, non-superlative phrasing.

Confirmed clean site-wide afterward: no `LTV`/`CTV`, no `IRR`/`MOIC`, no named deals
(Wenzhou Lonsid, Wuhan Cold Chain, Jiangsu Great Wall, Hefei Shengda, FN Square, …),
no `entrustment`/`QFLP`/`WFOE`. (Team members' prior employers — AIG, RBC,
MassMutual, etc. — are retained as standard institutional bio history, not deal
counterparties.)

## 3. Copy style — sentence case, no shouty display headings (§7 / §8)

Removed `text-transform: uppercase` from the **display-heading** selectors (small
eyebrows / kickers / buttons keep their uppercase, per institutional convention) and
rewrote the literal-caps heading text to sentence case:

| Page | Selectors de-capped | Example heading change |
|---|---|---|
| Home | `.section-title`, `.home-cdd__title`, `.home-cdd__feature h3` | "ROOTED IN CHINA. BUILT FOR INSTITUTIONAL CAPITAL." → "Rooted in China. Built for institutional capital." |
| Strategy | broad `.strategy-page h2`, `.risk-return-item h3` | "ORIGINATION DISCIPLINE." → "Origination discipline." (opportunity & three-sub-strategy sections were already sentence-case) |
| Firm | `.firm-hero .firm-hero-title` | "CHINA PRIVATE CREDIT, INSTITUTIONAL DISCIPLINE." → sentence case |
| Team | `.sv-section-title` | "LEADERSHIP & INVESTMENT." → "Leadership & investment."; hero "THE PEOPLE…" → "The people…" |
| Insights / Press / Contact | `.cp-hero__title`, `.press-events-heading h2` | "MEDIA." → "Media."; "CONTACT" → "Contact"; "CHINA DEBT DYNAMICS." → "China debt dynamics." |

Also calmed the strategy `h2` display size (~15–20% down) and softened the firm-hero
text-shadow toward §8's restraint.

---

## Open items (need design iteration / cannot be verified blind in code)

- **§4 Logo redwood:** the symbol artwork (SVG) itself was **not redrawn**. The
  character/lockup decision is implemented; refining the redwood mark (vertical,
  rooted, single-colour, no foliage flourish, legible 24px→hero) is a design task on
  the vector asset.
- **§7 / §8 full sweep:** sentence-case + display-restraint was applied to the primary
  indexed pages (home, strategy, firm, team, insights, press, contact). Legal/utility
  pages and the CDD article templates were not swept.
- **§9 functional polish** (responsive 375px audit, filters, footer disclosures) and the
  Adobe Fonts kit BLOCKER from the prior report remain outstanding.
