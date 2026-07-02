# ShoreVest Brand Compliance Audit — Report

Strict alignment of the entire site to the **ShoreVest Color & Typography Guide**.
Two typefaces only (DIN 2014 / Noto Serif SC), the 12-color brand palette, the
seven approved type roles, and the bilingual-lockup rules.

---

## 1. Adobe Fonts kit — flagged TODO (BLOCKER for production)

DIN 2014 must be licensed via Adobe Fonts (or fonts.com). The kit ID is **not yet
configured**. Every page `<head>` now carries a loud, commented placeholder:

```html
<!-- TODO: ADD ADOBE FONTS KIT FOR DIN 2014 — replace [KIT_ID] below and uncomment.
     Until configured, DIN 2014 falls back to "DIN Next"/system-ui and MUST NOT ship to production. -->
<!-- <link rel="stylesheet" href="https://use.typekit.net/[KIT_ID].css"> -->
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;500;700;900&display=swap" rel="stylesheet">
```

The link is left commented (not live) so it does not fire a 404 against a fake kit ID.
**Action required:** drop in the real `[KIT_ID]`, uncomment, then ship.

---

## 2. New single source of truth — `assets/css/shorevest-brand-tokens.css`

Created the canonical tokens file containing **only** the brand color variables, the
two font tokens, and the seven approved `.t-*` type roles (`.t-display`, `.t-h1`,
`.t-h2`, `.t-h3`/`.t-label`, `.t-body`, `.t-caption`, `.t-rule-label`, `.t-cn-lockup`,
`.t-cn-body`) plus the `.sv-lockup` / `.sv-lockup__rule` bilingual-lockup utility.

It cascades site-wide via `@import` at the top of `shorevest-typography-system.css`
(loaded on every page) and is linked directly on the two pages that don't load the
system (`shorevest-logo-download.html`; the `v10i1-print` redirect stub is exempt).

---

## 3. Fonts — substitutions removed

All non-brand typefaces were removed from font stacks, font tokens, `font:` shorthands,
and `<head>` imports, and replaced with `var(--font-en)` / DIN 2014 (English) or
`var(--font-cn)` / Noto Serif SC (Chinese).

| Removed face | Where it was | Replaced with |
|---|---|---|
| **Archivo** | firm-page, cdd-archive, strategy-page tokens; firm.html inline | DIN 2014 stack |
| **JetBrains Mono** | firm-page, cdd-archive, strategy-page tokens; firm.html inline | DIN 2014 stack |
| **Inter** | shorevest-enforcement, topbar-consistent, typography-consistent, shared-header `--font-en`; legal/logo pages | DIN 2014 stack |
| **Helvetica Neue / Arial** (primary) | every DIN fallback stack across ~22 CSS files | `"DIN Next", system-ui` |
| **EB Garamond** | shorevest-enforcement serif tokens; legal & email templates; logo page | DIN 2014 stack |
| **Cormorant Garamond** | shorevest-enforcement `--sv-font-logo-en` | DIN 2014 stack |
| **Times New Roman** | shorevest-enforcement serif tokens | DIN 2014 / Noto Serif SC |
| **Roboto / Segoe UI / PingFang / Microsoft YaHei / Noto Sans SC** | topbar & enforcement nav stacks | DIN 2014 / Noto Serif SC |

Canonical fallback stacks (guide-locked, in force until the Adobe kit lands):
- English: `"DIN 2014", "DIN Next", system-ui, sans-serif`
- Chinese: `"Noto Serif SC", serif` (bilingual runs: `"DIN 2014", "DIN Next", "Noto Serif SC", serif` — DIN renders Latin, CJK falls through to Noto)

**`<head>` font imports normalized on all 45 HTML pages:** every forbidden Google Fonts
request (Archivo, JetBrains Mono, Inter, EB Garamond) was stripped; Noto Serif SC is the
only remaining Google font (weights standardized to `400;500;700;900`); the Adobe TODO
block was inserted. `firm.html` additionally had a second forbidden font `<link>` removed.

---

## 4. Color — off-palette hex replaced (CSS)

Named violations from the brief plus off-brand reds and near-black UI inks were remapped
to the nearest brand token:

| Off-palette hex | Occurrences | → Brand color | Files |
|---|---|---|---|
| `#bfb29a` | 4 | `#D8CEB0` (xuan-dark) | cdd-archive, firm-page, strategy-page |
| `#d8cdb2` | 1 | `#D8CEB0` (xuan-dark) | cdd-archive |
| `#f4d9d3` | 3 | `#E8998F` (cinnabar-light) | cdd-archive, firm-page, strategy-page |
| `#b34734` | 2 | `#C93B2A` (cinnabar) | homepage-shorevest-brand, refinement-pass |
| `#b24a3c` | 2 | `#C93B2A` (cinnabar) | topbar-consistent |
| `#963625` | 2 | `#8A1F12` (cinnabar-dark) | homepage-shorevest-brand, refinement-pass |
| `#171410` | 13 | `#2B2620` (text-body) | topbar-consistent, shorevest-typography-reset |
| `#171717` | 8 | `#2B2620` (text-body) | topbar-consistent, typography-consistent |
| `#21463f` | 2 | `#1E4040` (qing-dark) | topbar-consistent |

`#1A1A1A` / `#333333` (named in the brief) were searched for and not present.

### Remaining off-palette values — flagged, not blindly remapped
A sweep found **~140 additional distinct off-palette hexes (~310 occurrences)** that are
subtle warm-paper near-whites (`#F6F0E6`, `#ECE3D6`, `#FDFCF9`, `#F4ECDB`…), warm mid-tones
(`#C5B8A2`, `#C8BDA6`), and dark-section foliage/teal greens (`#151A17`, `#102A18`,
`#284631`, `#7EA4A0`, `#102324`…). These sit *between* palette stops and are used in
gradients, shadows, and dark-mode surfaces where a blind remap risks contrast/legibility
regressions that can't be verified without a visual pass. They are logged here and
**held for design sign-off** rather than changed unseen. (The `#cdd-*` hits in a raw hex
grep are ID selectors, not colors.)

---

## 5. Bilingual lockup — SHOREVEST + 新岸資本

1. **Traditional characters enforced:** `新岸资本` → `新岸資本` (資 not 资) replaced across
   **17 HTML pages + `shared-header.js`** (`index_cn`/`index-cn` ×11 each, `press_cn` ×7,
   `strategy_cn` ×5, `team_cn` ×4, `insights_cn` ×2, all `china-debt-dynamics-*` viewers ×1,
   and the nav `alt`/`aria` text ×2). No simplified instance remains anywhere on the site.
2. **Cinnabar rule:** the live-text lockup in `firm.html` (`.cev-mark`) had its separating
   rule and Chinese wordmark on cinnabar-*light* `#E8998F`; both corrected to primary
   **Cinnabar `#C93B2A`**, with the Chinese wordmark in Noto Serif SC. A reusable
   `.sv-lockup__rule` utility (1px Cinnabar; vertical for inline, horizontal for stacked)
   is provided in the tokens file for future text lockups.
3. **Nav & footer lockups** are the canonical brand **SVG artwork**
   (`shorevest-lockup.svg`, `SHOREVEST PARTNERS.svg`), which already render in Cinnabar
   `#C93B2A`. The separating rule in those is part of the vector art — flagged for design
   to confirm in-asset rather than edited blindly in code.

---

## 6. Files changed (73)

- **New:** `assets/css/shorevest-brand-tokens.css`, `brand-compliance-report.md`
- **CSS (23):** article-typography-framework, cdd-archive, cdd-article-print,
  cdd-article-template, cdd-franchise-shared, chinese-latin-typography, contact-page,
  firm-page, homepage-shorevest-brand, insights-print, legal-page-layout, press-page,
  refinement-pass, shared-footer, shared-header, shared-hero, shorevest-enforcement,
  shorevest-typography-reset, shorevest-typography-system, strategy-page, team-page,
  topbar-consistent, typography-consistent
- **JS:** `assets/js/shared-header.js`
- **HTML (46):** all top-level pages + `assets/email/welcome-template{,-cn}.html`

---

## 7. Open items
- **[BLOCKER]** Configure the Adobe Fonts kit ID for DIN 2014 and uncomment the link on every page.
- Design sign-off on the ~140 residual off-palette neutrals/greens before remapping.
- Design to confirm the Cinnabar separating rule inside the nav/footer lockup SVGs.
- Section-specific components from earlier prompts (Platform Architecture, Capital
  Base + Ethos, Governance, Opportunity/Strategy, Three Sub-Strategies, Institutional
  Platform, China Debt Dynamics Archive) now inherit the compliant font/color tokens;
  their bespoke `--arc-*` / `--opp-*` / `--ip-*` display+mono tokens were repointed to DIN 2014.
