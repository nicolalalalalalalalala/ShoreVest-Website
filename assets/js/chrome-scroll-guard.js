/* Keep Chrome on the native document scroller even if cached or later scripts
   try to reapply a page-lock state. This does not replace wheel scrolling. */
(function () {
  'use strict';

  var applying = false;
  var queued = false;

  function setImportant(element, property, value) {
    if (
      element.style.getPropertyValue(property) !== value ||
      element.style.getPropertyPriority(property) !== 'important'
    ) {
      element.style.setProperty(property, value, 'important');
    }
  }

  function unlockPage() {
    if (applying) return;
    applying = true;

    var root = document.documentElement;
    setImportant(root, 'height', 'auto');
    setImportant(root, 'min-height', '100%');
    setImportant(root, 'overflow-x', 'hidden');
    setImportant(root, 'overflow-y', 'auto');
    setImportant(root, 'position', 'static');
    setImportant(root, 'inset', 'auto');
    setImportant(root, 'touch-action', 'auto');
    setImportant(root, 'overscroll-behavior', 'auto');

    if (document.body) {
      var body = document.body;
      setImportant(body, 'height', 'auto');
      setImportant(body, 'min-height', '100%');
      setImportant(body, 'overflow', 'visible');
      setImportant(body, 'position', 'static');
      setImportant(body, 'inset', 'auto');
      setImportant(body, 'touch-action', 'auto');
      setImportant(body, 'overscroll-behavior', 'auto');
    }

    applying = false;
  }

  function queueUnlock() {
    if (queued) return;
    queued = true;
    queueMicrotask(function () {
      queued = false;
      unlockPage();
    });
  }

  function startObserver() {
    unlockPage();
    if (!window.MutationObserver) return;

    var observer = new MutationObserver(queueUnlock);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style', 'class']
    });
    if (document.body) {
      observer.observe(document.body, {
        attributes: true,
        attributeFilter: ['style', 'class']
      });
    }
  }

  unlockPage();
  document.addEventListener('DOMContentLoaded', startObserver, { once: true });
  window.addEventListener('pageshow', unlockPage);
  window.addEventListener('wheel', unlockPage, { capture: true, passive: true });
  window.addEventListener('touchstart', unlockPage, { capture: true, passive: true });
  window.addEventListener('keydown', unlockPage, { capture: true });
})();