'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const GA_ID = 'G-CLVYF17N9H';
const INSTALLER_VERSION = '20260801-1';

const GA_BLOCK = [
  '<!-- Google tag (gtag.js) -->',
  `<script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>`,
  '<script>',
  '  window.dataLayer = window.dataLayer || [];',
  '  function gtag(){dataLayer.push(arguments);}',
  "  gtag('js', new Date());",
  '',
  `  gtag('config', '${GA_ID}');`,
  '  window.__SV_GA4_INSTALLED = true;',
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
  if (/^(?:internal-preview|employee-portal|shorevest-one|docs|tests|api|services|infra|templates)(?:\/|$)/.test(relative)) return false;
  if (/^assets\/email\//.test(relative)) return false;
  return true;
}

function installTag(html) {
  if (!/<head(?:\s|>)/i.test(html)) return html;
  if (html.includes(GA_ID)) return html;

  const viewport = /<meta\b[^>]*\bname=(["'])viewport\1[^>]*>/i;
  if (viewport.test(html)) {
    return html.replace(viewport, match => `${match}\n${GA_BLOCK}`);
  }

  return html.replace(/<\/head>/i, `${GA_BLOCK}\n</head>`);
}

function updateSecurityHeaders() {
  const headersPath = path.join(ROOT, '_headers');
  if (!fs.existsSync(headersPath)) return false;

  const before = fs.readFileSync(headersPath, 'utf8');
  let after = before;

  after = after.replace(
    "script-src 'self' 'unsafe-inline';",
    "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com;"
  );

  after = after.replace(
    "connect-src 'self' https://login.microsoftonline.com https://graph.microsoft.com;",
    "connect-src 'self' https://login.microsoftonline.com https://graph.microsoft.com https://www.google-analytics.com https://region1.google-analytics.com https://*.google-analytics.com;"
  );

  if (after === before) return false;
  fs.writeFileSync(headersPath, after);
  return true;
}

function main() {
  const validate = process.argv.includes('--validate');
  const publicHtml = walk(ROOT).filter(isPublicHtml);
  const changed = [];
  const missing = [];

  for (const absolute of publicHtml) {
    const relative = path.relative(ROOT, absolute).split(path.sep).join('/');
    const before = fs.readFileSync(absolute, 'utf8');
    const after = installTag(before);

    if (after !== before) {
      changed.push(relative);
      if (!validate) fs.writeFileSync(absolute, after);
    }

    const inspected = validate ? before : after;
    if (/<head(?:\s|>)/i.test(inspected) && !inspected.includes(GA_ID)) missing.push(relative);
  }

  const headersChanged = validate ? false : updateSecurityHeaders();

  if (validate && missing.length) {
    console.error(`Google Analytics tag missing from ${missing.length} public HTML file(s): ${missing.slice(0, 30).join(', ')}`);
    process.exit(1);
  }

  if (!validate) {
    console.log(`Installer ${INSTALLER_VERSION}: installed ${GA_ID} across ${changed.length} of ${publicHtml.length} public HTML file(s).`);
    if (headersChanged) console.log('Updated the static-host Content Security Policy for Google Analytics.');
  } else {
    console.log(`Installer ${INSTALLER_VERSION}: validated ${GA_ID} across ${publicHtml.length} public HTML file(s).`);
  }
}

main();
