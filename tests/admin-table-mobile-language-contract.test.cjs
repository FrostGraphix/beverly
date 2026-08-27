const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const history = read('apps/admin/src/views/FundingHistory.vue');
const funding = read('apps/admin/src/views/Funding.vue');
const audit = read('apps/admin/src/views/Audit.vue');

for (const [name, source] of Object.entries({ history, funding, audit })) {
  assert.match(source, /WalletDataViewSwitch/, `${name} must expose shared table views`);
  assert.match(source, /WalletTablePagination/, `${name} must expose shared pagination`);
  assert.match(source, /bw-data-region/, `${name} must use the shared responsive data region`);
}

assert.doesNotMatch(history, /Force table layout on all breakpoints/,
  'funding history must not suppress mobile cards');
assert.doesNotMatch(history, /\.fh-table-always \.bw-t-cards\s*\{\s*display:\s*none/,
  'funding history cards must remain available');
assert.match(history, /v-for="f in paginatedItems"/,
  'funding history must paginate rendered records');
assert.match(history, /aria-controls="funding-history-filter-panel"/,
  'funding history must expose one filter control');
assert.match(history, /v-if="showFilters"[^>]+id="funding-history-filter-panel"/,
  'funding history filters must remain collapsed initially');
assert.doesNotMatch(history, /class="fh-toolbar"/,
  'funding history must not render an always-open filter toolbar');
assert.match(funding, /Search funding requests/,
  'funding queue must include search filtering');
assert.match(funding, /Filter funding channel/,
  'funding queue must include channel filtering');
assert.match(audit, /aria-controls="audit-log-filter-panel"/,
  'audit log must expose one filter control');
assert.match(audit, /v-if="showAuditFilters"[^>]+id="audit-log-filter-panel"/,
  'audit log filters must remain collapsed initially');
assert.match(audit, /aria-controls="security-event-filter-panel"/,
  'security events must expose one filter control');
assert.match(audit, /v-if="showSecurityFilters"[^>]+id="security-event-filter-panel"/,
  'security filters must remain collapsed initially');
assert.match(audit, /label="Security events display view"/,
  'security events must expose shared table views');
assert.match(audit, /v-for="e in pagedSecurityEvents"/,
  'security events must paginate rendered records');
assert.match(audit, /item-label="security events"/,
  'security events must expose shared pagination');
assert.match(audit, /:data-view="securityViewMode"/,
  'security events must use the shared responsive data region');

for (const portal of ['admin', 'vendor', 'customer']) {
  const shell = read(`apps/${portal}/src/components/AppShell.vue`);
  const accountMenuStart = shell.indexOf('class="bw-account-menu');
  const topbar = shell.slice(shell.indexOf('<header'), accountMenuStart);
  const menu = shell.slice(shell.indexOf('class="bw-user-dropdown"'));
  assert.doesNotMatch(topbar, /LanguageSwitcher/, `${portal} topbar must omit language controls`);
  assert.match(menu, /LanguageSwitcher/, `${portal} account menu must include language controls`);
}

console.log('admin mobile table and language contract passed');
