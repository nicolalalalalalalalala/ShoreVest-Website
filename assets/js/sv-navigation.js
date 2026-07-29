(function () {
  var CAREERS_HREF = '/careers/';
  var SITE_CONFIG_URL = '/assets/js/site-config.js?v=20260722-public-hotfix';
  var runtimeConfig = {
    careersOpenRolesEnabled: false,
    mediaArchiveEnabled: false,
    contactFormMode: 'mailto',
    contactInquiryRecipient: 'inquiries@shorevest.com',
    mediaInquiryRecipient: 'media@shorevest.com'
  };

  // Legacy preview links propagated a `t` query parameter through every internal
  // navigation event. Reload once without it so links, analytics and shared URLs
  // remain clean for the rest of the session.
  try {
    var currentUrl = new URL(window.location.href);
    if (currentUrl.searchParams.has('t')) {
      currentUrl.searchParams.delete('t');
      window.location.replace(currentUrl.pathname + (currentUrl.search || '') + (currentUrl.hash || ''));
      return;
    }
  } catch (_) {}

  function isChinesePage() {
    return !!(document.documentElement.lang && document.documentElement.lang.toLowerCase().indexOf('zh') === 0);
  }

  function eachNode(nodes, callback) {
    Array.prototype.forEach.call(nodes || [], callback);
  }

  function loadSiteConfig(callback) {
    if (window.SHOREVEST_SITE_CONFIG) {
      runtimeConfig = window.SHOREVEST_SITE_CONFIG;
      callback(runtimeConfig);
      return;
    }

    var script = document.createElement('script');
    script.src = SITE_CONFIG_URL;
    script.async = true;
    script.onload = function () {
      runtimeConfig = window.SHOREVEST_SITE_CONFIG || runtimeConfig;
      callback(runtimeConfig);
    };
    script.onerror = function () { callback(runtimeConfig); };
    document.head.appendChild(script);
  }

  // Preserve native vertical scrolling while clipping accidental horizontal
  // overflow from full-bleed page elements.
  if (document.body && document.body.classList.contains('homepage') && !document.getElementById('sv-home-scroll-fix')) {
    var scrollFix = document.createElement('style');
    scrollFix.id = 'sv-home-scroll-fix';
    scrollFix.textContent = [
      'html,',
      'body.homepage,',
      'body.homepage * { overscroll-behavior: none !important; }',
      'body.homepage { overflow-x: clip !important; }'
    ].join('\n');
    document.head.appendChild(scrollFix);
  }

  // Keep the current desktop navigation item visibly selected after page load.
  if (document.body && document.body.classList.contains('homepage') && !document.getElementById('sv-active-nav-indicator')) {
    var activeNavStyle = document.createElement('style');
    activeNavStyle.id = 'sv-active-nav-indicator';
    activeNavStyle.textContent = [
      'body.homepage .sv-nav a[aria-current="page"]::after {',
      '  transform: scaleX(1) !important;',
      '}'
    ].join('\n');
    document.head.appendChild(activeNavStyle);
  }

  function normalizeInvestorPortalHref(href) {
    if (!href) return null;
    try {
      var url = new URL(href, document.baseURI);
      if (url.origin !== window.location.origin) return null;
      var normalizedPath = url.pathname.replace(/\/{2,}/g, '/');
      if (!/^\/(?:cn\/)?investor-portal\/index\/?$/i.test(normalizedPath)) return null;
      url.pathname = isChinesePage() ? '/cn/investor-portal/' : '/investor-portal/';
      url.searchParams.delete('t');
      return url.pathname + (url.search || '') + (url.hash || '');
    } catch (_) {
      return null;
    }
  }

  function fixInvestorPortalLinks(root) {
    var scope = root && root.querySelectorAll ? root : document;
    eachNode(scope.querySelectorAll('a[href]'), function (link) {
      var cleanHref = normalizeInvestorPortalHref(link.getAttribute('href'));
      if (cleanHref) link.setAttribute('href', cleanHref);
    });
  }

  function isCareersPage() {
    return !!(
      document.body &&
      (
        document.body.classList.contains('careers-preview-page') ||
        document.body.classList.contains('careers-role-page')
      )
    );
  }

  // Careers index pages use a root <base> tag so generated role-detail links
  // resolve correctly. Without this adjustment, bare fragment links such as
  // #open-roles resolve to the homepage instead of the current Careers page.
  function fixCareersHashLinks(root) {
    if (!isCareersPage()) return;

    var scope = root && root.querySelectorAll ? root : document;
    var links = scope.querySelectorAll('a[href^="#"]');
    var currentPath = window.location.pathname || CAREERS_HREF;

    eachNode(links, function (link) {
      var href = link.getAttribute('href');
      if (/^#[A-Za-z][A-Za-z0-9_:.-]*$/.test(href || '')) {
        link.setAttribute('href', currentPath + href);
      }
    });
  }

  function isCareersHref(href) {
    if (!href) return false;
    return /^(?:\.\.\/)?careers\.html(?:[?#].*)?$/i.test(href) ||
      /^(?:\.\.\/)?careers\/(?:[?#].*)?$/i.test(href) ||
      /^\/careers\/(?:[?#].*)?$/i.test(href) ||
      /^https:\/\/shorevest\.com\/careers(?:\.html|\/)?(?:[?#].*)?$/i.test(href) ||
      /^https:\/\/shorevest\.github\.io\/website\/careers\/(?:[?#].*)?$/i.test(href);
  }

  function cleanCareersHref(href) {
    var hashIndex = href ? href.indexOf('#') : -1;
    return CAREERS_HREF + (hashIndex >= 0 ? href.slice(hashIndex) : '');
  }

  function fixCareersLinks(root) {
    var scope = root && root.querySelectorAll ? root : document;
    eachNode(scope.querySelectorAll('a[href]'), function (link) {
      var href = link.getAttribute('href');
      if (isCareersHref(href)) {
        link.setAttribute('href', cleanCareersHref(href));
      }
    });
  }

  function isCareerRolePath(pathname) {
    return /^\/(?:cn\/)?careers\/.+/i.test(pathname) &&
      pathname !== '/careers/' && pathname !== '/cn/careers/';
  }

  function isMediaArticlePath(pathname) {
    return (/^\/media\/.+/i.test(pathname) && pathname !== '/media/') ||
      /^\/media-[^/]+\.html$/i.test(pathname);
  }

  function enforceFeatureRoutes(config) {
    var pathname = window.location.pathname.replace(/\/{2,}/g, '/');
    if (config.careersOpenRolesEnabled !== true && isCareerRolePath(pathname)) {
      window.location.replace(pathname.indexOf('/cn/') === 0 ? '/cn/careers/#open-roles' : '/careers/#open-roles');
      return true;
    }
    if (config.mediaArchiveEnabled !== true && isMediaArticlePath(pathname)) {
      window.location.replace('/media/');
      return true;
    }
    return false;
  }

  function applyMediaArchiveState(config) {
    if (config.mediaArchiveEnabled === true) return;
    var pathname = window.location.pathname.replace(/\/{2,}/g, '/');
    if (pathname !== '/media/' && pathname !== '/cn/media/' && !document.body.classList.contains('press-page')) return;

    eachNode(document.querySelectorAll('a[href="#archive"], a[href$="/media/#archive"], a[href$="/cn/media/#archive"]'), function (link) {
      link.hidden = true;
      link.setAttribute('aria-hidden', 'true');
    });

    eachNode(document.querySelectorAll('.sv-hero__panel-row'), function (row) {
      var label = row.querySelector('dt');
      if (label && /archive|档案|资料库/i.test((label.textContent || '').trim())) row.hidden = true;
    });

    var archive = document.getElementById('archive');
    if (!archive) return;
    archive.hidden = true;
    archive.setAttribute('aria-hidden', 'true');

    if (!document.getElementById('sv-media-archive-status-style')) {
      var style = document.createElement('style');
      style.id = 'sv-media-archive-status-style';
      style.textContent = [
        '.sv-media-archive-status { border-top: 1px solid rgba(0,35,37,.22); background: #f4f0e7; }',
        '.sv-media-archive-status__inner { max-width: 1440px; margin: 0 auto; padding: clamp(72px,9vw,132px) clamp(24px,5vw,80px); }',
        '.sv-media-archive-status__label { margin: 0 0 22px; font: 600 12px/1.3 var(--sv-font, sans-serif); letter-spacing: .14em; text-transform: uppercase; color: #c64832; }',
        '.sv-media-archive-status h2 { max-width: 820px; margin: 0; font: 500 clamp(38px,5vw,68px)/1 var(--sv-font, sans-serif); letter-spacing: -.035em; color: #002325; }',
        '.sv-media-archive-status p:last-child { max-width: 680px; margin: 28px 0 0; font: 400 clamp(17px,1.7vw,21px)/1.55 var(--sv-font, sans-serif); color: #294446; }'
      ].join('\n');
      document.head.appendChild(style);
    }

    var notice = document.createElement('section');
    notice.id = 'media-archive-status';
    notice.className = 'sv-media-archive-status';
    notice.setAttribute('aria-labelledby', 'media-archive-status-title');
    notice.innerHTML = isChinesePage()
      ? '<div class="sv-media-archive-status__inner"><p class="sv-media-archive-status__label">媒体资料库</p><h2 id="media-archive-status-title">更新后的媒体资料库即将上线。</h2><p>我们正在审核并更新历史媒体报道。在更新完成前，相关文章暂不公开显示。</p></div>'
      : '<div class="sv-media-archive-status__inner"><p class="sv-media-archive-status__label">Media archive</p><h2 id="media-archive-status-title">Updated archive coming soon.</h2><p>We are reviewing and updating the historical media coverage. Individual archive articles are temporarily unavailable while that work is completed.</p></div>';
    archive.parentNode.insertBefore(notice, archive);
  }

  function configureContactForm(config) {
    if (config.contactFormMode !== 'mailto') return;
    var form = document.getElementById('cp-form');
    if (!form) return;

    var button = form.querySelector('.cp-form__submit');
    var consent = form.querySelector('.cp-form__consent');
    if (button) button.innerHTML = isChinesePage() ? '打开邮件 <span aria-hidden="true">→</span>' : 'Open email <span aria-hidden="true">→</span>';
    if (consent) {
      consent.textContent = isChinesePage()
        ? '提交后将打开您的邮件应用。只有在您检查并发送邮件后，查询才会送达新岸资本。'
        : 'Submitting opens your email application. Your inquiry is not sent to ShoreVest until you review and send the email.';
    }
    form.setAttribute('data-delivery-mode', 'mailto');
  }

  document.addEventListener('submit', function (event) {
    var form = event.target;
    if (!form || form.id !== 'cp-form') return;
    if ((runtimeConfig.contactFormMode || 'mailto') !== 'mailto') return;

    event.preventDefault();
    event.stopImmediatePropagation();

    if (typeof form.reportValidity === 'function' && !form.reportValidity()) return;

    var typeField = form.querySelector('[name="inquiry_type"]');
    var nameField = form.querySelector('[name="full_name"]');
    var companyField = form.querySelector('[name="company"]');
    var emailField = form.querySelector('[name="email"]');
    var phoneField = form.querySelector('[name="phone"]');
    var messageField = form.querySelector('[name="message"]');
    var typeValue = typeField ? typeField.value : 'general';
    var typeLabel = typeField && typeField.options[typeField.selectedIndex]
      ? typeField.options[typeField.selectedIndex].text
      : typeValue;
    var fullName = nameField ? nameField.value.trim() : '';
    var recipient = typeValue === 'media'
      ? (runtimeConfig.mediaInquiryRecipient || 'media@shorevest.com')
      : (runtimeConfig.contactInquiryRecipient || 'inquiries@shorevest.com');
    var subject = isChinesePage()
      ? '新岸资本网站查询 - ' + typeLabel + (fullName ? ' - ' + fullName : '')
      : 'ShoreVest website inquiry - ' + typeLabel + (fullName ? ' - ' + fullName : '');
    var bodyLines = isChinesePage()
      ? [
          '查询类别：' + typeLabel,
          '姓名：' + fullName,
          '公司 / 机构：' + (companyField ? companyField.value.trim() : ''),
          '商务电邮：' + (emailField ? emailField.value.trim() : ''),
          '电话：' + (phoneField ? phoneField.value.trim() : ''),
          '',
          '查询摘要：',
          messageField ? messageField.value.trim() : ''
        ]
      : [
          'Inquiry type: ' + typeLabel,
          'Full name: ' + fullName,
          'Firm / institution: ' + (companyField ? companyField.value.trim() : ''),
          'Business email: ' + (emailField ? emailField.value.trim() : ''),
          'Phone: ' + (phoneField ? phoneField.value.trim() : ''),
          '',
          'Inquiry summary:',
          messageField ? messageField.value.trim() : ''
        ];

    window.location.href = 'mailto:' + recipient + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(bodyLines.join('\n'));
  }, true);

  fixCareersHashLinks(document);
  fixCareersLinks(document);
  fixInvestorPortalLinks(document);

  if (window.MutationObserver) {
    new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        eachNode(mutation.addedNodes, function (node) {
          if (node.nodeType !== 1) return;
          fixCareersHashLinks(node);
          if (node.matches && node.matches('a[href]') && isCareersHref(node.getAttribute('href'))) {
            node.setAttribute('href', cleanCareersHref(node.getAttribute('href')));
          }
          fixCareersLinks(node);
          fixInvestorPortalLinks(node);
        });
      });
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  loadSiteConfig(function (config) {
    if (enforceFeatureRoutes(config)) return;
    applyMediaArchiveState(config);
    configureContactForm(config);
  });

  function resetNavigation() {
    var burgers = document.querySelectorAll('.sv-burger');
    var menus = document.querySelectorAll('.sv-mobile-menu');
    eachNode(menus, function (menu) { menu.classList.remove('is-open'); });
    eachNode(burgers, function (burger) {
      burger.setAttribute('aria-expanded', 'false');
      if (/关闭|Close/i.test(burger.getAttribute('aria-label') || '')) {
        burger.setAttribute('aria-label', isChinesePage() ? '打开菜单' : 'Open menu');
      }
    });
  }

  document.addEventListener('click', function (event) {
    var link = event.target && event.target.closest ? event.target.closest('.sv-mobile-menu a[href]') : null;
    if (link) resetNavigation();
  }, true);

  window.addEventListener('pagehide', resetNavigation);
  window.addEventListener('pageshow', resetNavigation);
  window.addEventListener('resize', function () {
    if (window.matchMedia && window.matchMedia('(min-width: 981px)').matches) resetNavigation();
  });
})();
