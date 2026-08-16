const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const tokenRuntime = read('packages/tokens/index.js');
const greetingComponent = read('packages/tokens/WalletGreeting.vue');

assert.match(tokenRuntime, /morning:[\s\S]*english: 'Good morning'[\s\S]*yoruba: 'E kaaro'[\s\S]*hausa: 'Ina kwana'/);
assert.match(tokenRuntime, /afternoon:[\s\S]*english: 'Good afternoon'[\s\S]*yoruba: 'E kaasan'[\s\S]*hausa: 'Ina wuni'/);
assert.match(tokenRuntime, /night:[\s\S]*english: 'Good night'[\s\S]*yoruba: 'E ku ale'[\s\S]*hausa: 'Barka da dare'/);
assert.match(tokenRuntime, /morning:[\s\S]*igbo: 'Ụtụtụ ọma'/);
assert.match(tokenRuntime, /afternoon:[\s\S]*igbo: 'Ehihie ọma'/);
assert.match(tokenRuntime, /night:[\s\S]*igbo: 'Mgbede ọma'/);
assert.match(greetingComponent, /greeting\.value\.igbo/);

const handCount =
  (greetingComponent.match(/👋/gu) || []).length +
  (greetingComponent.match(/ðŸ‘‹/gu) || []).length;
assert.equal(handCount, 1, 'WalletGreeting should render exactly one waving hand emoji.');
assert.match(greetingComponent, /setInterval\([\s\S]*3000/);
assert.match(greetingComponent, /activeGreeting/);
assert.match(greetingComponent, /props\.name/);
assert.match(greetingComponent, /<Transition name="bw-greeting-slide" mode="out-in">/);
assert.doesNotMatch(greetingComponent, /bw-greeting-top/);
assert.doesNotMatch(greetingComponent, /bw-greeting-kicker/);
assert.doesNotMatch(greetingComponent, /bw-greeting-languages/);
assert.doesNotMatch(greetingComponent, /bw-greeting-foot/);

for (const dashboard of [
  'apps/admin/src/views/Dashboard.vue',
  'apps/vendor/src/views/Dashboard.vue',
  'apps/customer/src/views/Home.vue',
]) {
  const source = read(dashboard);
  assert.match(source, /@beverly\/tokens\/WalletGreeting\.vue/, `${dashboard} should use the shared greeting component.`);
  assert.match(source, /<WalletGreeting/, `${dashboard} should render the shared greeting component.`);
}

console.log('wallet greeting contract ok');
