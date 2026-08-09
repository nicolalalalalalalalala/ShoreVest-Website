'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const sourcePath = path.join(__dirname, 'normalize-public-site.cjs');
const temporaryPath = path.join(__dirname, '.normalize-public-site-approved-cdd.cjs');
let source = fs.readFileSync(sourcePath, 'utf8');

// v7i4 was initially withheld while the source PDF and publication decision were
// unresolved. Ben's reviewed archive decision approves it for the public site.
source = source
  .replace(
    "const EXCLUDED_CDD_ROUTE = '/insights/china-debt-dynamics/v7i4/';",
    "const EXCLUDED_CDD_ROUTE = '/__no_excluded_cdd_route__/';"
  )
  .replace(
    "const EXCLUDED_CDD_SOURCE = 'china-debt-dynamics-v7i4.html';",
    "const EXCLUDED_CDD_SOURCE = '__no_excluded_cdd_source__.html';"
  )
  .replace(
    "if (rel === EXCLUDED_CDD_SOURCE || rel === 'insights/china-debt-dynamics/v7i4/index.html') {",
    "if (rel === EXCLUDED_CDD_SOURCE || rel === '__no_excluded_cdd_generated_route__.html') {"
  )
  .replace(
    `  output = output
    .replace(/(<span class="cdd-stat__num">)21(<\\/span><span class="cdd-stat__label">Issues in archive)/g, '$120$2')
    .replace(/(<span data-cdd-arc-count>)21(<\\/span> articles)/g, '$120$2');
  return output;`,
    '  return output;'
  )
  .replace(
    'assert(/<span class="cdd-stat__num">20<\\/span><span class="cdd-stat__label">Issues in archive/.test(insightsIndex), \'Insights issue count is not 20\');',
    'assert(/<span class="cdd-stat__num">21<\\/span><span class="cdd-stat__label">Issues in archive/.test(insightsIndex), \'Insights issue count is not 21\');'
  );

if (
  source.includes("Insights issue count is not 20") ||
  source.includes("'$120$2'") ||
  source.includes("rel === 'insights/china-debt-dynamics/v7i4/index.html'")
) {
  throw new Error('Unable to patch the legacy v7i4 exclusion policy.');
}

fs.writeFileSync(temporaryPath, source);
const run = spawnSync(process.execPath, [temporaryPath, ...process.argv.slice(2)], {
  cwd: path.resolve(__dirname, '..'),
  encoding: 'utf8'
});
try { fs.unlinkSync(temporaryPath); } catch (_) {}
process.stdout.write(run.stdout || '');
process.stderr.write(run.stderr || '');
if (run.status !== 0) process.exit(run.status == null ? 1 : run.status);

const punctuationScript = path.join(__dirname, 'normalize-copy-punctuation.cjs');
const punctuationRun = spawnSync(process.execPath, [punctuationScript, ...process.argv.slice(2)], {
  cwd: path.resolve(__dirname, '..'),
  encoding: 'utf8'
});
process.stdout.write(punctuationRun.stdout || '');
process.stderr.write(punctuationRun.stderr || '');
process.exit(punctuationRun.status == null ? 1 : punctuationRun.status);
