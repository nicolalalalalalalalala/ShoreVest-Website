(() => {
  const currentScriptUrl = new URL(document.currentScript?.src || 'assets/js/shared-footer.js', window.location.href);
  const siteRootUrl = new URL('../../', currentScriptUrl);
  const __svt = () => { const t = new URLSearchParams(window.location.search).get('t'); return t ? ('?t=' + encodeURIComponent(t)) : ''; };
  const relativeSiteHref = (path) => {
    const target = new URL(path, siteRootUrl);
    const fromDir = window.location.pathname.endsWith('/')
      ? window.location.pathname
      : window.location.pathname.replace(/[^/]*$/, '');
    const fromParts = fromDir.split('/').filter(Boolean);
    const toParts = target.pathname.split('/').filter(Boolean);
    while (fromParts.length && toParts.length && fromParts[0] === toParts[0]) {
      fromParts.shift();
      toParts.shift();
    }
    const rel = `${'../'.repeat(fromParts.length)}${toParts.join('/')}`;
    return (rel || './') + __svt();
  };
  const siteHref = relativeSiteHref;

  const path = window.location.pathname.split('/').pop() || '/';
  const localeSuffix = /_cn\.html$/i.test(path) ? 'cn' : 'en';
  const isChinesePath = localeSuffix !== 'en';

  /* Single reversible source flag: whether ShoreVest One (the internal
     demonstration environment) is surfaced on the public website. Hidden in
     Phase 2B. When re-enabled, the footer "Access" group includes it again. */
  const siteConfig = window.SHOREVEST_SITE_CONFIG || {};
  const showShoreVestOne = siteConfig.showShoreVestOnePublicLink === true;
  const shoreVestOneLinkEn = showShoreVestOne
    ? `\n          <a href="${siteHref('employee-portal/')}" target="_blank" rel="noopener">ShoreVest One</a>` : '';
  const shoreVestOneLinkCn = showShoreVestOne
    ? `\n          <a href="${siteHref('employee-portal/')}" target="_blank" rel="noopener">ShoreVest One</a>` : '';

  /* Footer brand lock-up uses a static SVG wordmark with PNG fallback. */

  const footerTemplateEn = `
  <div class="sv-footer__inner">
    <div class="sv-footer__top">
      <div>
        <a class="sv-footer__logo" href="${siteHref('/')}" aria-label="ShoreVest — home">
          <img src="${siteHref('assets/brand/sv-lockup-fc-light.png')}" alt="ShoreVest" width="200" height="48"  loading="eager" decoding="async" fetchpriority="high" />
        </a>
        <p class="sv-footer__offices">Guangzhou ,  Shanghai ,  Beijing ,  Hong Kong<br /><a href="${siteHref('/contact/')}">General inquiries</a></p>
      </div>
      <nav class="sv-footer__nav" aria-label="Footer">
        <a href="${siteHref('/firm/')}">Firm</a>
        <a href="${siteHref('/strategy/')}">Strategy</a>
        <a href="${siteHref('/insights/')}">Insights</a>
        <a href="${siteHref('/media/')}">Media</a>
        <a href="${siteHref('/team/')}">Team</a>
        <a href="${siteHref('careers/')}">Careers</a>
        <a href="${siteHref('/contact/')}">Contact</a>
        <a href="${siteHref('/insights/')}#archive">China Debt Dynamics</a>
        <span class="sv-footer__access" role="group" aria-label="Access">
          <span class="sv-footer__access-label">Access</span>
          <a href="${siteHref('/investor-portal/')}">Investor Portal</a>${shoreVestOneLinkEn}
        </span>
      </nav>
      <div class="sv-footer__social" aria-label="Follow ShoreVest">
        <a class="sv-footer__social-link" href="https://www.linkedin.com/company/shorevest-partners/" target="_blank" rel="noopener noreferrer" aria-label="Follow ShoreVest Partners on LinkedIn">
          <svg class="sv-footer__social-icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24">
            <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.34V8.98h3.42v1.57h.05c.48-.9 1.64-1.85 3.37-1.85 3.61 0 4.27 2.37 4.27 5.46v6.29ZM5.32 7.42a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12Zm1.78 13.03H3.54V8.98H7.1v11.47ZM22.23 0H1.76C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.76 24h20.47c.97 0 1.77-.77 1.77-1.72V1.72C24 .77 23.2 0 22.23 0Z"/>
          </svg>
          <span>LinkedIn</span>
        </a>
      </div>
    </div>
    <div class="sv-footer__legal">
      <p>ShoreVest Partners and its affiliates provide investment management services to institutional investors. This website is for informational purposes only and does not constitute an offer to sell or a solicitation of an offer to buy any security or investment product, nor investment, legal, or tax advice.</p>
      <p>Past performance is not indicative of future results. Investments in private credit and private debt involve risk, including the possible loss of principal. Figures shown are approximate and subject to change.</p>
    </div>
    <div class="sv-footer__bottom">
      <div class="sv-footer__links">
        <a href="${siteHref('/privacy-policy/')}">Privacy Policy</a>
        <a href="${siteHref('/cookie-notice/')}">Cookie Notice</a>
        <a href="${siteHref('/terms-of-use/')}">Terms of Use</a>
        <a href="${siteHref('/important-information/')}">Important Information</a>
        <a href="${siteHref('/legal-notices-disclaimers/')}">Legal Notices &amp; Disclaimers</a>
      </div>
      <p class="sv-footer__copy">&copy; 2026 ShoreVest Partners. All rights reserved.</p>
    </div>
  </div>`;

  const footerTemplateCn = `
  <div class="sv-footer__inner">
    <div class="sv-footer__top">
      <div>
        <a class="sv-footer__logo" href="${siteHref('/cn/')}" aria-label="新岸资本 — 首页">
          <img src="${siteHref('assets/brand/sv-lockup-fc-light.png')}" alt="ShoreVest 新岸资本" width="200" height="48"  loading="eager" decoding="async" fetchpriority="high" />
        </a>
        <p class="sv-footer__offices">广州 ,  上海 ,  北京 ,  香港<br /><a href="${siteHref('/cn/contact/')}">一般查询</a></p>
      </div>
      <nav class="sv-footer__nav" aria-label="页脚导航">
        <a href="${siteHref('/cn/firm/')}">公司</a>
        <a href="${siteHref('/cn/insights/')}">洞察</a>
        <a href="${siteHref('/cn/strategy/')}">策略</a>
        <a href="${siteHref('/cn/media/')}">媒体</a>
        <a href="${siteHref('/cn/team/')}">团队</a>
        <a href="${siteHref('/cn/careers/')}">人才招聘</a>
        <a href="${siteHref('/cn/contact/')}">联系</a>
        <a href="${siteHref('/cn/insights/')}#archive">中国债务动态</a>
        <span class="sv-footer__access" role="group" aria-label="访问">
          <span class="sv-footer__access-label">访问</span>
          <a href="${siteHref('/investor-portal/index/')}">投资者门户</a>${shoreVestOneLinkCn}
        </span>
      </nav>
      <div class="sv-footer__social" aria-label="Follow ShoreVest">
        <a class="sv-footer__social-link" href="https://www.linkedin.com/company/shorevest-partners/" target="_blank" rel="noopener noreferrer" aria-label="Follow ShoreVest Partners on LinkedIn">
          <svg class="sv-footer__social-icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24">
            <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.34V8.98h3.42v1.57h.05c.48-.9 1.64-1.85 3.37-1.85 3.61 0 4.27 2.37 4.27 5.46v6.29ZM5.32 7.42a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12Zm1.78 13.03H3.54V8.98H7.1v11.47ZM22.23 0H1.76C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.76 24h20.47c.97 0 1.77-.77 1.77-1.72V1.72C24 .77 23.2 0 22.23 0Z"/>
          </svg>
          <span>LinkedIn</span>
        </a>
      </div>
    </div>
    <div class="sv-footer__legal">
      <p>新岸资本（ShoreVest Partners）及其关联机构向机构投资者提供投资管理服务。本网站仅供参考，不构成出售要约或购买任何证券或投资产品的要约邀请，亦不构成投资、法律或税务建议。</p>
      <p>过往表现并不代表未来结果。私募信贷与私募债务投资涉及风险，包括可能损失本金。所示数据为近似值，可能发生变动。</p>
    </div>
    <div class="sv-footer__bottom">
      <div class="sv-footer__links">
        <a href="${siteHref('/cn/privacy-policy/')}">隐私政策</a>
        <a href="${siteHref('/cn/cookie-notice/')}">Cookie 通知</a>
        <a href="${siteHref('/cn/terms-of-use/')}">使用条款</a>
        <a href="${siteHref('/cn/important-information/')}">重要信息</a>
        <a href="${siteHref('/cn/legal-notices-disclaimers/')}">法律声明与免责声明</a>
      </div>
      <p class="sv-footer__copy">&copy; 2026 ShoreVest Partners. All rights reserved.</p>
    </div>
  </div>`;

  /* Ensure Noto Serif SC is loaded for Chinese footer content.
     DIN 2014 is a commercial font served via CSS font-face on the host;
     no Google Fonts URL is needed for it. */
  const ensureChineseFonts = () => {
    if (document.getElementById('sv-footer-cn-fonts')) return;
    const link = document.createElement('link');
    link.id = 'sv-footer-cn-fonts';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;500;700&display=swap';
    document.head.appendChild(link);
  };

  const mountFooter = (node) => {
    node.className = `sv-footer ${isChinesePath ? 'sv-footer--cn' : 'sv-footer--en'}`;
    node.innerHTML = localeSuffix === 'cn' ? footerTemplateCn : footerTemplateEn;

    /* CSS handles all font-family, letter-spacing, and color via:
         shared-footer.css  (highest specificity footer rules)
         shorevest-typography-system.css  (canonical role system)
       No inline style overrides are applied here so that the CSS
       system remains the authoritative source of truth. */

    if (isChinesePath) {
      ensureChineseFonts();
    }

    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    void isMobile;

  };
  const installBackToTop = () => {
    if (document.querySelector('.back-to-top, .sv-back-to-top')) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const button = document.createElement('button');
    button.className = 'sv-back-to-top back-to-top';
    button.type = 'button';
    button.setAttribute('aria-label', 'Back to top');
    button.innerHTML = `
      <svg class="back-to-top__icon" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
        <path d="M9 14V4.75M4.75 9 9 4.75 13.25 9" />
      </svg>
    `;

    let footerInView = false;
    const toggleVisibility = () => {
      const shouldShow = window.scrollY > 500 && !footerInView;
      button.classList.toggle('is-visible', shouldShow);
    };

    button.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    });

    document.body.appendChild(button);
    toggleVisibility();
    window.addEventListener('scroll', toggleVisibility, { passive: true });

    const footer = document.querySelector('.sv-footer, footer');
    if (!footer || !('IntersectionObserver' in window)) return;

    const footerObserver = new IntersectionObserver((entries) => {
      footerInView = entries.some((entry) => entry.isIntersecting);
      toggleVisibility();
    }, { rootMargin: '0px 0px 56px 0px', threshold: 0.01 });

    footerObserver.observe(footer);
  };


  document.querySelectorAll('footer.sv-footer, footer[data-shared-footer]').forEach(mountFooter);
  installBackToTop();
})();
