(() => {
  const currentScriptUrl = new URL(document.currentScript?.src || 'assets/js/shared-footer.js', window.location.href);
  const siteRootUrl = new URL('../../', currentScriptUrl);
  const __svt = () => { const t = new URLSearchParams(window.location.search).get('t'); return t ? ('?t=' + encodeURIComponent(t)) : ''; };
  const siteHref = (path) => new URL(path, siteRootUrl).pathname + __svt();

  const path = window.location.pathname.split('/').pop() || 'index.html';
  const localeSuffix = /_cn\.html$/i.test(path) ? 'cn' : 'en';
  const isChinesePath = localeSuffix !== 'en';

  /* Footer brand lock-up uses a static SVG wordmark with PNG fallback. */

  const footerTemplateEn = `
  <div class="sv-footer__inner">
    <div class="sv-footer__top">
      <div>
        <a class="sv-footer__logo" href="${siteHref('index.html')}" aria-label="ShoreVest — home">
          <img src="${siteHref('assets/brand/sv-lockup-fc-light.png')}" alt="ShoreVest" width="200" height="48" />
        </a>
        <p class="sv-footer__offices">Guangzhou &middot; Shanghai &middot; Beijing &middot; Hong Kong<br /><a href="${siteHref('contact.html')}">General inquiries</a></p>
      </div>
      <nav class="sv-footer__nav" aria-label="Footer">
        <a href="${siteHref('firm.html')}">Firm</a>
        <a href="${siteHref('insights.html')}">Insights</a>
        <a href="${siteHref('strategy.html')}">Strategy</a>
        <a href="${siteHref('press.html')}">Media</a>
        <a href="${siteHref('team.html')}">Team</a>
        <a href="${siteHref('contact.html')}">Contact</a>
        <a href="${siteHref('investor-portal/index.html')}">Investor Portal</a>
        <a href="${siteHref('insights.html')}#archive">China Debt Dynamics</a>
      </nav>
    </div>
    <div class="sv-footer__legal">
      <p>ShoreVest Partners and its affiliates provide investment management services to institutional investors. This website is for informational purposes only and does not constitute an offer to sell or a solicitation of an offer to buy any security or investment product, nor investment, legal, or tax advice.</p>
      <p>Past performance is not indicative of future results. Investments in private credit and private debt involve risk, including the possible loss of principal. Figures shown are approximate and subject to change.</p>
    </div>
    <div class="sv-footer__bottom">
      <div class="sv-footer__links">
        <a href="${siteHref('privacy-policy.html')}">Privacy Policy</a>
        <a href="${siteHref('cookie-notice.html')}">Cookie Notice</a>
        <a href="${siteHref('terms-of-use.html')}">Terms of Use</a>
        <a href="${siteHref('legal-notices-disclaimers.html')}">Legal Notices &amp; Disclaimers</a>
      </div>
      <p class="sv-footer__copy">&copy; 2026 ShoreVest Partners. All rights reserved.</p>
    </div>
  </div>`;

  const footerTemplateCn = `
  <div class="sv-footer__inner">
    <div class="sv-footer__top">
      <div>
        <a class="sv-footer__logo" href="${siteHref('index_cn.html')}" aria-label="新岸资本 — 首页">
          <img src="${siteHref('assets/brand/sv-lockup-fc-light.png')}" alt="ShoreVest 新岸资本" width="200" height="48" />
        </a>
        <p class="sv-footer__offices">广州 &middot; 上海 &middot; 北京 &middot; 香港<br /><a href="${siteHref('contact_cn.html')}">一般查询</a></p>
      </div>
      <nav class="sv-footer__nav" aria-label="页脚导航">
        <a href="${siteHref('firm_cn.html')}">公司</a>
        <a href="${siteHref('insights_cn.html')}">洞察</a>
        <a href="${siteHref('strategy_cn.html')}">策略</a>
        <a href="${siteHref('press_cn.html')}">媒体</a>
        <a href="${siteHref('team_cn.html')}">团队</a>
        <a href="${siteHref('contact_cn.html')}">联系</a>
        <a href="${siteHref('investor-portal/index.html')}">投资者门户</a>
        <a href="${siteHref('insights_cn.html')}#archive">中国债务动态</a>
      </nav>
    </div>
    <div class="sv-footer__legal">
      <p>新岸资本（ShoreVest Partners）及其关联机构向机构投资者提供投资管理服务。本网站仅供参考，不构成出售要约或购买任何证券或投资产品的要约邀请，亦不构成投资、法律或税务建议。</p>
      <p>过往表现并不代表未来结果。私募信贷与私募债务投资涉及风险，包括可能损失本金。所示数据为近似值，可能发生变动。</p>
    </div>
    <div class="sv-footer__bottom">
      <div class="sv-footer__links">
        <a href="${siteHref('privacy-policy_cn.html')}">隐私政策</a>
        <a href="${siteHref('cookie-notice_cn.html')}">Cookie 通知</a>
        <a href="${siteHref('terms-of-use_cn.html')}">使用条款</a>
        <a href="${siteHref('legal-notices-disclaimers_cn.html')}">法律声明与免责声明</a>
      </div>
      <p class="sv-footer__copy">&copy; 2026 新岸资本（ShoreVest Partners）。保留所有权利。</p>
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

    /* CSS handles all font-family, letter-spacing, and colour via:
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
