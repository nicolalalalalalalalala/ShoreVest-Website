(async () => {
  document.body.dataset.cddReady = 'false';

  const query = new URLSearchParams(window.location.search);
  const sourceFromQuery = query.get('source') || query.get('src');
  const source = sourceFromQuery || document.body.dataset.articleSource || document.body.dataset.defaultArticleSource;
  if (!source) return;

  let data;
  try {
    const response = await fetch(source);
    if (!response.ok) throw new Error('Unable to load article content.');
    data = await response.json();
  } catch (error) {
    data = await buildArchiveFallback(source, error);
  }

  const meta = document.querySelector('[data-cdd-meta]');
  const title = document.querySelector('[data-cdd-title]');
  const dek = document.querySelector('[data-cdd-dek]');
  const body = document.querySelector('[data-cdd-body]');
  const findings = document.querySelector('[data-cdd-findings]');
  const disclaimer = document.querySelector('[data-cdd-disclaimer]');
  const copyright = document.querySelector('[data-cdd-copyright]');

  if (!meta || !title || !dek || !body || !findings || !disclaimer || !copyright) return;

  const isPrint = document.body.classList.contains('cdd-print-layout');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wordCount = (data.sections || []).reduce((n, s) => {
    let w = 0;
    (s.paragraphs || []).forEach((p) => { w += String(p).trim().split(/\s+/).filter(Boolean).length; });
    (s.bullets || []).forEach((b) => { w += String(b).trim().split(/\s+/).filter(Boolean).length; });
    return n + w;
  }, 0);
  const readMins = Math.max(1, Math.round(wordCount / 220));
  const findingCount = (data.keyFindings || []).length;

  if (isPrint) {
    meta.innerHTML = `<span>${data.series}</span><span>${data.volumeIssue}</span><span>Published ${data.published}</span><span>${data.edition}</span>`;
  } else {
    const bits = [`Published ${data.published}`, `${readMins} min read`];
    if (findingCount) bits.push(`${findingCount} key finding${findingCount > 1 ? 's' : ''}`);
    meta.innerHTML = bits.map((b) => `<span>${b}</span>`).join('');
  }
  title.textContent = data.title;
  dek.textContent = data.dek;
  document.title = `${data.title} | ShoreVest`;

  const pdfHref = typeof data.pdf === 'string' ? data.pdf.trim() : '';
  const pdfLink = document.querySelector('.cdd-actions a[href*="china-debt-dynamics-print"]');
  if (pdfHref && pdfLink) {
    pdfLink.href = pdfHref;
  }

  (data.sections || []).forEach((section) => {
    if (section.heading) {
      const h2 = document.createElement('h2');
      h2.textContent = section.heading;
      body.appendChild(h2);
    }

    (section.paragraphs || []).forEach((paragraph) => {
      const p = document.createElement('p');
      p.textContent = paragraph;
      body.appendChild(p);
    });

    if (section.bullets?.length) {
      const ul = document.createElement('ul');
      section.bullets.forEach((item) => {
        const li = document.createElement('li');
        li.textContent = item;
        ul.appendChild(li);
      });
      body.appendChild(ul);
    }
  });

  findings.innerHTML = '';
  (data.keyFindings || []).forEach((finding) => {
    const li = document.createElement('li');
    li.textContent = finding;
    findings.appendChild(li);
  });

  if (!data.keyFindings?.length) {
    // Hide just the Key Findings list + its heading; keep the rail so a contents
    // TOC can still populate. enhanceScreenLayout() collapses the rail entirely
    // only when there is also no TOC (single-section articles).
    findings.hidden = true;
    const sc = findings.closest('.cdd-sidecard');
    const h3 = sc && sc.querySelector('h3');
    if (h3) h3.hidden = true;
    const findingsRow = findings.closest('.cdd-findings-row');
    if (findingsRow) findingsRow.hidden = true;
  }

  disclaimer.textContent = data.disclaimer;
  copyright.textContent = data.copyright;

  if (!isPrint) enhanceScreenLayout();

  document.querySelectorAll('[data-print-action="print"]').forEach((button) => {
    button.addEventListener('click', () => window.print());
  });


  installShareActions();

  const shouldAutoPrint =
    document.body.dataset.autoPrint === 'true' ||
    query.get('pdf') === '1';

  document.body.dataset.cddReady = 'true';

  if (!shouldAutoPrint) {
    installBackToTop();
  }

  if (shouldAutoPrint) {
    requestAnimationFrame(() => {
      setTimeout(() => window.print(), 120);
    });
  }


  async function buildArchiveFallback(source, error) {
    const pageName = (window.location.pathname.split('/').pop() || '').replace(/-print\.html$/, '.html');
    const pdfLink = document.querySelector('.cdd-actions a[href*="china-debt-dynamics-print"]');
    const archive = await findArchiveRecord(pageName);
    const titleText = archive.title || document.title.replace(/\s*\|\s*ShoreVest\s*$/, '') || 'China Debt Dynamics';
    const published = archive.date || '';
    const issue = archive.issue || (source && source.match(/v(\d+)i(\d+)/i) ? `Volume ${RegExp.$1} | Issue ${RegExp.$2}` : 'China Debt Dynamics');
    const directPdf = archive.pdf || '';
    if (pdfLink && directPdf) {
      pdfLink.href = directPdf;
    }
    console.warn('CDD article JSON unavailable; rendering archive fallback.', error);
    return {
      series: 'China Debt Dynamics',
      volumeIssue: issue,
      published,
      edition: archive.category ? `${archive.category} Edition` : 'ShoreVest Insights',
      title: titleText,
      dek: archive.excerpt || 'Read the latest China Debt Dynamics issue from ShoreVest.',
      keyFindings: [],
      sections: [
        {
          heading: 'Issue available as PDF',
          paragraphs: [
            'The HTML article data for this issue is temporarily unavailable, so this page is showing the issue summary and direct publication link instead of a blank article.',
            directPdf ? `Open the PDF for the complete issue: ${directPdf}` : 'Use the PDF button above to open the complete issue.'
          ]
        }
      ],
      disclaimer: 'This material is for informational purposes only and does not constitute an offer to sell or a solicitation of an offer to buy any security or investment product, nor investment, legal, or tax advice.',
      copyright: '© 2026 ShoreVest Partners. All rights reserved.'
    };
  }

  async function findArchiveRecord(pageName) {
    const row = Array.from(document.querySelectorAll('.cdd-arc__row')).find((item) => {
      const href = item.dataset.href || item.querySelector('.cdd-arc__read')?.getAttribute('href') || '';
      return href.split('?')[0].split('/').pop() === pageName;
    });
    if (row) return readArchiveRow(row);

    const archiveMarkup = document.getElementById('cdd-archive-data');
    if (archiveMarkup) {
      const doc = new DOMParser().parseFromString(archiveMarkup.textContent, 'text/html');
      const match = Array.from(doc.querySelectorAll('.cdd-arc__row')).find((item) => {
        const href = item.dataset.href || item.querySelector('.cdd-arc__read')?.getAttribute('href') || '';
        return href.split('?')[0].split('/').pop() === pageName;
      });
      if (match) return readArchiveRow(match);
    }

    try {
      const response = await fetch('insights.html');
      if (response.ok) {
        const markup = await response.text();
        const doc = new DOMParser().parseFromString(markup, 'text/html');
        const match = Array.from(doc.querySelectorAll('.cdd-arc__row')).find((item) => {
          const href = item.dataset.href || item.querySelector('.cdd-arc__read')?.getAttribute('href') || '';
          return href.split('?')[0].split('/').pop() === pageName;
        });
        if (match) return readArchiveRow(match);
      }
    } catch (error) {
      console.warn('CDD archive fallback unavailable.', error);
    }

    return {};
  }

  function readArchiveRow(row) {
    return {
      issue: row.querySelector('.cdd-arc__chip-issue')?.textContent.trim() || '',
      date: row.querySelector('.cdd-arc__date')?.textContent.trim() || '',
      category: row.querySelector('.cdd-arc__cat')?.textContent.trim() || '',
      title: row.querySelector('.cdd-arc__row-title')?.textContent.trim() || '',
      excerpt: row.querySelector('.cdd-arc__excerpt')?.textContent.trim() || '',
      pdf: row.querySelector('.cdd-arc__pdf')?.getAttribute('href') || ''
    };
  }

  function enhanceScreenLayout() {
    // Strip the generic site-hero classes so the template CSS governs the intro.
    const intro = document.querySelector('.cdd-intro');
    if (intro) intro.classList.remove('sv-hero', 'sv-hero--gradient');
    document
      .querySelectorAll('.cdd-intro .sv-hero__inner, .cdd-intro .sv-hero__grid, .cdd-intro .sv-hero__left, .cdd-intro .sv-hero__title, .cdd-intro .sv-hero__body')
      .forEach((el) => el.classList.remove('sv-hero__inner', 'sv-hero__grid', 'sv-hero__left', 'sv-hero__title', 'sv-hero__body'));

    // Publication nameplate.
    const tl = document.querySelector('.cdd-topline__inner');
    if (tl && !tl.querySelector('.cdd-nameplate')) {
      const existingLockup = tl.querySelector('.cdd-lockup');
      const lockupText = existingLockup ? existingLockup.textContent.trim() : '\u65b0\u5cb8\u8cc7\u672c \u00b7 \u4e2d\u570b\u50b5\u52d9\u52d5\u614b';
      tl.innerHTML = '';
      const np = document.createElement('div');
      np.className = 'cdd-nameplate';
      const kicker = document.createElement('p');
      kicker.className = 'cdd-nameplate__kicker';
      kicker.textContent = 'ShoreVest Insights Publication';
      const series = document.createElement('p');
      series.className = 'cdd-nameplate__series';
      series.textContent = data.series || 'China Debt Dynamics';
      np.append(kicker, series);
      const right = document.createElement('div');
      right.className = 'cdd-nameplate__right';
      const lk = document.createElement('span');
      lk.className = 'cdd-nameplate__lockup';
      lk.setAttribute('lang', 'zh-Hant');
      lk.textContent = lockupText;
      const iss = document.createElement('span');
      iss.className = 'cdd-nameplate__issue';
      iss.textContent = String(data.volumeIssue || '').replace(/\s*\|\s*/g, ' \u00b7 ');
      right.append(lk, iss);
      tl.append(np, right);
    }

    // Edition kicker above the title.
    if (data.edition && !document.querySelector('.cdd-edition-kicker')) {
      const k = document.createElement('p');
      k.className = 'cdd-edition-kicker';
      k.textContent = data.edition;
      title.parentNode.insertBefore(k, title);
    }

    // Drop cap on the opening paragraph (wrap the first letter for reliable
    // rendering across browsers, print, and capture tools).
    const firstP = body.querySelector('p');
    if (firstP && firstP.firstChild && firstP.firstChild.nodeType === 3) {
      const node = firstP.firstChild;
      const txt = node.nodeValue;
      const idx = txt.search(/\S/);
      if (idx > -1 && /[A-Za-z0-9]/.test(txt[idx])) {
        const letter = txt[idx];
        const rest = txt.slice(idx + 1);
        node.nodeValue = txt.slice(0, idx);
        const span = document.createElement('span');
        span.className = 'cdd-dropcap__letter';
        span.textContent = letter;
        firstP.insertBefore(document.createTextNode(rest), node.nextSibling);
        firstP.insertBefore(span, node.nextSibling);
        firstP.classList.add('cdd-dropcap');
      }
    }

    // Contents rail (only when there are multiple sections to navigate).
    const heads = Array.from(body.querySelectorAll('h2'));
    if (heads.length >= 2) {
      heads.forEach((h, i) => { if (!h.id) h.id = 'cdd-sec-' + (i + 1); });
      const side = findings.closest('.cdd-sidecard');
      if (side) {
        const toc = document.createElement('nav');
        toc.className = 'cdd-toc';
        toc.setAttribute('aria-label', 'Contents');
        const lbl = document.createElement('p');
        lbl.className = 'cdd-toc__label';
        lbl.textContent = 'In this issue';
        const ol = document.createElement('ol');
        ol.className = 'cdd-toc__list';
        const links = [];
        heads.forEach((h) => {
          const li = document.createElement('li');
          li.className = 'cdd-toc__item';
          const a = document.createElement('a');
          a.className = 'cdd-toc__link';
          a.href = '#' + h.id;
          const span = document.createElement('span');
          span.textContent = h.textContent;
          a.appendChild(span);
          a.addEventListener('click', (e) => {
            e.preventDefault();
            const target = document.getElementById(h.id);
            if (!target) return;
            const offset = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--cdd-sticky-top'), 10) || 130;
            const y = target.getBoundingClientRect().top + window.scrollY - offset;
            window.scrollTo({ top: y, behavior: reduceMotion ? 'auto' : 'smooth' });
            history.replaceState(null, '', '#' + h.id);
          });
          li.appendChild(a);
          ol.appendChild(li);
          links.push(a);
        });
        toc.append(lbl, ol);
        side.insertBefore(toc, side.firstChild);
        installScrollSpy(heads, links);
      }
    }

    installProgressBar();
    enhancePdfButton();
    // installFloatingRail();  // disabled — the rail's scroll-parallax drift felt
    // uncomfortable. The rail stays put; scroll-spy still tracks the section in view.
    collapseRailIfEmpty();
  }

  function collapseRailIfEmpty() {
    const rail = findings.closest('.cdd-sidecard');
    const grid = document.querySelector('.cdd-reading-grid');
    if (rail && !rail.querySelector('.cdd-toc') && (!data.keyFindings || !data.keyFindings.length)) {
      rail.hidden = true;
      if (grid) grid.classList.add('cdd-reading-grid--solo');
    }
  }

  function enhancePdfButton() {
    const pdf = document.querySelector('.cdd-actions a[href*="china-debt-dynamics-print"]');
    if (!pdf || pdf.querySelector('.cdd-btn__icon')) return;
    pdf.classList.add('cdd-btn--pdf');
    const label = pdf.textContent.trim() || 'PDF';
    pdf.innerHTML =
      '<svg class="cdd-btn__icon" viewBox="0 0 16 16" aria-hidden="true">' +
      '<path class="cdd-btn__icon-arrow" d="M8 2.5 V9.5 M5 7 l3 3 3-3"/>' +
      '<path d="M2.6 11.4 V12.4 a1 1 0 0 0 1 1 h8.8 a1 1 0 0 0 1-1 V11.4"/>' +
      '</svg><span>Download ' + label + '</span>';
    pdf.setAttribute('aria-label', 'Download this issue as PDF');
  }

  function installFloatingRail() {
    const grid = document.querySelector('.cdd-reading-grid');
    const rail = document.querySelector('.cdd-sidecard');
    if (!grid || !rail) return;
    const desktop = window.matchMedia('(min-width: 1000px)');
    let current = 0, target = 0, raf = null, lastY = window.scrollY;

    const reset = () => { rail.style.transform = ''; current = 0; target = 0; };

    const onScroll = () => {
      const y = window.scrollY;
      // Lag the rail by a fraction of scroll velocity, clamped — a gentle float.
      const v = y - lastY;
      lastY = y;
      target = Math.max(-16, Math.min(16, target + v * 0.28));
      if (!raf) raf = requestAnimationFrame(tick);
    };

    function tick() {
      target *= 0.86;                 // decay back toward rest
      current += (target - current) * 0.12;
      if (Math.abs(current) < 0.05 && Math.abs(target) < 0.05) {
        current = 0; rail.style.transform = 'translate3d(0,0,0)'; raf = null; return;
      }
      rail.style.transform = 'translate3d(0,' + current.toFixed(2) + 'px,0)';
      raf = requestAnimationFrame(tick);
    }

    const enable = () => {
      if (desktop.matches && !reduceMotion) {
        lastY = window.scrollY;
        window.addEventListener('scroll', onScroll, { passive: true });
      } else {
        window.removeEventListener('scroll', onScroll);
        if (raf) { cancelAnimationFrame(raf); raf = null; }
        reset();
      }
    };
    enable();
    if (desktop.addEventListener) desktop.addEventListener('change', enable);
  }

  function installScrollSpy(heads, links) {
    if (!('IntersectionObserver' in window)) return;
    const map = new Map();
    heads.forEach((h, i) => map.set(h, links[i]));
    let current = null;
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          if (current) current.classList.remove('is-active');
          current = map.get(entry.target);
          if (current) current.classList.add('is-active');
        }
      });
    }, { rootMargin: '-30% 0px -60% 0px', threshold: 0 });
    heads.forEach((h) => obs.observe(h));
  }

  function installProgressBar() {
    if (document.querySelector('.cdd-progress')) return;
    const bar = document.createElement('div');
    bar.className = 'cdd-progress';
    const fill = document.createElement('div');
    fill.className = 'cdd-progress__fill';
    bar.appendChild(fill);
    document.body.appendChild(bar);
    let ticking = false;
    const update = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      const pct = max > 0 ? Math.min(100, Math.max(0, (window.scrollY / max) * 100)) : 0;
      fill.style.width = pct + '%';
      ticking = false;
    };
    window.addEventListener('scroll', () => {
      if (!ticking) { requestAnimationFrame(update); ticking = true; }
    }, { passive: true });
    update();
  }

  function installShareActions() {
    const actions = document.querySelector('.cdd-actions');
    if (!actions || actions.querySelector('[data-cdd-share-toggle]')) return;

    const shareWrap = document.createElement('div');
    shareWrap.className = 'cdd-share';

    const shareButton = document.createElement('button');
    shareButton.type = 'button';
    shareButton.className = 'cdd-btn';
    shareButton.textContent = 'Share';
    shareButton.setAttribute('data-cdd-share-toggle', 'true');
    shareButton.setAttribute('data-share-toggle', 'true');
    shareButton.setAttribute('aria-haspopup', 'menu');
    shareButton.setAttribute('aria-expanded', 'false');

    const shareMenu = document.createElement('div');
    shareMenu.className = 'cdd-share__menu';
    shareMenu.setAttribute('data-cdd-share-menu', 'true');

    const shareOptions = [
      {
        label: 'LinkedIn',
        action: () => {
          const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(window.location.href)}`;
          window.open(url, '_blank', 'noopener,noreferrer,width=640,height=520');
        },
      },
      {
        label: 'X / Twitter',
        action: () => {
          const url = `https://twitter.com/intent/tweet?url=${encodeURIComponent(window.location.href)}&text=${encodeURIComponent(document.title)}`;
          window.open(url, '_blank', 'noopener,noreferrer,width=640,height=520');
        },
      },
      {
        label: 'Copy Link',
        action: async (button) => {
          await navigator.clipboard.writeText(window.location.href);
          button.dataset.cddShareLabel = button.textContent;
          button.textContent = 'COPIED';
          setTimeout(() => {
            button.textContent = button.dataset.cddShareLabel || 'Copy Link';
          }, 1300);
        },
      },
      {
        label: 'Email',
        action: () => {
          window.location.href = `mailto:?subject=${encodeURIComponent(document.title)}&body=${encodeURIComponent(window.location.href)}`;
        },
      },
    ];

    shareOptions.forEach((option) => {
      const optionButton = document.createElement('button');
      optionButton.type = 'button';
      optionButton.className = 'cdd-share__item';
      optionButton.textContent = option.label;
      optionButton.addEventListener('click', async () => {
        try {
          await option.action(optionButton);
        } catch (error) {
          if (option.label === 'Copy Link') {
            window.prompt('Copy this link:', window.location.href);
          }
        }

        if (option.label === 'Copy Link') {
          closeMenu();
        }
      });
      shareMenu.appendChild(optionButton);
    });

    const closeMenu = () => {
      shareButton.setAttribute('aria-expanded', 'false');
      shareMenu.classList.remove('is-open');
    };

    const openMenu = () => {
      shareButton.setAttribute('aria-expanded', 'true');
      shareMenu.classList.add('is-open');
    };

    shareButton.addEventListener('click', async () => {
      const isMobile = window.matchMedia('(max-width: 767px)').matches;
      if (navigator.share && isMobile) {
        try {
          await navigator.share({ title: document.title, url: window.location.href });
          closeMenu();
          return;
        } catch (error) {
          // User cancelled or platform fallback unavailable; continue to menu.
        }
      }

      if (!shareMenu.classList.contains('is-open')) {
        openMenu();
      } else {
        closeMenu();
      }
    });

    document.addEventListener('click', (event) => {
      if (!shareWrap.contains(event.target)) {
        closeMenu();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeMenu();
      }
    });

    shareWrap.append(shareButton, shareMenu);
    actions.appendChild(shareWrap);
  }


  function installBackToTop() {
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

    const footer = document.querySelector('.cdd-disclaimer, footer');
    if (!footer || !('IntersectionObserver' in window)) return;

    const footerObserver = new IntersectionObserver((entries) => {
      footerInView = entries.some((entry) => entry.isIntersecting);
      toggleVisibility();
    }, { rootMargin: '0px 0px 56px 0px', threshold: 0.01 });

    footerObserver.observe(footer);
  }
})();
