'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const validate = process.argv.includes('--validate');

function trackedFiles(...patterns) {
  return execFileSync('git', ['ls-files', ...patterns], { cwd: ROOT, encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean);
}

const EXACT_REPLACEMENTS = [
  ['Research series · Since 2018', 'Research series, Since 2018'],
  ['Issue 47 · July 17, 2026', 'Issue 47, July 17, 2026'],
  ['Asset-backed lending · Asset restructuring · Debt resolution', 'Asset-backed lending, asset restructuring and debt resolution'],
  ['Claim priority · enforceability · exit routes', 'Claim priority, enforceability and exit routes'],
  ['BRIDGE · REFINANCE · ACQUISITION', 'BRIDGE\u00a0\u00a0REFINANCE\u00a0\u00a0ACQUISITION'],
  ['RESTRUCTURING · DEEP VALUE ACQUISITIONS', 'RESTRUCTURING\u00a0\u00a0DEEP VALUE ACQUISITIONS'],
  ['NEGOTIATION · AUCTION · SALE', 'NEGOTIATION\u00a0\u00a0AUCTION\u00a0\u00a0SALE'],
  ['Bloomberg · Reuters · The Economist · Nikkei Asia · SCMP', 'Bloomberg, Reuters, The Economist, Nikkei Asia and SCMP'],
  ['Interviews · Panels · Podcasts · Commentary', 'Interviews, panels, podcasts and commentary'],
  ['Guangzhou · Shanghai · Beijing · Hong Kong', 'Guangzhou, Shanghai, Beijing and Hong Kong'],
  ['Guangzhou · Shanghai · Beijing · Shenzhen', 'Guangzhou, Shanghai, Beijing and Shenzhen'],
  ['研究系列 · 始于 2018 年', '研究系列，始于 2018 年'],
  ['第 47 期 · 2026 年 7 月 17 日', '第 47 期，2026 年 7 月 17 日'],
  ['资产支持贷款 · 资产重组 · 债务处置', '资产支持贷款、资产重组、债务处置'],
  ['债权优先级 · 可执行性 · 退出路径', '债权优先级、可执行性、退出路径'],
  ['过桥 · 再融资 · 收购', '过桥　再融资　收购'],
  ['重组 · 深度价值收购', '重组　深度价值收购'],
  ['协商 · 拍卖 · 出售', '协商　拍卖　出售'],
  ['访谈 · 专题讨论 · 播客 · 评论', '访谈、专题讨论、播客和评论'],
  ['广州 · 上海 · 北京 · 香港', '广州、上海、北京和香港'],
  ['广州 · 上海 · 北京 · 深圳', '广州、上海、北京和深圳'],
  ['新岸资本 · 中国债务动态', '新岸资本　中国债务动态'],
  ['新岸資本 · 中國債務動態', '新岸資本　中國債務動態'],
  ['ShoreVest · China Debt Dynamics', 'ShoreVest China Debt Dynamics'],
  ['2025 年 11 月 6 日 · 专题讨论', '2025 年 11 月 6 日　专题讨论']
];

function normalizeContent(content) {
  let output = content;
  for (const [from, to] of EXACT_REPLACEMENTS) output = output.split(from).join(to);

  output = output
    .replace(/Issue\s+(\d+)\s*·\s*/g, 'Issue $1, ')
    .replace(/Volume\s+(\d+)\s*·\s*Issue\s+(\d+)/g, 'Volume $1, Issue $2')
    .replace(/第\s*(\d+)\s*期\s*·\s*/g, '第 $1 期，')
    .replace(/&ensp;\s*&middot;\s*&ensp;/gi, ', ')
    .replace(/&middot;/gi, ', ')
    .replace(/' \\u00b7 '/g, "', '")
    .replace(/" \\u00b7 "/g, '", "')
    .replace(/\\u00b7/g, '')
    .replace(/\s+·\s+/g, ', ');

  return output;
}

function shouldNormalize(rel) {
  if (/^(?:employee-portal|shorevest-one|docs|server|services|api|tests)(?:\/|$)/i.test(rel)) return false;
  if (/\.html?$/i.test(rel)) return true;
  return /^assets\/js\/(?:cdd-|chinese-copy-overrides|press-events|shared-footer|shared-header)/i.test(rel);
}

const files = [...new Set(trackedFiles('*.html', '**/*.html', 'assets/js/*.js'))].filter(shouldNormalize);
const remaining = [];

for (const rel of files) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) continue;
  const before = fs.readFileSync(abs, 'utf8');
  const after = normalizeContent(before);

  if (!validate && after !== before) fs.writeFileSync(abs, after);
  const inspected = validate ? after : fs.readFileSync(abs, 'utf8');

  if (/Research series\s*·|Issue\s+\d+\s*·|Volume\s+\d+\s*·\s*Issue|Asset-backed lending\s*·|Claim priority\s*·|BRIDGE\s*·|RESTRUCTURING\s*·|NEGOTIATION\s*·|Bloomberg\s*·\s*Reuters|Interviews\s*·|Guangzhou\s*·|研究系列\s*·|资产支持贷款\s*·|债权优先级\s*·|过桥\s*·|重组\s*·|协商\s*·|访谈\s*·|广州\s*·|新岸(?:资本|資本)\s*·|ShoreVest\s*·\s*China Debt Dynamics|\\u00b7|&middot;/i.test(inspected)) {
    remaining.push(rel);
  }
}

if (remaining.length) {
  throw new Error('User-facing middle-dot separators remain in: ' + remaining.join(', '));
}

console.log(`Copy punctuation ${validate ? 'validated' : 'normalized'} across ${files.length} public files.`);
