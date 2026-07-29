'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const GUARD_VERSION = '20260730-approved-cn-copy-1';
const FAVICON_SVG = '/assets/favicon-shorevest-20260724.svg';
const FAVICON_ICO = '/assets/favicon-shorevest-20260724.ico';
const FAVICON_32 = '/assets/favicon-shorevest-20260724-32x32.png';
const FAVICON_16 = '/assets/favicon-shorevest-20260724-16x16.png';
const APPLE_TOUCH = '/assets/apple-touch-icon-shorevest-20260724.png';
const MANIFEST = '/site-20260724.webmanifest';
const HOME_TITLE = 'ShoreVest Partners | China Asset-Backed Private Credit';
const HOME_DESCRIPTION = 'ShoreVest Partners is a specialist in asset-backed private credit in China, providing solutions for borrowers and financial institutions.';

const FAVICON_BLOCK = [
  '<!-- ShoreVest favicon: dated filenames prevent browsers from reusing retired tab artwork. -->',
  `<link rel="icon" href="${FAVICON_SVG}" type="image/svg+xml" sizes="any">`,
  `<link rel="icon" href="${FAVICON_ICO}" sizes="any">`,
  `<link rel="shortcut icon" href="${FAVICON_ICO}">`,
  `<link rel="icon" href="${FAVICON_32}" type="image/png" sizes="32x32">`,
  `<link rel="icon" href="${FAVICON_16}" type="image/png" sizes="16x16">`,
  `<link rel="apple-touch-icon" href="${APPLE_TOUCH}" sizes="180x180">`,
  `<link rel="manifest" href="${MANIFEST}">`
].join('\n');

const REQUIRED_FAVICON_HREFS = [
  FAVICON_SVG,
  FAVICON_ICO,
  FAVICON_32,
  FAVICON_16,
  APPLE_TOUCH,
  MANIFEST
];

const LEGACY_FAVICON_PATTERN = /(?:\/favicon\.ico|favicon-(?:cinnabar|shorevest-20260722)|apple-touch-icon-(?:cinnabar|shorevest-20260722)|site-20260722\.webmanifest|site\.webmanifest)/i;

const WEBSITE_SCHEMA = [
  '<script type="application/ld+json" data-sv-website-schema="true">',
  '{',
  '  "@context": "https://schema.org",',
  '  "@type": "WebSite",',
  '  "@id": "https://shorevest.com/#website",',
  '  "url": "https://shorevest.com/",',
  '  "name": "ShoreVest",',
  '  "alternateName": ["ShoreVest Partners", "shorevest.com"],',
  '  "publisher": { "@id": "https://shorevest.com/#organization" }',
  '}',
  '</script>'
].join('\n');

function walk(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(absolute));
    else files.push(absolute);
  }
  return files;
}

function isPublicHtml(absolute) {
  if (!absolute.toLowerCase().endsWith('.html')) return false;
  const relative = path.relative(ROOT, absolute).split(path.sep).join('/');
  if (/^(?:internal-preview|employee-portal|docs|tests|api|services|infra|templates)(?:\/|$)/.test(relative)) return false;
  if (/^assets\/email\//.test(relative)) return false;
  return true;
}

function stripExistingFaviconLinks(html) {
  let output = html.replace(/^[ \t]*<!--\s*ShoreVest favicon:[\s\S]*?-->\s*\r?\n?/gim, '');
  output = output.replace(/^[ \t]*<link\b[^>]*>\s*\r?\n?/gim, tag => {
    const match = tag.match(/\brel\s*=\s*(["'])(.*?)\1/i);
    if (!match) return tag;
    const rels = match[2].toLowerCase().trim().split(/\s+/).filter(Boolean);
    const faviconRel = rels.some(rel =>
      rel === 'icon' ||
      rel === 'shortcut' ||
      rel === 'apple-touch-icon' ||
      rel === 'mask-icon' ||
      rel === 'manifest'
    );
    return faviconRel ? '' : tag;
  });
  return output.replace(/(<meta\b[^>]*\bname=(["'])viewport\2[^>]*>)[ \t]*(?:\r?\n[ \t]*)+/i, '$1\n');
}

function refreshGuardVersion(html) {
  return html.replace(/<script\b[^>]*\bsrc=(["'])([^"']*assets\/js\/favicon-guard\.js)(?:\?[^"']*)?\1[^>]*>/gi, tag =>
    tag.replace(/favicon-guard\.js(?:\?[^"']*)?/i, `favicon-guard.js?v=${GUARD_VERSION}`)
  );
}

function insertFaviconBlock(html) {
  const viewport = /<meta\b[^>]*\bname=(["'])viewport\1[^>]*>/i;
  if (viewport.test(html)) {
    return html.replace(viewport, match => `${match}\n${FAVICON_BLOCK}`);
  }
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${FAVICON_BLOCK}\n</head>`);
  }
  return html;
}

function isCanonicalHomepage(html) {
  return /<link\b[^>]*\brel=(["'])canonical\1[^>]*\bhref=(["'])https:\/\/shorevest\.com\/?\2[^>]*>/i.test(html) ||
    /<link\b[^>]*\bhref=(["'])https:\/\/shorevest\.com\/?\1[^>]*\brel=(["'])canonical\2[^>]*>/i.test(html);
}

function replaceMeta(html, attribute, key, content) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`<meta\\b(?=[^>]*\\b${attribute}\\s*=\\s*(["'])${escapedKey}\\1)[^>]*>`, 'i');
  const replacement = `<meta ${attribute}="${key}" content="${content}">`;
  return pattern.test(html) ? html.replace(pattern, replacement) : html;
}

function normalizeHomepageSearchSignals(html) {
  if (!isCanonicalHomepage(html)) return html;

  let output = html;
  output = output.replace(/<title>[\s\S]*?<\/title>/i, `<title>${HOME_TITLE}</title>`);
  output = replaceMeta(output, 'name', 'description', HOME_DESCRIPTION);
  output = replaceMeta(output, 'property', 'og:title', HOME_TITLE);
  output = replaceMeta(output, 'property', 'og:description', HOME_DESCRIPTION);

  if (!/<meta\b(?=[^>]*\bproperty=(["'])og:site_name\1)[^>]*>/i.test(output)) {
    const ogLocale = /(<meta\b[^>]*\bproperty=(["'])og:locale\2[^>]*>\s*)/i;
    if (ogLocale.test(output)) {
      output = output.replace(ogLocale, '$1<meta property="og:site_name" content="ShoreVest">\n');
    } else {
      output = output.replace(/<\/head>/i, '<meta property="og:site_name" content="ShoreVest">\n</head>');
    }
  } else {
    output = replaceMeta(output, 'property', 'og:site_name', 'ShoreVest');
  }

  output = output.replace(/^[ \t]*"foundingDate"\s*:\s*"[^"]+",\s*\r?\n/m, '');
  output = output.replace(/"description"\s*:\s*"ShoreVest is a specialist in private credit, providing solutions for both borrowers and financial institutions across China\."/, `"description": "${HOME_DESCRIPTION}"`);
  output = output.replace(/https:\/\/shorevest\.com\/assets\/(?:apple-touch-icon-(?:cinnabar|shorevest-20260722|shorevest-20260724)\.png|favicon-shorevest-20260722\.svg)/g, `https://shorevest.com${FAVICON_SVG}`);
  output = output.replace(/"width"\s*:\s*180/g, '"width": 512');
  output = output.replace(/"height"\s*:\s*180/g, '"height": 512');

  output = output.replace(/^[ \t]*<script\b[^>]*\bdata-sv-website-schema=(["'])true\1[^>]*>[\s\S]*?<\/script>\s*\r?\n?/gim, '');
  const guard = /<script\b[^>]*\bsrc=(["'])[^"']*assets\/js\/favicon-guard\.js[^"']*\1[^>]*>/i;
  if (guard.test(output)) {
    output = output.replace(guard, `${WEBSITE_SCHEMA}\n$&`);
  } else {
    output = output.replace(/<\/head>/i, `${WEBSITE_SCHEMA}\n</head>`);
  }

  return output;
}

function faviconLinkHrefs(html) {
  const hrefs = [];
  const links = html.match(/<link\b[^>]*>/gi) || [];
  for (const tag of links) {
    const relMatch = tag.match(/\brel\s*=\s*(["'])(.*?)\1/i);
    const hrefMatch = tag.match(/\bhref\s*=\s*(["'])(.*?)\1/i);
    if (!relMatch || !hrefMatch) continue;
    const rels = relMatch[2].toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (rels.some(rel => rel === 'icon' || rel === 'shortcut' || rel === 'apple-touch-icon' || rel === 'mask-icon' || rel === 'manifest')) {
      hrefs.push(hrefMatch[2].split(/[?#]/)[0]);
    }
  }
  return hrefs;
}

function hasValidFaviconSet(html) {
  const hrefs = faviconLinkHrefs(html);
  if (hrefs.some(href => LEGACY_FAVICON_PATTERN.test(href))) return false;
  return REQUIRED_FAVICON_HREFS.every(href => hrefs.includes(href));
}

function normalize(html) {
  if (!/<head(?:\s|>)/i.test(html)) return html;
  let output = stripExistingFaviconLinks(html);
  output = refreshGuardVersion(output);
  output = insertFaviconBlock(output);
  output = normalizeHomepageSearchSignals(output);
  return output;
}

function main() {
  const validate = process.argv.includes('--validate');
  const changed = [];
  const invalid = [];
  const invalidHomepageSignals = [];
  const publicHtml = walk(ROOT).filter(isPublicHtml);

  for (const absolute of publicHtml) {
    const relative = path.relative(ROOT, absolute).split(path.sep).join('/');
    const before = fs.readFileSync(absolute, 'utf8');
    const after = normalize(before);

    if (after !== before) {
      changed.push(relative);
      if (!validate) fs.writeFileSync(absolute, after);
    }

    const inspected = validate ? before : after;
    if (/<head(?:\s|>)/i.test(inspected) && !hasValidFaviconSet(inspected)) invalid.push(relative);

    if (isCanonicalHomepage(inspected)) {
      const validTitle = inspected.includes(`<title>${HOME_TITLE}</title>`);
      const validDescription = inspected.includes(`<meta name="description" content="${HOME_DESCRIPTION}">`);
      const validSiteName = inspected.includes('<meta property="og:site_name" content="ShoreVest">');
      const validWebsiteSchema = inspected.includes('data-sv-website-schema="true"') && inspected.includes('"@type": "WebSite"');
      if (!validTitle || !validDescription || !validSiteName || !validWebsiteSchema) invalidHomepageSignals.push(relative);
    }
  }

  if (validate && (invalid.length || invalidHomepageSignals.length)) {
    if (invalid.length) console.error(`Invalid favicon declarations in ${invalid.length} file(s): ${invalid.slice(0, 20).join(', ')}`);
    if (invalidHomepageSignals.length) console.error(`Invalid homepage search signals in ${invalidHomepageSignals.length} file(s): ${invalidHomepageSignals.join(', ')}`);
    process.exit(1);
  }

  if (!validate) console.log(`Normalized the 20260724 ShoreVest favicon set across ${changed.length} of ${publicHtml.length} public HTML file(s).`);
  else console.log(`Validated the 20260724 ShoreVest favicon set across ${publicHtml.length} public HTML file(s).`);
}

main();
