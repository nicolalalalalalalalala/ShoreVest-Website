#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SITE_ORIGIN = 'https://shorevest.com';
const MANIFEST_PATH = path.join(ROOT, 'assets', 'data', 'clean-url-manifest.json');
const SITE_CONFIG = require(path.join(ROOT, 'assets', 'js', 'site-config.js'));
const RECRUITMENT_PUBLIC_CONFIG = require(path.join(ROOT, 'assets', 'data', 'recruitment', 'public-config.json'));

function trackedFiles() {
  return execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean);
}

function fileExists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

function slugFromFilename(filename) {
  return filename.replace(/\.html$/i, '').replace(/_cn$/i, '');
}

function routeForSource(source) {
  const overrides = {
    'home.html': '/',
    'index.html': '/',
    'home_cn.html': '/cn/',
    'index_cn.html': '/cn/',
    'careers.html': '/careers/',
    'careers/index.html': '/careers/',
    'careers_cn.html': '/cn/careers/',
    'investor-portal.html': '/investor-portal/',
    'investor-portal/index.html': '/investor-portal/',
    'investor-portal/index_cn.html': '/cn/investor-portal/',
    'investor-access-portal-terms.html': '/investor-access/terms/',
    'investor-access-portal-terms_cn.html': '/cn/investor-access/terms/',
    'china-debt-dynamics-print.html': '/insights/china-debt-dynamics/print/',
    'china-debt-dynamics-45-beijings-campaign-against-overcapacity-creates-private-credit-opportunities.html': '/insights/china-debt-dynamics/v9i4/',
    'china-debt-dynamics-into-the-shadows-of-us-private-credit.html': '/insights/china-debt-dynamics/v9i3/',
    'china-debt-dynamics-v8i5.html': '/insights/china-debt-dynamics/v8i6/',
    'china-debt-dynamics-v8i3.html': '/insights/china-debt-dynamics/v8i5/',
    'china-debt-dynamics-v8i1.html': '/insights/china-debt-dynamics/v8i3/'
  };

  if (overrides[source]) return overrides[source];

  if (!source.includes('/')) {
    if (!source.endsWith('.html') || source === '404.html') return null;
    if (/^china-debt-dynamics-v\d+i\d+\.html$/i.test(source)) {
      return `/insights/china-debt-dynamics/${slugFromFilename(source).replace('china-debt-dynamics-', '')}/`;
    }
    if (/^media-.+\.html$/i.test(source)) {
      return `/media/${slugFromFilename(source).replace(/^media-/, '')}/`;
    }
    const isChinese = /_cn\.html$/i.test(source);
    const slug = slugFromFilename(source);
    return isChinese ? `/cn/${slug}/` : `/${slug}/`;
  }

  if (/^careers\/[^/]+\.html$/i.test(source)) {
    if (source === 'careers/index.html') return '/careers/';
    const filename = path.basename(source);
    const isChinese = /_cn\.html$/i.test(filename);
    const slug = slugFromFilename(filename);
    return isChinese ? `/cn/careers/${slug}/` : `/careers/${slug}/`;
  }

  if (/^investor-portal\/[^/]+\.html$/i.test(source)) {
    const filename = path.basename(source);
    if (filename === 'index.html') return '/investor-portal/';
    return `/investor-portal/${slugFromFilename(filename)}/`;
  }

  return null;
}

function destinationForRoute(route) {
  if (route === '/') return 'index.html';
  return `${route.replace(/^\//, '').replace(/\/$/, '')}/index.html`;
}

function choosePrimarySource(route, sources) {
  const preferred = {
    '/': ['home.html', 'index.html'],
    '/cn/': ['home_cn.html', 'index_cn.html'],
    '/careers/': ['careers/index.html', 'careers.html'],
    '/investor-portal/': ['investor-portal/index.html', 'investor-portal.html']
  };
  for (const candidate of preferred[route] || []) {
    if (sources.includes(candidate)) return candidate;
  }
  return sources[0];
}

function isCareerRoleRoute(route) {
  return /^\/(?:cn\/)?careers\/[^/]+\/$/i.test(route);
}

function isCareersApplicationRoute(route) {
  return /^\/(?:cn\/)?careers\/apply\/$/i.test(route);
}

function isMediaArticleRoute(route) {
  return /^\/media\/[^/]+\/$/i.test(route);
}

function disabledRouteState(route) {
  if (isCareersApplicationRoute(route)) {
    if (RECRUITMENT_PUBLIC_CONFIG.applicationsEnabled !== true) {
      return {
        reason: 'careers-disabled',
        redirectTarget: route.startsWith('/cn/') ? '/cn/careers/#open-roles' : '/careers/#open-roles'
      };
    }
    return null;
  }
  if (SITE_CONFIG.careersOpenRolesEnabled !== true && isCareerRoleRoute(route)) {
    return {
      reason: 'careers-disabled',
      redirectTarget: route.startsWith('/cn/') ? '/cn/careers/#open-roles' : '/careers/#open-roles'
    };
  }
  if (SITE_CONFIG.mediaArchiveEnabled !== true && isMediaArticleRoute(route)) {
    return { reason: 'media-archive-disabled', redirectTarget: '/media/' };
  }
  return null;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildReplacementPairs(sourceToRoute) {
  const pairs = [];
  for (const [source, route] of sourceToRoute.entries()) {
    const clean = route;
    const absoluteLegacy = `${SITE_ORIGIN}/${source}`.replace(/\/+/g, '/').replace('https:/', 'https://');
    pairs.push([absoluteLegacy, `${SITE_ORIGIN}${clean}`]);
    pairs.push([`/${source}`, clean]);
    pairs.push([source, clean]);
  }
  return pairs.sort((a, b) => b[0].length - a[0].length);
}

function rewriteKnownUrls(content, pairs) {
  let output = content;
  for (const [legacy, clean] of pairs) {
    output = output.replace(new RegExp(escapeRegExp(legacy), 'g'), clean);
  }
  return output;
}

function rewriteRuntimeUrlBases(content) {
  return content.replace(/new URL\(([^,\n]+),\s*location\.href\)/g, 'new URL($1,document.baseURI)');
}

function rewriteLegacyPortalHref(value, currentFile) {
  if (!value) return null;
  const splitAt = value.search(/[?#]/);
  const pathname = splitAt === -1 ? value : value.slice(0, splitAt);
  const suffix = splitAt === -1 ? '' : value.slice(splitAt);
  const normalized = pathname
    .replace(/^https:\/\/shorevest\.com/i, '')
    .replace(/^https:\/\/shorevest\.github\.io\/website/i, '')
    .replace(/^\.?\//, '/');

  if (!/^\/(?:cn\/)?investor-portal\/index\/?$/i.test(normalized)) return null;
  const chineseFile = /^cn\//i.test(currentFile) || /_cn\.html$/i.test(currentFile);
  const target = chineseFile || /^\/cn\//i.test(normalized)
    ? '/cn/investor-portal/'
    : '/investor-portal/';
  return /^https?:\/\//i.test(value) ? `${SITE_ORIGIN}${target}${suffix}` : `${target}${suffix}`;
}

function rewriteHtmlAttributes(content, currentFile, sourceToRoute) {
  const currentDir = path.posix.dirname(currentFile);
  const attributePattern = /(\b(?:href|action|data-href|content)\s*=\s*)(["'])([^"']*)\2/gi;

  return content.replace(attributePattern, (match, prefix, quote, value) => {
    const fixedPortalHref = rewriteLegacyPortalHref(value, currentFile);
    if (fixedPortalHref) return `${prefix}${quote}${fixedPortalHref}${quote}`;
    if (!value || /^(?:#|mailto:|tel:|javascript:|data:)/i.test(value)) return match;

    let legacyPath = null;
    let suffix = '';
    let wasAbsolute = false;

    try {
      if (/^https?:\/\//i.test(value)) {
        const url = new URL(value);
        const isShoreVest = url.origin === SITE_ORIGIN ||
          (url.origin === 'https://shorevest.github.io' && url.pathname.startsWith('/website/'));
        if (!isShoreVest) return match;
        wasAbsolute = true;
        legacyPath = url.origin === SITE_ORIGIN
          ? url.pathname.replace(/^\//, '')
          : url.pathname.replace(/^\/website\//, '');
        suffix = `${url.search}${url.hash}`;
      } else {
        const splitAt = value.search(/[?#]/);
        const pathname = splitAt === -1 ? value : value.slice(0, splitAt);
        suffix = splitAt === -1 ? '' : value.slice(splitAt);
        if (pathname.startsWith('//')) return match;
        legacyPath = pathname.startsWith('/')
          ? pathname.replace(/^\//, '')
          : path.posix.normalize(path.posix.join(currentDir, pathname));
      }
    } catch (_) {
      return match;
    }

    if (!sourceToRoute.has(legacyPath)) return match;
    const route = sourceToRoute.get(legacyPath);
    const replacement = wasAbsolute ? `${SITE_ORIGIN}${route}${suffix}` : `${route}${suffix}`;
    return `${prefix}${quote}${replacement}${quote}`;
  });
}

function ensureBaseHref(html) {
  if (/<base\s+href=["']\/["'][^>]*>/i.test(html)) return html;
  return html.replace(/<head(\s[^>]*)?>/i, match => `${match}\n<base href="/">`);
}

function ensureNoindex(html) {
  const robotsPattern = /<meta\s+name=["']robots["'][^>]*>/i;
  const tag = '<meta name="robots" content="noindex, nofollow, noarchive">';
  if (robotsPattern.test(html)) return html.replace(robotsPattern, tag);
  return html.replace(/<\/head>/i, `  ${tag}\n</head>`);
}

function setCanonicalRoute(html, route) {
  const absolute = `${SITE_ORIGIN}${route}`;
  if (/<link\s+rel=["']canonical["'][^>]*>/i.test(html)) {
    html = html.replace(/<link\s+rel=["']canonical["'][^>]*>/i, `<link rel="canonical" href="${absolute}">`);
  } else {
    html = html.replace(/<\/head>/i, `  <link rel="canonical" href="${absolute}">\n</head>`);
  }

  if (/<meta\s+property=["']og:url["'][^>]*>/i.test(html)) {
    html = html.replace(/<meta\s+property=["']og:url["'][^>]*>/i, `<meta property="og:url" content="${absolute}">`);
  }
  return html;
}

function buildDisabledRoutePage(item) {
  const chinese = item.route.startsWith('/cn/');
  const targetAbsolute = new URL(item.redirectTarget, SITE_ORIGIN).href;
  const title = item.reason === 'media-archive-disabled'
    ? (chinese ? '媒体资料库更新中 | 新岸资本' : 'Media Archive Update | ShoreVest')
    : (chinese ? '目前暂无开放职位 | 新岸资本' : 'No Current Vacancy | ShoreVest');
  const heading = item.reason === 'media-archive-disabled'
    ? (chinese ? '更新后的媒体资料库即将上线。' : 'Updated archive coming soon.')
    : (chinese ? '目前暂无该开放职位。' : 'This role is not currently open.');
  const linkText = item.reason === 'media-archive-disabled'
    ? (chinese ? '返回媒体页面' : 'Return to Media')
    : (chinese ? '查看人才招聘页面' : 'View Careers');

  return `<!doctype html>
<html lang="${chinese ? 'zh-CN' : 'en'}">
<head>
<base href="/">
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow, noarchive">
<meta http-equiv="refresh" content="0; url=${escapeHtml(item.redirectTarget)}">
<meta name="sv-disabled-route" content="${escapeHtml(`${SITE_ORIGIN}${item.route}`)}">
<title>${escapeHtml(title)}</title>
<link rel="canonical" href="${escapeHtml(targetAbsolute)}">
<script>window.location.replace(${JSON.stringify(item.redirectTarget)});</script>
</head>
<body>
<main>
<h1>${escapeHtml(heading)}</h1>
<p><a href="${escapeHtml(item.redirectTarget)}">${escapeHtml(linkText)}</a></p>
</main>
</body>
</html>
`;
}

function isPublicTextFile(rel) {
  if (/^(internal-preview|employee-portal|docs|tests|api|services|infra|templates)\//.test(rel)) return false;
  if (/^assets\/email\//.test(rel) || /^assets\/js\/employee-portal\//.test(rel)) return false;
  if (rel === 'scripts/generate-clean-public-urls.js') return false;
  return /\.(html|js|json|xml)$/i.test(rel);
}

function writeIfChanged(rel, content) {
  const abs = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const before = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
  if (before !== content) fs.writeFileSync(abs, content);
}

function buildSitemap(routes) {
  const urls = routes
    .filter(item => item.indexable)
    .map(item => item.route)
    .filter((route, index, all) => all.indexOf(route) === index)
    .sort((a, b) => a.localeCompare(b));

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map(route => `  <url><loc>${SITE_ORIGIN}${route}</loc></url>`),
    '</urlset>',
    ''
  ].join('\n');
}

function removeEmptyParents(rel) {
  let current = path.dirname(path.join(ROOT, rel));
  while (current !== ROOT && current.startsWith(ROOT)) {
    if (!fs.existsSync(current) || fs.readdirSync(current).length > 0) break;
    fs.rmdirSync(current);
    current = path.dirname(current);
  }
}

function main() {
  let previousDestinations = [];
  if (fs.existsSync(MANIFEST_PATH)) {
    try {
      const previous = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
      previousDestinations = Array.isArray(previous.routes) ? previous.routes.map(item => item.destination).filter(Boolean) : [];
    } catch (_) {
      previousDestinations = [];
    }
  }

  const tracked = trackedFiles();
  const sourceCandidates = tracked.filter(rel => routeForSource(rel));

  const sourceToRoute = new Map();
  for (const source of sourceCandidates) {
    const route = routeForSource(source);
    if (route) sourceToRoute.set(source, route);
  }

  const grouped = new Map();
  for (const [source, route] of sourceToRoute.entries()) {
    if (!grouped.has(route)) grouped.set(route, []);
    grouped.get(route).push(source);
  }

  const primaryRoutes = [];
  for (const [route, sources] of grouped.entries()) {
    const source = choosePrimarySource(route, sources);
    const original = fs.readFileSync(path.join(ROOT, source), 'utf8');
    const disabledState = disabledRouteState(route);
    const indexable = !disabledState &&
      !/<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(original) &&
      !route.includes('/investor-portal/') &&
      route !== '/insights/china-debt-dynamics/print/';
    primaryRoutes.push({
      source,
      route,
      destination: destinationForRoute(route),
      indexable,
      disabled: !!disabledState,
      reason: disabledState ? disabledState.reason : null,
      redirectTarget: disabledState ? disabledState.redirectTarget : null
    });
  }

  const currentDestinations = new Set(primaryRoutes.map(item => item.destination));
  for (const stale of previousDestinations) {
    if (currentDestinations.has(stale)) continue;
    const staleAbs = path.join(ROOT, stale);
    if (fs.existsSync(staleAbs) && fs.statSync(staleAbs).isFile()) {
      fs.unlinkSync(staleAbs);
      removeEmptyParents(stale);
    }
  }

  const replacementPairs = buildReplacementPairs(sourceToRoute);

  for (const rel of tracked.filter(isPublicTextFile)) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) continue;
    let rewritten = fs.readFileSync(abs, 'utf8');
    if (/\.html$/i.test(rel)) rewritten = rewriteHtmlAttributes(rewritten, rel, sourceToRoute);
    rewritten = rewriteKnownUrls(rewritten, replacementPairs);
    if (/\.html$/i.test(rel)) rewritten = rewriteRuntimeUrlBases(rewritten);
    const sourceRoute = sourceToRoute.get(rel);
    if (sourceRoute && disabledRouteState(sourceRoute) && /\.html$/i.test(rel)) {
      rewritten = ensureNoindex(rewritten);
    }
    writeIfChanged(rel, rewritten);
  }

  for (const item of primaryRoutes) {
    if (item.disabled) {
      writeIfChanged(item.destination, buildDisabledRoutePage(item));
      continue;
    }

    const sourceAbs = path.join(ROOT, item.source);
    let html = fs.readFileSync(sourceAbs, 'utf8');
    html = rewriteHtmlAttributes(html, item.source, sourceToRoute);
    html = rewriteKnownUrls(html, replacementPairs);
    html = rewriteRuntimeUrlBases(html);
    html = ensureBaseHref(html);
    html = setCanonicalRoute(html, item.route);
    writeIfChanged(item.destination, html);
  }

  writeIfChanged('sitemap.xml', buildSitemap(primaryRoutes));

  const manifest = {
    generatedBy: 'scripts/generate-clean-public-urls.js',
    siteOrigin: SITE_ORIGIN,
    note: 'Legacy .html files remain for compatibility but disabled routes are noindex. Generated clean routes respect public feature flags.',
    routes: primaryRoutes.sort((a, b) => a.route.localeCompare(b.route))
  };
  writeIfChanged(path.relative(ROOT, MANIFEST_PATH), `${JSON.stringify(manifest, null, 2)}\n`);

  for (const item of primaryRoutes) {
    if (!fileExists(item.destination)) throw new Error(`Missing generated destination: ${item.destination}`);
    const html = fs.readFileSync(path.join(ROOT, item.destination), 'utf8');
    if (!/<base\s+href="\/">/i.test(html)) throw new Error(`Missing base href in ${item.destination}`);

    if (item.disabled) {
      if (!/<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(html)) {
        throw new Error(`Disabled route is indexable: ${item.destination}`);
      }
      if (!html.includes(item.redirectTarget)) throw new Error(`Disabled route target missing in ${item.destination}`);
    } else if (!html.includes(`${SITE_ORIGIN}${item.route}`)) {
      throw new Error(`Missing clean canonical URL in ${item.destination}`);
    }

    if (/new URL\(([^,\n]+),\s*location\.href\)/.test(html)) throw new Error(`Runtime URL still ignores base href in ${item.destination}`);
    const localHtmlLinks = [...html.matchAll(/(?:href|action|data-href)=["']([^"']+)["']/gi)]
      .map(match => match[1])
      .filter(value => !/^https?:\/\//i.test(value) && /\.html(?:[?#]|$)/i.test(value));
    if (localHtmlLinks.length) throw new Error(`Legacy .html link remains in ${item.destination}: ${localHtmlLinks[0]}`);
  }

  const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  if (/\.html(?:<|\?|#)/i.test(sitemap)) throw new Error('sitemap.xml still contains .html URLs');
  for (const item of primaryRoutes.filter(route => route.disabled)) {
    if (sitemap.includes(`<loc>${SITE_ORIGIN}${item.route}</loc>`)) {
      throw new Error(`Disabled route remains in sitemap: ${item.route}`);
    }
  }

  const disabledCount = primaryRoutes.filter(item => item.disabled).length;
  console.log(`Prepared ${primaryRoutes.length} clean public routes (${disabledCount} temporarily disabled).`);
}

main();
