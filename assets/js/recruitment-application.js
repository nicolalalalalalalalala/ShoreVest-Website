(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ShoreVestRecruitmentApplication = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var MANIFEST_PATH = '../assets/data/recruitment/roles.v1.json';
  var PUBLIC_CONFIG_PATH = '../assets/data/recruitment/public-config.json';
  var SOURCES = { website: true, linkedin: true, direct: true, other: true };
  var MIME_BY_EXTENSION = {
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  };
  var STRINGS = {
    en: {
      unavailable: 'Online applications are currently unavailable.',
      notFound: 'This position could not be found.',
      closed: 'This position is not currently accepting applications.',
      required: 'This field is required.',
      email: 'Please enter a valid email address.',
      linkedin: 'Please enter a valid LinkedIn profile URL.',
      fileMissing: 'Please upload your resume or CV.',
      fileType: 'Please upload a PDF or DOCX file.',
      fileSize: 'The selected file exceeds the 10 MB limit.',
      privacy: 'Please acknowledge the Privacy Policy.',
      accuracy: 'Please confirm that the information you provided is accurate.',
      bot: 'Please complete the security verification.',
      submit: 'Submit application',
      submitting: 'Submitting…',
      generic: 'We could not submit your application. Please try again.',
      network: 'We could not submit your application. Please check your connection and try again.',
      rate: 'Too many attempts were received. Please wait a few minutes and try again.',
      successTitle: 'Application received',
      successBody: 'Thank you for applying to ShoreVest. We have received your application.',
      successReference: 'Application reference:'
    },
    'zh-CN': {
      unavailable: '目前暂不接受在线申请。',
      notFound: '未能找到该职位。',
      closed: '该职位目前暂不接受申请。',
      required: '此项为必填项。',
      email: '请输入有效的电子邮箱地址。',
      linkedin: '请输入有效的 LinkedIn 个人主页链接。',
      fileMissing: '请上传您的简历。',
      fileType: '请上传 PDF 或 DOCX 文件。',
      fileSize: '所选文件超过 10 MB 上限。',
      privacy: '请确认您已阅读隐私政策。',
      accuracy: '请确认所提供的信息准确无误。',
      bot: '请完成安全验证。',
      submit: '提交申请',
      submitting: '正在提交……',
      generic: '您的申请未能提交，请稍后重试。',
      network: '您的申请未能提交，请检查网络连接后重试。',
      rate: '提交尝试过多，请稍后再试。',
      successTitle: '申请已收到',
      successBody: 'ShoreVest 已安全收到您的申请。',
      successReference: '申请编号：'
    }
  };

  function locale(doc) {
    return doc && doc.documentElement && doc.documentElement.lang === 'zh-CN' ? 'zh-CN' : 'en';
  }

  function parseParams(search) {
    var params = new URLSearchParams(search || '');
    var role = params.get('role') || '';
    var source = params.get('source') || 'direct';
    if (!/^[a-z0-9][a-z0-9-]{2,80}$/.test(role)) role = '';
    if (!SOURCES[source]) source = 'direct';
    return { role: role, source: source };
  }

  function extension(name) {
    var match = String(name || '').toLowerCase().match(/(\.[a-z0-9]+)$/);
    return match ? match[1] : '';
  }

  function declaredMime(file) {
    return (file && file.type) || MIME_BY_EXTENSION[extension(file && file.name)] || '';
  }

  function validEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
  }

  function validLinkedIn(value) {
    if (!value) return true;
    try {
      var url = new URL(String(value).trim());
      var host = url.hostname.toLowerCase().replace(/\.$/, '');
      return url.protocol === 'https:' && (host === 'linkedin.com' || host.endsWith('.linkedin.com'));
    } catch (_) {
      return false;
    }
  }

  function resolveRole(manifest, roleId, lang) {
    var roles = manifest && Array.isArray(manifest.roles) ? manifest.roles : [];
    var role = roles.find(function (item) { return item && item.id === roleId; });
    if (!role) return { ok: false, reason: 'notFound' };
    if (role.status !== 'published' || role.contentReviewRequired === true || role.application?.enabled !== true) {
      return { ok: false, reason: 'closed' };
    }
    if (!role.title || !role.title[lang] || !role.application?.privacyNoticeVersion) {
      return { ok: false, reason: 'closed' };
    }
    if (role.application.deadlineUtc && Date.parse(role.application.deadlineUtc) < Date.now()) {
      return { ok: false, reason: 'closed' };
    }
    return { ok: true, role: role };
  }

  function uuid(win) {
    if (win.crypto && typeof win.crypto.randomUUID === 'function') return win.crypto.randomUUID();
    var bytes = new Uint8Array(16);
    win.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    var hex = Array.from(bytes, function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    return hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20);
  }

  function json(win, url, options) {
    return win.fetch(url, options).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (body) {
        if (!response.ok || body.success === false) {
          var error = new Error('Recruitment request failed');
          error.code = body.errorCode || (response.status === 429 ? 'RATE_LIMITED' : 'SUBMISSION_FAILED');
          throw error;
        }
        return body;
      });
    });
  }

  function post(win, base, route, body) {
    return json(win, base.replace(/\/$/, '') + route, {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
  }

  function errorMessage(strings, code) {
    if (code === 'RATE_LIMITED') return strings.rate;
    if (code === 'ROLE_NOT_FOUND') return strings.notFound;
    if (code === 'ROLE_NOT_OPEN' || code === 'APPLICATION_DEADLINE_PASSED') return strings.closed;
    return strings.generic;
  }

  function setText(node, value) { if (node) node.textContent = value; }

  function showState(doc, message) {
    var form = doc.querySelector('[data-application-form]');
    var state = doc.querySelector('[data-application-state]');
    if (form) form.hidden = true;
    if (state) { state.hidden = false; state.textContent = message; }
  }

  function clearErrors(doc) {
    Array.prototype.forEach.call(doc.querySelectorAll('[data-field-error]'), function (node) { node.textContent = ''; });
    Array.prototype.forEach.call(doc.querySelectorAll('[data-field]'), function (node) { node.removeAttribute('aria-invalid'); });
    var summary = doc.querySelector('[data-application-errors]');
    if (summary) { summary.hidden = true; summary.textContent = ''; }
  }

  function validate(doc, role, strings, botToken) {
    var errors = {};
    function value(name) {
      var node = doc.querySelector('[data-field="' + name + '"]');
      return node ? String(node.value || '').trim() : '';
    }
    var fullName = value('fullName');
    var email = value('email');
    var linkedinUrl = value('linkedinUrl');
    if (!fullName) errors.fullName = strings.required;
    if (!email) errors.email = strings.required;
    else if (!validEmail(email)) errors.email = strings.email;
    if (linkedinUrl && !validLinkedIn(linkedinUrl)) errors.linkedinUrl = strings.linkedin;
    var fileNode = doc.querySelector('[data-field="cv"]');
    var file = fileNode && fileNode.files && fileNode.files[0];
    var cv = role.application.cv;
    if (!file) errors.cv = strings.fileMissing;
    else {
      var ext = extension(file.name);
      var mime = declaredMime(file);
      if (!cv.allowedExtensions.includes(ext) || !cv.allowedMimeTypes.includes(mime)) errors.cv = strings.fileType;
      else if (file.size < 1 || file.size > cv.maxSizeBytes) errors.cv = strings.fileSize;
    }
    var privacy = doc.querySelector('[data-field="privacyAccepted"]');
    var accuracy = doc.querySelector('[data-field="accuracyConfirmed"]');
    if (!privacy || privacy.checked !== true) errors.privacyAccepted = strings.privacy;
    if (!accuracy || accuracy.checked !== true) errors.accuracyConfirmed = strings.accuracy;
    if (!botToken) errors.turnstile = strings.bot;
    return { errors: errors, file: file };
  }

  function showErrors(doc, errors) {
    var keys = Object.keys(errors);
    keys.forEach(function (key) {
      var fieldError = doc.querySelector('[data-field-error="' + key + '"]');
      var field = doc.querySelector('[data-field="' + key + '"]');
      if (fieldError) fieldError.textContent = errors[key];
      if (field) field.setAttribute('aria-invalid', 'true');
    });
    var summary = doc.querySelector('[data-application-errors]');
    if (summary && keys.length) {
      summary.hidden = false;
      summary.textContent = keys.map(function (key) { return errors[key]; }).join(' ');
      if (typeof summary.focus === 'function') summary.focus();
    }
  }

  function renderTurnstile(win, doc, publicConfig, state) {
    var target = doc.querySelector('[data-turnstile]');
    if (!target || !publicConfig.turnstileSiteKey) return Promise.resolve(false);
    return new Promise(function (resolve) {
      var attempts = 0;
      function tryRender() {
        attempts += 1;
        if (win.turnstile && typeof win.turnstile.render === 'function') {
          try {
            state.turnstileId = win.turnstile.render(target, {
              sitekey: publicConfig.turnstileSiteKey,
              action: publicConfig.turnstileAction || 'recruitment-application',
              callback: function (token) { state.botToken = token; },
              'expired-callback': function () { state.botToken = ''; },
              'error-callback': function () { state.botToken = ''; }
            });
            resolve(true);
            return;
          } catch (_) {}
        }
        if (attempts >= 300) { resolve(false); return; }
        win.setTimeout(tryRender, 100);
      }
      tryRender();
    });
  }

  function resetTurnstile(win, state) {
    state.botToken = '';
    if (state.turnstileId != null && win.turnstile && typeof win.turnstile.reset === 'function') {
      try { win.turnstile.reset(state.turnstileId); } catch (_) {}
    }
  }

  function init(win) {
    var doc = win.document;
    if (!doc || typeof win.fetch !== 'function') return Promise.resolve('unavailable');
    var lang = locale(doc);
    var strings = STRINGS[lang];
    var params = parseParams(win.location && win.location.search);
    var state = { botToken: '', turnstileId: null, submitting: false };

    return Promise.all([
      json(win, PUBLIC_CONFIG_PATH, { credentials: 'same-origin', cache: 'no-store' }),
      json(win, MANIFEST_PATH, { credentials: 'same-origin', cache: 'no-store' })
    ]).then(function (values) {
      var publicConfig = values[0];
      var manifest = values[1];
      if (!publicConfig || publicConfig.applicationsEnabled !== true || !publicConfig.apiBase || !publicConfig.turnstileSiteKey) {
        showState(doc, strings.unavailable);
        return 'disabled';
      }
      var resolved = resolveRole(manifest, params.role, lang);
      if (!resolved.ok) {
        showState(doc, strings[resolved.reason] || strings.unavailable);
        return resolved.reason;
      }
      var role = resolved.role;
      if (!role.application.allowedSources.includes(params.source)) params.source = 'direct';
      setText(doc.querySelector('[data-application-role-title]'), role.title[lang]);
      setText(doc.querySelector('[data-application-role-meta]'), [role.department[lang], role.location[lang], role.employmentType[lang]].filter(Boolean).join(' · '));
      var form = doc.querySelector('[data-application-form]');
      var stateNode = doc.querySelector('[data-application-state]');
      if (stateNode) stateNode.hidden = true;
      if (form) form.hidden = false;

      return renderTurnstile(win, doc, publicConfig, state).then(function (turnstileReady) {
        if (!turnstileReady) {
          var turnstileError = doc.querySelector('[data-field-error="turnstile"]');
          if (turnstileError) turnstileError.textContent = strings.bot;
        }
        if (!form) return 'ready';
        form.addEventListener('submit', function (event) {
          event.preventDefault();
          if (state.submitting) return;
          clearErrors(doc);
          var checked = validate(doc, role, strings, state.botToken);
          if (Object.keys(checked.errors).length) {
            showErrors(doc, checked.errors);
            return;
          }
          var submit = doc.querySelector('[data-application-submit]');
          var submitError = doc.querySelector('[data-application-submit-error]');
          if (submitError) { submitError.hidden = true; submitError.textContent = ''; }
          state.submitting = true;
          if (submit) { submit.disabled = true; submit.textContent = strings.submitting; }

          function field(name) {
            var node = doc.querySelector('[data-field="' + name + '"]');
            return node ? String(node.value || '').trim() : '';
          }

          var initial = {
            roleId: role.id,
            locale: lang,
            source: params.source,
            clientSubmissionId: uuid(win),
            privacyNoticeVersion: role.application.privacyNoticeVersion,
            submittedAtClientUtc: new Date().toISOString(),
            botToken: state.botToken,
            privacyAccepted: true,
            candidate: {
              fullName: field('fullName'),
              email: field('email'),
              telephone: field('telephone'),
              currentLocation: field('currentLocation'),
              linkedinUrl: field('linkedinUrl'),
              coverNote: field('coverNote')
            },
            file: {
              originalName: checked.file.name,
              sizeBytes: checked.file.size,
              declaredMimeType: declaredMime(checked.file)
            }
          };

          post(win, publicConfig.apiBase, '/applications/initiate', initial)
            .then(function (started) {
              var headers = started.upload && started.upload.requiredHeaders ? started.upload.requiredHeaders : {};
              return win.fetch(started.upload.url, {
                method: 'PUT',
                mode: 'cors',
                credentials: 'omit',
                headers: headers,
                body: checked.file
              }).then(function (uploadResponse) {
                if (!uploadResponse.ok) throw Object.assign(new Error('Upload failed'), { code: 'SUBMISSION_FAILED' });
                return { started: started };
              });
            })
            .then(function (context) {
              return post(win, publicConfig.apiBase, '/applications/complete', {
                applicationReference: context.started.applicationReference,
                fileReference: context.started.fileReference,
                completionToken: context.started.completionToken
              }).then(function (completed) {
                return { started: context.started, completed: completed };
              });
            })
            .then(function (context) {
              return post(win, publicConfig.apiBase, '/applications/finalize', {
                applicationReference: context.started.applicationReference,
                fileReference: context.started.fileReference,
                finalizationToken: context.completed.finalizationToken,
                privacyAccepted: true,
                accuracyConfirmed: true
              });
            })
            .then(function (result) {
              form.hidden = true;
              var success = doc.querySelector('[data-application-success]');
              if (success) {
                success.hidden = false;
                success.replaceChildren();
                var title = doc.createElement('h2');
                title.textContent = strings.successTitle;
                success.appendChild(title);
                var body = doc.createElement('p');
                body.textContent = strings.successBody;
                success.appendChild(body);
                var ref = doc.createElement('p');
                ref.className = 'careers-application__reference';
                ref.textContent = strings.successReference + ' ' + result.applicationReference;
                success.appendChild(ref);
                if (typeof success.focus === 'function') success.focus();
              }
            })
            .catch(function (error) {
              if (submitError) {
                submitError.hidden = false;
                submitError.textContent = error && error.name === 'TypeError' ? strings.network : errorMessage(strings, error && error.code);
              }
              resetTurnstile(win, state);
            })
            .finally(function () {
              state.submitting = false;
              if (submit) { submit.disabled = false; submit.textContent = strings.submit; }
            });
        });
        return 'ready';
      });
    }).catch(function () {
      showState(doc, strings.unavailable);
      return 'unavailable';
    });
  }

  if (typeof window !== 'undefined' && window.document) init(window);

  return {
    init: init,
    parseParams: parseParams,
    declaredMime: declaredMime,
    resolveRole: resolveRole,
    validEmail: validEmail,
    validLinkedIn: validLinkedIn,
    MANIFEST_PATH: MANIFEST_PATH,
    PUBLIC_CONFIG_PATH: PUBLIC_CONFIG_PATH
  };
});
