(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ShoreVestRecruitmentRoleList = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var MANIFEST_PATH = 'assets/data/recruitment/roles.v1.json';
  var PUBLIC_CONFIG_PATH = 'assets/data/recruitment/public-config.json';
  var SUPPORTED_LOCALES = { en: true, 'zh-CN': true };
  var LINK_LABELS = { en: 'View role', 'zh-CN': '查看职位' };

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
      ? 'careers/' + role.slug + '_cn.html'
      : 'careers/' + role.slug + '.html';
  }

  function isSafeDetailPath(path, locale) {
    var pattern = locale === 'zh-CN'
      ? /^careers\/[a-z0-9]+(?:-[a-z0-9]+)*_cn\.html$/
      : /^careers\/[a-z0-9]+(?:-[a-z0-9]+)*\.html$/;

    return (
      typeof path === 'string' &&
      path.indexOf('://') === -1 &&
      path.indexOf('..') === -1 &&
      !/^(?:javascript|data|mailto):/i.test(path) &&
      pattern.test(path)
    );
  }

  function appendMeta(doc, row, value) {
    if (!value) return false;
    var meta = doc.createElement('p');
    meta.className = 'careers-role-row__meta';
    meta.textContent = value;
    row.appendChild(meta);
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

    var title = doc.createElement('h3');
    title.className = 'careers-role-row__title';
    title.textContent = titleText;
    row.appendChild(title);

    if (
      !appendMeta(doc, row, localized(role, 'department', locale)) ||
      !appendMeta(doc, row, cityLabel(locale)) ||
      !appendMeta(doc, row, localized(role, 'employmentType', locale)) ||
      !appendMeta(doc, row, localized(role, 'recruitmentStatus', locale))
    ) return null;

    var summary = localized(role, 'summary', locale);
    if (summary) {
      var paragraph = doc.createElement('p');
      paragraph.className = 'careers-role-row__summary';
      paragraph.textContent = summary;
      row.appendChild(paragraph);
    }

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
    MANIFEST_PATH: MANIFEST_PATH,
    PUBLIC_CONFIG_PATH: PUBLIC_CONFIG_PATH
  };
});
