(function () {
  'use strict';

  var originalFetch = window.fetch.bind(window);

  function stageFor(url) {
    var value = String(url || '');
    if (value.indexOf('/applications/initiate') !== -1) return 'initiate';
    if (value.indexOf('/applications/complete') !== -1) return 'complete';
    if (value.indexOf('/applications/finalize') !== -1) return 'finalize';
    if (value.indexOf('.blob.core.windows.net/') !== -1) return 'upload';
    return '';
  }

  function diagnosticNode() {
    var node = document.querySelector('[data-recruitment-test-diagnostic]');
    if (node) return node;
    node = document.createElement('p');
    node.setAttribute('data-recruitment-test-diagnostic', '');
    node.setAttribute('role', 'status');
    node.style.marginTop = '16px';
    node.style.fontFamily = 'monospace';
    node.style.fontSize = '13px';
    node.style.lineHeight = '1.5';
    var submitError = document.querySelector('[data-application-submit-error]');
    if (submitError && submitError.parentNode) submitError.parentNode.insertBefore(node, submitError.nextSibling);
    return node;
  }

  function show(message) {
    var node = diagnosticNode();
    if (node) node.textContent = 'Test diagnostic: ' + message;
  }

  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var stage = stageFor(url);
    return originalFetch(input, init).then(function (response) {
      if (!stage) return response;
      if (response.ok) {
        show(stage + ' OK (' + response.status + ')');
        return response;
      }
      var copy = response.clone();
      return copy.json().catch(function () { return {}; }).then(function (body) {
        var code = body && body.errorCode ? ' / ' + body.errorCode : '';
        show(stage + ' FAILED (' + response.status + code + ')');
        return response;
      });
    }).catch(function (error) {
      if (stage) show(stage + ' NETWORK FAILED (' + ((error && error.name) || 'Error') + ')');
      throw error;
    });
  };
})();
