const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('shared language runtime supports Nigerian locales', async () => {
  const i18n = await import(pathToFileURL(path.join(root, 'packages/tokens/i18n.js')).href);
  assert.deepEqual(i18n.SUPPORTED_LOCALES.map(({ code }) => code), ['en', 'yo', 'ha', 'ig']);
  assert.equal(i18n.resolveLocale('yo-NG'), 'yo');
  assert.equal(i18n.resolveLocale('fr-FR'), 'en');
  assert.equal(i18n.translate('common.getStarted', {}, 'ha'), 'Fara amfani');
  assert.equal(i18n.translate('missing.key', {}, 'ig'), 'missing.key');
});

test('every frontend initializes shared language state', () => {
  const entries = [
    'src/main.js',
    'apps/admin/src/main.ts',
    'apps/customer/src/main.ts',
    'apps/vendor/src/main.ts',
    'apps/wallet-landing/src/main.ts',
  ];
  for (const entry of entries) assert.match(read(entry), /initLocale\(\)/, entry);
});

test('every portal exposes language selection', () => {
  const shells = [
    'src/App.vue',
    'apps/admin/src/components/AppShell.vue',
    'apps/customer/src/components/AppShell.vue',
    'apps/vendor/src/components/AppShell.vue',
    'apps/wallet-landing/src/components/LandingNav.vue',
  ];
  for (const shell of shells) assert.match(read(shell), /LanguageSwitcher/, shell);
});

test('landing removes unsupported marketing claims', () => {
  const content = read('apps/wallet-landing/src/content.ts');
  const testimonials = read('apps/wallet-landing/src/components/TestimonialsSection.vue');
  const trust = read('apps/wallet-landing/src/components/TrustSection.vue');
  assert.doesNotMatch(content, /72K\+|45K\+|500\+|any disco/i);
  assert.doesNotMatch(testimonials, /Trusted by thousands|Adaeze Okafor/);
  assert.doesNotMatch(trust, /99\.9% uptime|financial-grade standards/i);
});

test('mobile landing prioritizes value proposition', () => {
  const css = read('apps/wallet-landing/src/styles/landing.css');
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.lp-hero-copy\s*\{[^}]*order:\s*-1/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.lp-hero-art\s*\{[^}]*order:\s*initial/);
});

test('authenticated locale preference persists safely', () => {
  const migration = read('supabase/migrations/20260826170000_user_locale_preferences.sql');
  const routes = read('backend/wallet/src/routes/locale-preferences.ts');
  const routeIndex = read('backend/wallet/src/routes/index.ts');
  const policy = read('backend/wallet/src/contracts/route-policy.ts');
  assert.match(migration, /check \(locale in \('en', 'yo', 'ha', 'ig'\)\)/i);
  assert.match(migration, /enable row level security/i);
  assert.match(routes, /requireAuth\(\)/);
  assert.match(routes, /LocaleSchema\.safeParse/);
  assert.match(routeIndex, /localePreferenceRoutes/);
  assert.match(policy, /put\('\/api\/v1\/preferences\/locale'\)/);
});
