(function () {
  var VERSION = "20260801-ga4-restored-1";

  var GOOGLE_ANALYTICS_ID = "G-CLVYF17N9H";

  function isPublicAnalyticsPage() {
    var hostname = (window.location.hostname || "").toLowerCase();
    var pathname = window.location.pathname || "/";

    if (hostname !== "shorevest.com" && hostname !== "www.shorevest.com") return false;
    if (/^\/(?:employee-portal|shorevest-one|api)(?:\/|$)/i.test(pathname)) return false;

    try {
      return !(new URL(window.location.href)).searchParams.has("t");
    } catch (_) {
      return true;
    }
  }

  function ensureGoogleAnalytics() {
    if (!document.head || !isPublicAnalyticsPage() || window.__SV_GA4_INSTALLED) return;
    window.__SV_GA4_INSTALLED = true;

    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () {
      window.dataLayer.push(arguments);
    };

    window.gtag("consent", "default", {
      analytics_storage: "granted",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied"
    });
    window.gtag("js", new Date());
    window.gtag("config", GOOGLE_ANALYTICS_ID, {
      send_page_view: true,
      allow_google_signals: false,
      allow_ad_personalization_signals: false
    });

    var analyticsScript = document.createElement("script");
    analyticsScript.async = true;
    analyticsScript.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(GOOGLE_ANALYTICS_ID);
    analyticsScript.setAttribute("data-sv-google-analytics", "true");
    document.head.appendChild(analyticsScript);
  }


  function removeEmptyLegacyToken() {
    try {
      var url = new URL(window.location.href);
      if (!url.searchParams.has("t") || url.searchParams.get("t")) return;
      url.searchParams.delete("t");
      var cleanUrl = url.pathname + url.search + url.hash;
      window.history.replaceState(window.history.state, "", cleanUrl);
    } catch (_) {
      // Leave the current URL untouched if the browser cannot rewrite it safely.
    }
  }

  removeEmptyLegacyToken();
  ensureGoogleAnalytics();

  // Resolve the site base from this script's own URL so shared assets work
  // whether the site is served from the domain root or a GitHub Pages subpath.
  var script = document.currentScript;
  var base = "";
  if (script && script.src) {
    base = script.src.replace(/assets\/js\/favicon-guard\.js.*$/, "");
  }

  // Use only dated favicon filenames so browsers cannot reuse retired tab art.
  var iconVersion = "?v=" + VERSION;
  var ICONS = [
    { rel: "icon", href: base + "assets/favicon-shorevest-20260724.svg" + iconVersion, type: "image/svg+xml", sizes: "any" },
    { rel: "icon", href: base + "assets/favicon-shorevest-20260724.ico" + iconVersion, sizes: "any" },
    { rel: "shortcut icon", href: base + "assets/favicon-shorevest-20260724.ico" + iconVersion },
    { rel: "icon", href: base + "assets/favicon-shorevest-20260724-32x32.png" + iconVersion, type: "image/png", sizes: "32x32" },
    { rel: "icon", href: base + "assets/favicon-shorevest-20260724-16x16.png" + iconVersion, type: "image/png", sizes: "16x16" },
    { rel: "apple-touch-icon", href: base + "assets/apple-touch-icon-shorevest-20260724.png" + iconVersion, sizes: "180x180" },
    { rel: "manifest", href: base + "site-20260724.webmanifest" + iconVersion }
  ];

  function setAttr(el, key, value) {
    if (value) el.setAttribute(key, value);
  }

  function isChinesePage() {
    var language = (document.documentElement.getAttribute("lang") || "").toLowerCase();
    return language.indexOf("zh") === 0 || /(?:^|\/)cn(?:\/|$)|_cn(?:\.html)?(?:$|[?#])/.test(location.pathname);
  }

  function ensureFavicons() {
    if (!document.head) return;

    // Keep one consistent icon set after navigation or browser page restoration.
    var existing = document.head.querySelectorAll(
      'link[rel~="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"], link[rel="mask-icon"], link[rel="manifest"]'
    );
    for (var i = 0; i < existing.length; i += 1) existing[i].remove();

    ICONS.forEach(function (icon) {
      var link = document.createElement("link");
      link.setAttribute("data-sv-favicon-guard", "true");
      setAttr(link, "rel", icon.rel);
      setAttr(link, "href", icon.href);
      setAttr(link, "type", icon.type);
      setAttr(link, "sizes", icon.sizes);
      document.head.appendChild(link);
    });
  }

  function ensureChineseCopyOverrides() {
    if (!document.head || !isChinesePage() || document.querySelector('script[data-sv-cn-copy="true"]')) return;

    var copyScript = document.createElement("script");
    copyScript.src = base + "assets/js/chinese-copy-overrides.js?v=" + VERSION;
    copyScript.defer = true;
    copyScript.setAttribute("data-sv-cn-copy", "true");
    document.head.appendChild(copyScript);
  }

  function ensureChineseFontUniformity() {
    if (!document.head || !isChinesePage()) return;

    document.documentElement.classList.add("sv-cn-font-unified");
    if (document.querySelector('link[data-sv-cn-font="true"]')) return;

    var fontStylesheet = document.createElement("link");
    fontStylesheet.rel = "stylesheet";
    fontStylesheet.href = base + "assets/css/chinese-font-uniform.css?v=" + VERSION;
    fontStylesheet.setAttribute("data-sv-cn-font", "true");
    document.head.appendChild(fontStylesheet);
  }

  function isCanonicalHomepage() {
    var canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical || !canonical.href) return location.pathname === "/";
    try {
      return new URL(canonical.href, location.href).href === "https://shorevest.com/";
    } catch (_) {
      return false;
    }
  }

  function ensureWebsiteSearchSignals() {
    if (!document.head || !isCanonicalHomepage()) return;

    var siteName = document.head.querySelector('meta[property="og:site_name"]');
    if (!siteName) {
      siteName = document.createElement("meta");
      siteName.setAttribute("property", "og:site_name");
      document.head.appendChild(siteName);
    }
    siteName.setAttribute("content", "ShoreVest");

    var existing = document.head.querySelector('script[data-sv-website-schema="true"]');
    if (existing) return;

    var schema = document.createElement("script");
    schema.type = "application/ld+json";
    schema.setAttribute("data-sv-website-schema", "true");
    schema.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": "https://shorevest.com/#website",
      "url": "https://shorevest.com/",
      "name": "ShoreVest",
      "alternateName": ["ShoreVest Partners", "shorevest.com"],
      "publisher": { "@id": "https://shorevest.com/#organization" }
    });
    document.head.appendChild(schema);
  }

  function ensureInvestorPortalEmailLogin() {
    var form = document.getElementById("vdr-login-form");
    if (!form) return;

    var emailField = form.querySelector('input[name="email"]');
    if (!emailField) return;

    var formGroup = emailField.closest(".form-group");
    if (formGroup) {
      formGroup.hidden = false;
      formGroup.removeAttribute("hidden");
      formGroup.removeAttribute("aria-hidden");
    }

    emailField.disabled = false;
    emailField.required = true;
    emailField.type = "email";
    emailField.autocomplete = "email";

    var isChinese = isChinesePage();
    var title = document.querySelector(".ip-signin__title");
    var note = document.querySelector(".ip-signin__note");
    if (title) title.textContent = isChinese ? "输入电子邮箱以打开数据室。" : "Enter your email to open the data room.";
    if (note) note.textContent = isChinese
      ? "已获授权的投资者将直接进入 ShoreVest iDeals 数据室。"
      : "Authorized investors are sent directly into the ShoreVest iDeals data room.";

    if (form.getAttribute("data-sv-email-login-ready") === "true") return;
    form.setAttribute("data-sv-email-login-ready", "true");

    var error = formGroup ? formGroup.querySelector(".error") : null;
    function clearError() {
      if (formGroup) formGroup.classList.remove("has-error");
      if (error) error.textContent = "";
      emailField.setCustomValidity("");
    }

    emailField.addEventListener("input", clearError);
    emailField.addEventListener("change", clearError);

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      event.stopImmediatePropagation();

      var email = emailField.value.trim();
      var valid = email !== "" && emailField.checkValidity();
      if (!valid) {
        if (formGroup) formGroup.classList.add("has-error");
        if (error) {
          error.textContent = email === ""
            ? (isChinese ? "请填写后继续" : "Fill in to continue")
            : (isChinese ? "请输入有效的电子邮件" : "Enter a valid email");
        }
        emailField.focus();
        return;
      }

      window.location.href = "https://app.idealsvdr.com/projects/all/documents?email=" + encodeURIComponent(email);
    }, true);
  }

  ensureFavicons();
  ensureChineseCopyOverrides();
  ensureChineseFontUniformity();
  ensureWebsiteSearchSignals();
  ensureInvestorPortalEmailLogin();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureFavicons);
    document.addEventListener("DOMContentLoaded", ensureChineseCopyOverrides);
    document.addEventListener("DOMContentLoaded", ensureChineseFontUniformity);
    document.addEventListener("DOMContentLoaded", ensureWebsiteSearchSignals);
    document.addEventListener("DOMContentLoaded", ensureInvestorPortalEmailLogin);
  }
  window.addEventListener("pageshow", ensureFavicons);
  window.addEventListener("pageshow", ensureChineseCopyOverrides);
  window.addEventListener("pageshow", ensureChineseFontUniformity);
  window.addEventListener("pageshow", ensureWebsiteSearchSignals);
  window.addEventListener("pageshow", ensureInvestorPortalEmailLogin);
  document.addEventListener("visibilitychange", ensureFavicons);
})();
