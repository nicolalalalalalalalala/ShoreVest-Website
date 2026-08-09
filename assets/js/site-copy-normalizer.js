(function () {
  "use strict";

  var pathname = window.location.pathname || "/";
  if (/^\/(?:employee-portal|shorevest-one|api)(?:\/|$)/i.test(pathname)) return;

  var isChinese = (document.documentElement.getAttribute("lang") || "").toLowerCase().indexOf("zh") === 0 ||
    /(?:^|\/)cn(?:\/|$)|_cn(?:\.html)?(?:$|[?#])/.test(pathname);

  var EN_REPLACEMENTS = {
    "Asset-backed lending · Asset restructuring · Debt resolution": "Asset-backed lending, asset restructuring and debt resolution",
    "Claim priority · enforceability · exit routes": "Claim priority, enforceability and exit routes",
    "Bloomberg · Reuters · The Economist · Nikkei Asia · SCMP": "Bloomberg, Reuters, The Economist, Nikkei Asia and SCMP",
    "Interviews · Panels · Podcasts · Commentary": "Interviews, panels, podcasts and commentary",
    "Guangzhou · Shanghai · Beijing · Hong Kong": "Guangzhou, Shanghai, Beijing and Hong Kong",
    "Guangzhou · Shanghai · Beijing · Shenzhen": "Guangzhou, Shanghai, Beijing and Shenzhen"
  };

  var CN_REPLACEMENTS = {
    "资产支持贷款 · 资产重组 · 债务处置": "资产支持贷款、资产重组、债务处置",
    "债权优先级 · 可执行性 · 退出路径": "债权优先级、可执行性、退出路径",
    "访谈 · 专题讨论 · 播客 · 评论": "访谈、专题讨论、播客和评论",
    "广州 · 上海 · 北京 · 香港": "广州、上海、北京和香港",
    "广州 · 上海 · 北京 · 深圳": "广州、上海、北京和深圳"
  };

  var STRUCTURED_SELECTORS = [
    ".sv-cdd__label",
    ".sv-cdd__feature-issue",
    ".cdd-hero__panel-issue",
    ".cdd-hero__cn",
    ".cdd-lockup",
    ".cdd-nameplate__lockup",
    ".cdd-nameplate__issue",
    ".st-sleeve__tag",
    ".pr-featured__date"
  ].join(",");

  function ensureStyles() {
    if (!document.head || document.getElementById("sv-copy-normalizer-styles")) return;
    var style = document.createElement("style");
    style.id = "sv-copy-normalizer-styles";
    style.textContent =
      ".sv-copy-separated{display:flex!important;flex-wrap:wrap;align-items:baseline;column-gap:clamp(10px,1vw,18px);row-gap:4px}" +
      ".sv-copy-separated>span{white-space:nowrap}" +
      ".st-sleeve__tag.sv-copy-separated{column-gap:clamp(12px,1.25vw,22px)}";
    document.head.appendChild(style);
  }

  function splitIntoFields(element) {
    if (!element || element.getAttribute("data-sv-copy-normalized") === "true") return;
    var text = (element.textContent || "").trim();
    if (text.indexOf("·") === -1) return;

    var parts = text.split(/\s*·\s*/).map(function (part) { return part.trim(); }).filter(Boolean);
    if (parts.length < 2) return;

    element.textContent = "";
    element.classList.add("sv-copy-separated");
    element.setAttribute("data-sv-copy-normalized", "true");
    parts.forEach(function (part) {
      var span = document.createElement("span");
      span.textContent = part;
      element.appendChild(span);
    });
  }

  function applyStructuredFields(root) {
    var elements = [];
    if (root.nodeType === 1 && root.matches && root.matches(STRUCTURED_SELECTORS)) elements.push(root);
    if (root.querySelectorAll) {
      Array.prototype.push.apply(elements, root.querySelectorAll(STRUCTURED_SELECTORS));
    }
    elements.forEach(splitIntoFields);
  }

  function normalizeKnownText(text) {
    var direct = isChinese ? CN_REPLACEMENTS[text] : EN_REPLACEMENTS[text];
    if (direct) return direct;

    if (!isChinese) {
      if (/^Volume\s+\d+\s*·\s*Issue\s+\d+$/i.test(text)) {
        return text.replace(/\s*·\s*/g, ", ");
      }
      if (/^Issue\s+\d+\s*·\s*/i.test(text)) {
        return text.replace(/\s*·\s*/g, ", ");
      }
    }

    return text;
  }

  function shouldSkipTextNode(node) {
    var parent = node.parentElement;
    if (!parent) return true;
    if (parent.closest("script,style,noscript,textarea,pre,code")) return true;
    if (parent.closest(".sv-copy-separated")) return true;
    return false;
  }

  function normalizeTextNode(node) {
    if (!node || node.nodeType !== 3 || shouldSkipTextNode(node)) return;
    var value = node.nodeValue;
    if (!value || value.indexOf("·") === -1) return;

    var leading = value.match(/^\s*/)[0];
    var trailing = value.match(/\s*$/)[0];
    var core = value.trim();
    var normalized = normalizeKnownText(core);

    if (normalized.indexOf("·") !== -1) {
      normalized = normalized.replace(/\s*·\s*/g, isChinese ? "、" : ", ");
    }

    node.nodeValue = leading + normalized + trailing;
  }

  function normalizeTextTree(root) {
    if (!root) return;
    if (root.nodeType === 3) {
      normalizeTextNode(root);
      return;
    }
    if (!document.createTreeWalker) return;

    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) normalizeTextNode(node);
  }

  function normalizeRoot(root) {
    if (!root) return;
    applyStructuredFields(root);
    normalizeTextTree(root);
  }

  function normalizeDocument() {
    if (!document.body) return;
    ensureStyles();
    normalizeRoot(document.body);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", normalizeDocument, { once: true });
  } else {
    normalizeDocument();
  }

  var observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
      if (mutation.type === "characterData") {
        normalizeTextNode(mutation.target);
        return;
      }
      Array.prototype.forEach.call(mutation.addedNodes || [], function (node) {
        normalizeRoot(node);
      });
    });
  });

  function startObserver() {
    if (!document.body) return;
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startObserver, { once: true });
  } else {
    startObserver();
  }
})();
