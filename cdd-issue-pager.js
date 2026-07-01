/* China Debt Dynamics — issue pager.
   Injects a quiet prev/next-issue navigation + "All issues" link at the foot of
   each article (before the legal disclosures). Chronological, newest → oldest.
   Shared across every CDD article page; finds the current page by filename. */
(function () {
  // Newest first. file = article page; label = issue number; title = short title.
  var ISSUES = [
    { file: "china-debt-dynamics-v10i1.html", label: "10.1", title: "The End of the \u201CChina Is Uninvestable\u201D Myth" },
    { file: "45. China Debt Dynamics - Beijing's Campaign Against Overcapacity Creates Private Credit Opportunities.pdf", label: "9.4", title: "Beijing\u2019s Campaign Against Overcapacity Creates Private Credit Opportunities" },
    { file: "44. China Debt Dynamics_Into the Shadows of US Private Credit.pdf", label: "9.3", title: "Into the Shadows of US Private Credit" },
    { file: "china-debt-dynamics-v9i2.html", label: "9.2", title: "China: An Uncorrelated Harbor in a Stormy World" },
    { file: "china-debt-dynamics-v9i1.html", label: "9.1", title: "Green Finance: Sowing the Seeds of China\u2019s Next Wave of NPLs" },
    { file: "china-debt-dynamics-v8i5.html", label: "8.5", title: "United States of China" },
    { file: "china-debt-dynamics-v8i4.html", label: "8.4", title: "Quantifying China\u2019s NPL Market" },
    { file: "china-debt-dynamics-v8i3.html", label: "8.3", title: "Private Credit in a Reset World Order" },
    { file: "china-debt-dynamics-v8i2.html", label: "8.2", title: "China Refocuses on Financial Risk and Ramps Up NPL Disposals" },
    { file: "china-debt-dynamics-v8i1.html", label: "8.1", title: "Bailing Out the Banks: The Hidden Significance of Beijing Property Support Measures" },
    { file: "china-debt-dynamics-v7i4.html", label: "7.4", title: "Beijing\u2019s Strategy for Dealing With Local Government Debt: No Bailouts, but a Helping Hand" },
    { file: "china-debt-dynamics-v7i3.html", label: "7.3", title: "Where\u2019s the Stimulus? Parsing Beijing\u2019s Lackluster Response to Growth" },
    { file: "china-debt-dynamics-v7i2.html", label: "7.2", title: "Bank Exposure to Developers: A Challenge but Not a Risk" },
    { file: "china-debt-dynamics-v7i1.html", label: "7.1", title: "New Regulations Set to Accelerate NPL Disposals" },
    { file: "china-debt-dynamics-v6i3.html", label: "6.3", title: "China\u2019s Property Support Measures: Rescue, not Reflation" },
    { file: "china-debt-dynamics-v5i7.html", label: "5.7", title: "Evergrande: A Result of China Deleveraging and What Next" },
    { file: "china-debt-dynamics-v5i4.html", label: "5.4", title: "Sustained Shadow Banking Contraction Creating Private Credit Opportunities" },
    { file: "china-debt-dynamics-v4i4.html", label: "4.4", title: "Dealing With a Coming Surge in Nonperforming Loans" },
    { file: "china-debt-dynamics-v3i5.html", label: "3.5", title: "A Look at the Tools Being Deployed to Help China\u2019s Banks Dispose of Their NPLs" },
    { file: "china-debt-dynamics-v2i4.html", label: "2.4", title: "\u201CDisclose & Dispose\u201D: Stricter Accounting Requirements to Push Up NPLs Further" }
  ];

  function withToken(href) {
    var t = window.__SVT || "";
    if (!t) return href;
    return href + (href.indexOf("?") > -1 ? "&" : "?") + "t=" + t;
  }

  function build() {
    var disc = document.querySelector(".cdd-disclaimer");
    if (!disc || document.querySelector(".cdd-pager")) return;
    var file = (location.pathname.split("/").pop() || "").toLowerCase();
    var idx = ISSUES.findIndex(function (it) { return it.file.toLowerCase() === file; });
    if (idx === -1) return;
    var newer = idx > 0 ? ISSUES[idx - 1] : null;            // more recent
    var older = idx < ISSUES.length - 1 ? ISSUES[idx + 1] : null; // earlier

    var nav = document.createElement("nav");
    nav.className = "cdd-pager";
    nav.setAttribute("aria-label", "Issue navigation");

    nav.appendChild(side("prev", older, "Older issue"));
    var home = document.createElement("a");
    home.className = "cdd-pager__home";
    home.href = withToken("insights.html#archive");
    home.textContent = "All issues";
    nav.appendChild(home);
    nav.appendChild(side("next", newer, "Newer issue"));

    disc.parentNode.insertBefore(nav, disc);
  }

  function side(kind, issue, dirLabel) {
    if (!issue) {
      var span = document.createElement("span");
      span.className = "cdd-pager__side cdd-pager__side--empty cdd-pager__" + kind;
      return span;
    }
    var a = document.createElement("a");
    a.className = "cdd-pager__side cdd-pager__" + kind;
    a.href = withToken(issue.file);
    var dir = document.createElement("span");
    dir.className = "cdd-pager__dir";
    dir.textContent = (kind === "prev" ? "\u2190 " : "") + dirLabel + " \u00b7 " + issue.label + (kind === "next" ? " \u2192" : "");
    var t = document.createElement("span");
    t.className = "cdd-pager__title";
    t.textContent = issue.title;
    a.appendChild(dir);
    a.appendChild(t);
    return a;
  }

  if (document.readyState !== "loading") build();
  else document.addEventListener("DOMContentLoaded", build);
  // The article body is injected async; rebuild shortly after load as a safety.
  window.addEventListener("load", function () { setTimeout(build, 300); });
})();
