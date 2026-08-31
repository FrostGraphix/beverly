const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

(async () => {
  const i18n = await import(pathToFileURL(path.join(root, 'packages/tokens/i18n.js')));

  for (const locale of ['en', 'yo', 'ha', 'ig']) {
    const options = i18n.getLanguageOptions(locale);
    assert.equal(options.length, 4, `${locale} must expose every supported language`);
    assert.ok(options.every((item) => item.nativeLabel && item.displayLabel),
      `${locale} language choices need native and localized names`);
  }

  assert.equal(i18n.translate('common.language', {}, 'yo'), 'Èdè');
  assert.equal(i18n.translate('refunds.totalRequests', {}, 'ha'), 'Dukkan buƙatu');
  assert.equal(i18n.translate('refunds.meterRefunds', {}, 'ig'), 'Nkwụghachi mita');
  assert.equal(i18n.getMissingTranslationKeys('yo').length, 0,
    'Yoruba catalog must match English');
  assert.equal(i18n.getMissingTranslationKeys('ha').length, 0,
    'Hausa catalog must match English');
  assert.equal(i18n.getMissingTranslationKeys('ig').length, 0,
    'Igbo catalog must match English');

  const switcher = read('packages/tokens/LanguageSwitcher.vue');
  assert.match(switcher, /item\.displayLabel/,
    'selector must show meaningful language names');
  assert.doesNotMatch(switcher, /compact \? item\.code\.toUpperCase\(\)/,
    'selector must not reduce languages to ambiguous codes');

  for (const portal of ['admin', 'vendor', 'customer']) {
    const shell = read(`apps/${portal}/src/components/AppShell.vue`);
    assert.match(shell, /useI18n/,
      `${portal} shell must react to locale changes`);
    assert.match(shell, /t\('common\.language'\)/,
      `${portal} shell language label must translate`);
  }

  const crmShell = read('src/App.vue');
  assert.match(crmShell, /translate\(/,
    'CRM shell must use shared translations');
  assert.equal((crmShell.match(/<LanguageSwitcher compact/g) || []).length, 1,
    'CRM must expose one language selector');
  assert.match(crmShell, /bw-user-dropdown-brand[\s\S]*bw-user-menu-language[\s\S]*<LanguageSwitcher compact/,
    'CRM language selector must live inside the avatar dropdown');

  const refunds = read('apps/admin/src/views/Refunds.vue');
  assert.match(refunds, /useI18n/,
    'refunds must react to locale changes');
  assert.match(refunds, /t\('refunds\.totalRequests'\)/,
    'refund summary must translate');

  console.log('localization experience contract passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
