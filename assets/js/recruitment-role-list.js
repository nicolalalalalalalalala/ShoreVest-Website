(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ShoreVestRecruitmentRoleList = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var MANIFEST_PATH = 'assets/data/recruitment/roles.v1.json';
  var PUBLIC_CONFIG_PATH = 'assets/data/recruitment/public-config.json';
  var STYLESHEET_PATH = '/assets/css/careers-open-roles.css?v=20260809-open-roles-refine';
  var SUPPORTED_LOCALES = { en: true, 'zh-CN': true };
  var LINK_LABELS = { en: 'View role', 'zh-CN': '查看职位' };
  var STATUS_LABELS = { en: 'Rolling', 'zh-CN': '长期招聘' };

  function cityLabel(locale) {
    return locale === 'zh-CN' ? '广州' : 'Guangzhou';
  }

  function getLocale(doc) {
    var lang = doc && doc.documentElement ? doc.documentElement.lang : '';
    return SUPPORTED_LOCALES[lang] ? lang : null;
  }

  function localized(role, field, locale) {
    return role && role[field] && typeof role[field][locale] === 'string'
      ? role[field][locale]
      : '';
  }

  function detailPath(role, locale) {
    return locale === 'zh-CN'
      ? '/cn/careers/' + role.slug + '/'
      : '/careers/' + role.slug + '/';
  }

  function isSafeDetailPath(path, locale) {
    var pattern = locale === 'zh-CN'
      ? /^\/cn\/careers\/[a-z0-9]+(?:-[a-z0-9]+)*\/$/
      : /^\/careers\/[a-z0-9]+(?:-[a-z0-9]+)*\/$/;

    return (
      typeof path === 'string' &&
      path.indexOf('://') === -1 &&
      path.indexOf('..') === -1 &&
      !/^(?:javascript|data|mailto):/i.test(path) &&
      pattern.test(path)
    );
  }

  function ensureStylesheet(doc) {
    if (!doc || !doc.head || doc.querySelector('link[data-sv-open-roles-style="true"]')) return;
    var link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = STYLESHEET_PATH;
    link.setAttribute('data-sv-open-roles-style', 'true');
    doc.head.appendChild(link);
  }

  function formatPostedDate(value, locale) {
    var match = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
    if (!match) return '';

    var year = Number(match[1]);
    var month = Number(match[2]);
    var day = Number(match[3]);
    if (!year || month < 1 || month > 12 || day < 1 || day > 31) return '';

    if (locale === 'zh-CN') return '发布于 ' + year + '年' + month + '月' + day + '日';

    var months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return 'Posted ' + months[month - 1] + ' ' + day + ', ' + year;
  }

  function appendMeta(doc, parent, value) {
    if (!value) return false;
    var meta = doc.createElement('span');
    meta.className = 'careers-role-row__meta';
    meta.textContent = value;
    parent.appendChild(meta);
    return true;
  }

  function buildRoleRow(doc, role, locale) {
    if (!role || role.status !== 'published') return null;

    var path = detailPath(role, locale);
    if (!isSafeDetailPath(path, locale)) return null;

    var titleText = localized(role, 'title', locale);
    if (!titleText) return null;

    var row = doc.createElement('div');
    row.className = 'careers-role-row';

    var content = doc.createElement('div');
    content.className = 'careers-role-row__content';

    var title = doc.createElement('h3');
    title.className = 'careers-role-row__title';
    title.textContent = titleText;
    content.appendChild(title);

    var details = doc.createElement('div');
    details.className = 'careers-role-row__details';
    if (
      !appendMeta(doc, details, cityLabel(locale)) ||
      !appendMeta(doc, details, localized(role, 'employmentType', locale)) ||
      !appendMeta(doc, details, STATUS_LABELS[locale]) ||
      !appendMeta(doc, details, formatPostedDate(role.datePosted, locale))
    ) return null;
    content.appendChild(details);

    var summary = localized(role, 'summary', locale);
    if (summary) {
      var paragraph = doc.createElement('p');
      paragraph.className = 'careers-role-row__summary';
      paragraph.textContent = summary;
      content.appendChild(paragraph);
    }

    row.appendChild(content);

    var link = doc.createElement('a');
    link.className = 'careers-role-row__link';
    link.href = path;
    link.textContent = LINK_LABELS[locale];
    row.appendChild(link);

    return row;
  }

  function renderRolesFromManifest(doc, manifest, options) {
    options = options || {};
    var container = doc.querySelector('[data-role-list="open-roles"]');
    var locale = options.locale || getLocale(doc);
    var enabled = options.featureEnabled === true;

    if (!container || !locale || !enabled || !manifest || !Array.isArray(manifest.roles)) {
      return 0;
    }

    var rows = manifest.roles
      .slice()
      .sort(function (a, b) {
        return (a.displayOrder || 999) - (b.displayOrder || 999);
      })
      .map(function (role) {
        return buildRoleRow(doc, role, locale);
      })
      .filter(Boolean);

    if (!rows.length) return 0;
    container.replaceChildren.apply(container, rows);
    return rows.length;
  }

  function json(win, path) {
    return win.fetch(path, { credentials: 'same-origin', cache: 'no-store' }).then(function (response) {
      if (!response || !response.ok) throw new Error('Recruitment data unavailable');
      return response.json();
    });
  }

  function initRoleList(win) {
    var doc = win.document;
    if (!doc || !doc.querySelector('[data-role-list="open-roles"]') || typeof win.fetch !== 'function') {
      return Promise.resolve(0);
    }

    ensureStylesheet(doc);

    return json(win, PUBLIC_CONFIG_PATH)
      .then(function (publicConfig) {
        if (!publicConfig || publicConfig.openRolesEnabled !== true) return 0;
        return json(win, MANIFEST_PATH).then(function (manifest) {
          return renderRolesFromManifest(doc, manifest, { featureEnabled: true });
        });
      })
      .catch(function () {
        return 0;
      });
  }

  if (typeof window !== 'undefined' && window.document) initRoleList(window);

  return {
    initRoleList: initRoleList,
    renderRolesFromManifest: renderRolesFromManifest,
    isSafeDetailPath: isSafeDetailPath,
    formatPostedDate: formatPostedDate,
    MANIFEST_PATH: MANIFEST_PATH,
    PUBLIC_CONFIG_PATH: PUBLIC_CONFIG_PATH,
    STYLESHEET_PATH: STYLESHEET_PATH
  };
});
