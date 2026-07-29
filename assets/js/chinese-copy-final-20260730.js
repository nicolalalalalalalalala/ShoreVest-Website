(function () {
  "use strict";

  var htmlLang = (document.documentElement.getAttribute("lang") || "").toLowerCase();
  var isChinesePage = htmlLang.indexOf("zh") === 0 || /(?:^|\/)cn(?:\/|$)|_cn(?:\.html)?(?:$|[?#])/.test(location.pathname);
  if (!isChinesePage) return;

  var EXACT_TEXT_REPLACEMENTS = [
    [
      "本投资者门户条款（下称“门户条款”）管辖通过本网站（下称“门户”）访问及使用由新岸资本（ShoreVest Partners, Ltd.）及其相关关联方（统称“ShoreVest”、“我们”或“我们的”）提供的投资者访问门户、受限材料、数据室环境及任何可下载文件的相关事宜。",
      "本投资者门户条款（下称“门户条款”）管辖通过本网站（下称“门户”）访问及使用由新岸资本（ShoreVest Partners, Ltd.） 及其相关关联方（统称“ShoreVest”、“我们”或“我们的”）提供的投资者访问门户、受限材料、数据室环境及任何可下载文件的相关事宜。"
    ],
    [
      "本网站由新岸资本及其相关关联方提供，仅供一般参考。内容为概括性质，可能不完整，可能随时变更且恕不另行通知，亦不旨在为评估新岸资本、任何新岸资本管理的载体或任何投资机会提供完整依据。本网站不面向散户投资者。",
      "本网站由新岸资本及其相关关联方提供，仅供一般参考。内容为概括性质，可能不完整，可能随时变更且恕不另行通知，亦不旨在为评估新岸资本、任何 新岸资本管理的载体或任何投资机会提供完整依据。本网站不面向散户投资者。"
    ]
  ];

  function replaceApprovedText(root) {
    if (!root) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        var tag = node.parentElement && node.parentElement.tagName;
        if (/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(tag || "")) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    var node;
    while ((node = walker.nextNode())) {
      var value = node.nodeValue;
      for (var i = 0; i < EXACT_TEXT_REPLACEMENTS.length; i += 1) {
        value = value.split(EXACT_TEXT_REPLACEMENTS[i][0]).join(EXACT_TEXT_REPLACEMENTS[i][1]);
      }
      if (value !== node.nodeValue) node.nodeValue = value;
    }
  }

  function applyApprovedAttributes() {
    var path = location.pathname.toLowerCase();
    if (/(?:^|\/)cn\/media(?:\/|$)|media_cn\.html$/.test(path)) {
      var mediaHero = document.querySelector('img[src*="media-hero-fii-priority"]');
      if (mediaHero) {
        mediaHero.alt = "新岸资本在 FII Priority 亚洲峰会的专题讨论中发言，面向与会观众";
      }
    }
  }

  function applyFinalApprovedCopy() {
    replaceApprovedText(document.body);
    applyApprovedAttributes();
    document.documentElement.setAttribute("data-sv-cn-final-copy", "20260730");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyFinalApprovedCopy, { once: true });
  } else {
    applyFinalApprovedCopy();
  }

  window.addEventListener("pageshow", applyFinalApprovedCopy);
  window.setTimeout(applyFinalApprovedCopy, 0);
  window.setTimeout(applyFinalApprovedCopy, 250);

  new MutationObserver(function (mutations) {
    for (var i = 0; i < mutations.length; i += 1) {
      for (var j = 0; j < mutations[i].addedNodes.length; j += 1) {
        var added = mutations[i].addedNodes[j];
        if (added.nodeType === 1) replaceApprovedText(added);
      }
    }
    applyApprovedAttributes();
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
