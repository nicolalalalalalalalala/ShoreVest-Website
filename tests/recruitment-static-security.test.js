const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
function read(f){return fs.readFileSync(path.join(root,f),'utf8');}

const rolePages = [
  'careers/distressed-debt-investment-manager.html',
  'careers/distressed-debt-investment-manager_cn.html',
  'careers/legal-assistant.html',
  'careers/legal-assistant_cn.html'
];
const disabledCleanRolePages = [
  'careers/distressed-debt-investment-manager/index.html',
  'cn/careers/distressed-debt-investment-manager/index.html',
  'careers/legal-assistant/index.html',
  'cn/careers/legal-assistant/index.html'
];
const applicationPages = ['careers/apply.html','careers/apply_cn.html'];
const manifest = JSON.parse(read('assets/data/recruitment/roles.v1.json'));
const publicConfig = JSON.parse(read('assets/data/recruitment/public-config.json'));

assert.strictEqual(publicConfig.openRolesEnabled, false, 'open roles remain off until controlled frontend launch');
assert.strictEqual(publicConfig.applicationsEnabled, false, 'backend source branch does not publish the application frontend');
assert.strictEqual(publicConfig.turnstileSiteKey, '0x4AAAAAAEJh3KNuIlG3ZdgM', 'only the public Turnstile site key is present');
assert.strictEqual(publicConfig.apiBase, 'https://svrc26hk-recruit-fn-test.azurewebsites.net/api/recruitment');
assert.strictEqual(publicConfig.turnstileAction, 'recruitment-application');
assert.ok(!Object.keys(publicConfig).some(k => /secret/i.test(k)), 'public config contains no secret field');

for (const role of manifest.roles) {
  assert.strictEqual(role.status, 'published', `${role.id} source content remains approved`);
  assert.strictEqual(role.contentReviewRequired, false, `${role.id} content review is cleared`);
  assert.strictEqual(role.contentReviewNote, '', `${role.id} note is cleared`);
  if (role.id === 'legal-assistant') {
    assert.strictEqual(role.application.enabled, true, 'backend accepts the single controlled Legal Assistant test role');
    assert.strictEqual(role.application.privacyNoticeVersion, '2026-08-08-v1');
  } else {
    assert.strictEqual(role.application.enabled, false, `${role.id} remains closed for online applications`);
    assert.strictEqual(role.application.privacyNoticeVersion, null);
  }
}
assert.strictEqual(manifest.roles.filter(role => role.application.enabled === true).length, 1, 'exactly one controlled test role is enabled in the shared manifest');

for (const f of rolePages) {
  const s = read(f);
  assert.match(s, /noindex, nofollow, noarchive/, `${f} is excluded from search while roles are disabled`);
  assert.match(s, /<script[^>]+application\/ld\+json[^>]*>[\s\S]*JobPosting/i, `${f} preserves approved JobPosting source content`);
  assert.doesNotMatch(s, /baseSalary|salary|compensation|jobBenefits|validThrough|applicantLocationRequirements|TELECOMMUTE/i, `${f} does not invent employment terms`);
}
for (const f of disabledCleanRolePages) {
  const s = read(f);
  assert.match(s, /noindex, nofollow, noarchive/, `${f} disabled route is excluded from search`);
  assert.match(s, /window\.location\.replace\("\/(?:cn\/)?careers\/#open-roles"\)/, `${f} redirects to the Careers no-vacancies state`);
}

for (const f of applicationPages) {
  const s = read(f);
  assert.match(s, /noindex, nofollow, noarchive/, `${f} is not indexed before frontend activation`);
  assert.match(s, /data-application-form/, `${f} contains the staged application form`);
  assert.match(s, /type="file"/, `${f} contains one CV file input`);
  assert.match(s, /data-turnstile/, `${f} contains the Turnstile mount`);
  assert.match(s, /challenges\.cloudflare\.com\/turnstile/, `${f} loads Turnstile from the approved origin`);
  assert.doesNotMatch(s, /mailto:|hr@shorevest\.com/i, `${f} does not send applications by email`);
  assert.doesNotMatch(s, /data-recruitment-mock|fake success|localStorage|sessionStorage|indexedDB/i, `${f} does not contain a production mock or browser persistence`);
}

const appClient = read('assets/js/recruitment-application.js');
for (const route of ['/applications/initiate','/applications/complete','/applications/finalize']) {
  assert.ok(appClient.includes(route), `application client uses ${route}`);
}
assert.match(appClient, /started\.upload\.url/, 'browser uploads only to the short-lived SAS URL returned by Azure');
assert.match(appClient, /botToken/, 'Turnstile token is sent to the backend');
assert.match(appClient, /clientSubmissionId/, 'client submission idempotency key is generated');
assert.doesNotMatch(appClient, /localStorage|sessionStorage|indexedDB|document\.cookie|console\.(?:log|info|debug)/, 'application client does not persist or log applicant data');
assert.doesNotMatch(appClient, /AccountKey=|SharedAccessSignature=|clientSecret|BEGIN PRIVATE KEY|recruitment-turnstile-secret/, 'application client contains no backend secret material');

const roleDetail = read('assets/js/recruitment-role-detail.js');
assert.match(roleDetail, /applicationsEnabled===true/, 'role detail requires the public application switch');
assert.match(roleDetail, /role\.application\.enabled===true/, 'role detail also requires the role-level switch');
assert.doesNotMatch(roleDetail, /mailto:/, 'role details no longer route applications through email');

const headers = read('_headers');
assert.match(headers, /https:\/\/svrc26hk-recruit-fn-test\.azurewebsites\.net/, 'CSP permits only the configured recruitment Function host');
assert.match(headers, /https:\/\/svrc26hkcvtest\.blob\.core\.windows\.net/, 'CSP permits only the configured CV storage host');
assert.match(headers, /https:\/\/challenges\.cloudflare\.com/, 'CSP permits Turnstile');
assert.doesNotMatch(headers, /https:\/\/\*\.azurewebsites\.net|https:\/\/\*\.blob\.core\.windows\.net/, 'CSP does not use broad Azure wildcards');

assert.match(read('assets/js/site-config.js'), /careersOpenRolesEnabled: false/, 'legacy public careers flag remains disabled');
for (const slug of ['distressed-debt-investment-manager','legal-assistant']) {
  assert.doesNotMatch(read('sitemap.xml'), new RegExp(`https://shorevest\\.com/(?:cn/)?careers/${slug}/`), `${slug} clean routes remain absent from sitemap before activation`);
}
for (const f of ['api/recruitment/applicationValidation.js','api/recruitment/fileSignatures.js','api/recruitment/handler.js','api/recruitment/core/flows.js']) {
  assert.doesNotMatch(read(f), /applicationStatement|status: active|applicationEnabled|role\.files/, `${f} does not preserve the obsolete upload-through-API contract`);
}
console.log('recruitment static security checks passed');
