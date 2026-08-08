const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
// Public launch: approved role pages are visible and both approved roles use the secure online application flow.
function read(f){return fs.readFileSync(path.join(root,f),'utf8');}

const rolePages = [
  'careers/distressed-debt-investment-manager.html',
  'careers/distressed-debt-investment-manager_cn.html',
  'careers/legal-assistant.html',
  'careers/legal-assistant_cn.html'
];
const applicationPages = ['careers/apply.html','careers/apply_cn.html'];
const manifest = JSON.parse(read('assets/data/recruitment/roles.v1.json'));
const publicConfig = JSON.parse(read('assets/data/recruitment/public-config.json'));

assert.strictEqual(publicConfig.openRolesEnabled, true, 'approved Open Roles are publicly visible');
assert.strictEqual(publicConfig.applicationsEnabled, true, 'the dedicated application page is enabled');
assert.strictEqual(publicConfig.turnstileSiteKey, '0x4AAAAAAEJh3KNuIlG3ZdgM', 'only the public Turnstile site key is published');
assert.strictEqual(publicConfig.apiBase, 'https://svrc26hk-recruit-fn-test.azurewebsites.net/api/recruitment');
assert.strictEqual(publicConfig.turnstileAction, 'recruitment-application');
assert.ok(!Object.keys(publicConfig).some(k => /secret/i.test(k)), 'public config contains no secret field');

for (const role of manifest.roles) {
  assert.strictEqual(role.status, 'published', `${role.id} source content remains approved`);
  assert.strictEqual(role.contentReviewRequired, false, `${role.id} content review is cleared`);
  assert.strictEqual(role.contentReviewNote, '', `${role.id} note is cleared`);
  assert.strictEqual(role.application.enabled, true, `${role.id} accepts online applications`);
  assert.strictEqual(role.application.privacyNoticeVersion, '2026-08-08-v1', `${role.id} uses the approved privacy version`);
}
assert.strictEqual(manifest.roles.filter(role => role.application.enabled === true).length, 2, 'both approved roles accept online applications');

for (const f of rolePages) {
  const s = read(f);
  assert.match(s, /<script[^>]+application\/ld\+json[^>]*>[\s\S]*JobPosting/i, `${f} preserves approved JobPosting source content`);
  assert.doesNotMatch(s, /<form\b|type=["']file["']/i, `${f} does not embed the application form`);
  assert.doesNotMatch(s, /baseSalary|salary|compensation|jobBenefits|validThrough|applicantLocationRequirements|TELECOMMUTE/i, `${f} does not invent employment terms`);
}

for (const f of applicationPages) {
  const s = read(f);
  assert.match(s, /noindex, nofollow, noarchive/, `${f} remains excluded from search indexing`);
  assert.match(s, /data-application-form/, `${f} contains the application form`);
  assert.match(s, /type="file"/, `${f} contains one CV file input`);
  assert.match(s, /data-turnstile/, `${f} contains the Turnstile mount`);
  assert.match(s, /challenges\.cloudflare\.com\/turnstile/, `${f} loads Turnstile from the approved origin`);
  assert.doesNotMatch(s, /mailto:|hr@shorevest\.com/i, `${f} does not send applications by email`);
  assert.doesNotMatch(s, /data-recruitment-mock|fake success|localStorage|sessionStorage|indexedDB/i, `${f} does not contain a production mock or browser persistence`);
}

assert.strictEqual(fs.existsSync(path.join(root, 'careers/application-test-20260808.html')), false, 'temporary application test page is removed');
assert.strictEqual(fs.existsSync(path.join(root, 'assets/js/recruitment-test-diagnostic.js')), false, 'temporary recruitment diagnostic client is removed');

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

assert.match(read('assets/js/site-config.js'), /careersOpenRolesEnabled: true/, 'legacy public Careers route flag is aligned with the launch state');
for (const f of ['api/recruitment/applicationValidation.js','api/recruitment/fileSignatures.js','api/recruitment/handler.js','api/recruitment/core/flows.js']) {
  assert.doesNotMatch(read(f), /applicationStatement|status: active|applicationEnabled|role\.files/, `${f} does not preserve the obsolete upload-through-API contract`);
}
console.log('recruitment static security checks passed');
