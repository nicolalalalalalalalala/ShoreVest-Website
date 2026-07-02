# Typography Lockdown — Site-Wide Audit Report

**Date:** 2026-05-30
**Branch:** `claude/typography-lockdown-audit-rFtS1`
**Approach:** Enforcement layer (lowest-risk). A single authoritative
stylesheet, `assets/css/typography-lockdown.css`, is loaded **last** in every
page `<head>` and has final say in the cascade. No page markup was rewritten.

---

## 1. Font — DIN 2014 only ✔

`assets/css/typography-lockdown.css` pins the two and only typefaces:

```css
--font:    "DIN 2014", system-ui, sans-serif;   /* English */
--font-cn: "Noto Serif SC", serif;              /* Chinese */
```

Rather than editing ~70 scattered declarations, **every legacy font token the
codebase still references is re-pointed at these two** at `:root`, so any
existing `font-family: var(--legacy)` now resolves to DIN 2014 / Noto Serif SC.
Tokens collapsed: `--font-en`, `--sans`, `--serif`, `--pr-font`, `--sv-font-en`,
`--sv-font-sans-en`, `--sv-font-serif-en`, `--sv-font-logo-en`, `--sv-type-sans`,
`--sv-header-wordmark-font`, `--site-sans-en`, `--site-serif-en`,
`--article-sans`, `--article-serif`, `--arc-display`, `--arc-mono`,
`--opp-display`, `--opp-mono`, `--ip-display`, `--ip-mono`, `--tss-display`,
`--tss-mono`, `--type-display-hero-font-family` → `--font`; the `*-zh` / `*-cn`
tokens → `--font-cn`.

**Banned brands removed at source:** `strategy-page.css` previously defined
`--tss-display: "Archivo"…` and `--tss-mono: "JetBrains Mono", …Menlo,
monospace`. Both are now `"DIN 2014", system-ui, sans-serif`.

A `* { font-family: var(--font); }` safety net plus
`:lang(zh), .cn, [lang^="zh-"] { font-family: var(--font-cn); }` catch anything
that bypasses the tokens. All 15 Chinese pages use `<html lang="zh-CN">`, which
`:lang(zh)` matches, so Chinese renders in Noto Serif SC.

> **TODO: ADD ADOBE FONTS KIT FOR DIN 2014** — still unconfigured. The loud
> comment is present in all 46 page heads and in the lockdown stylesheet.
> Until the kit ships, DIN 2014 falls back to `system-ui`. **Do not ship to
> production in this state.**

## 2. Six type roles ✔

`.t-display / .t-h1 / .t-h2 / .t-body / .t-caption / .t-label` are locked to the
exact scale (size / weight / case / tracking / colour / line-height) with
`!important` so they beat legacy declarations. The pre-existing `.t-h1` shipped
as `text-transform: uppercase` (a source of the "shouty" headings) — it is now
sentence case at 32px / 700 / −0.01em.

| Role | Size (≤720px) | Weight | Case | Tracking | Line-height | Colour |
|------|------|--------|------|----------|-------------|--------|
| Display | 48 → 36 | 300 Light Italic | sentence | 0 | 1.1 | Ink Dark |
| H1 | 32 → 26 | 700 | sentence | −0.01em | 1.15 | Ink Dark |
| H2 | 22 → 20 | 700 | sentence | 0 | 1.25 | Ink Dark |
| Body | 15 | 400 | sentence | 0 | 1.55 | Text Body |
| Caption | 12 | 400 | sentence | 0 | 1.4 | Text Muted |
| Label | 11 | 700 | **ALL CAPS** | 0.05em | 1.2 | Cinnabar (`.t-label--muted` for utility) |

Hero size is also tokenised: `--type-display-hero-font-size` (was 72px) is now
48px / 36px, so existing hero rules that read the token are locked too.

## 3. Audit checklist results

| Check | Result |
|-------|--------|
| Banned brands (Archivo, Inter, Roboto, Helvetica, Georgia, JetBrains, IBM Plex, Menlo, monospace) in any `font-family` | **0** (only in explanatory comments) |
| Lockdown stylesheet is the **last** CSS link | **46 / 46 pages** |
| Loud Adobe-kit TODO present in head | **46 / 46 pages** |
| Every referenced font token pinned to DIN/Noto | **yes** (full coverage verified) |
| `:lang(zh)` matches every Chinese page | **15 / 15** |

## 4. Deferred (out of scope for the enforcement-layer pass)

The enforcement layer locks the **system** without touching markup. Two items
inherently require per-page edits and were intentionally **not** done here (the
chosen low-risk scope):

1. **Per-page heading-class migration.** Page-specific heading classes (e.g.
   `.hero-title`, `.section-heading`) still carry their own `clamp()` sizes and
   legacy `text-transform: uppercase` in 28 stylesheets. Their *fonts* are now
   DIN/Noto via the token remap, but their *sizes/case* are only locked where an
   element uses a `.t-*` utility class. Migrating these headings to `.t-display`
   / `.t-h1` / `.t-h2` is the follow-up pass.
2. **Literal ALL-CAPS text typed into HTML** (e.g. `<h1>UPCOMING EVENTS</h1>`)
   cannot be lowercased by CSS; those need a source edit during the heading
   migration.
