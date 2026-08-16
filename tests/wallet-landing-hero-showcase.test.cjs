const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const hero = fs.readFileSync(path.join(root, 'apps/wallet-landing/src/components/HeroSection.vue'), 'utf8');
const css = fs.readFileSync(path.join(root, 'apps/wallet-landing/src/styles/landing.css'), 'utf8');

assert.match(hero, /lp-hero-inner--showcase/);
assert.match(hero, /lp-hero-copy--poster/);
assert.match(hero, /Electricity,/);
assert.match(hero, /Live across 5 Nasarawa sites/);
assert.match(hero, /class="lp-device"/);
assert.match(hero, /lp-device-scene--showcase/);
assert.match(hero, /Enhanced Beverly Wallet device preview/);
assert.doesNotMatch(hero, /class="lp-phone"/);
assert.doesNotMatch(hero, /lp-phone-scene/);
assert.doesNotMatch(hero, /lp-phone-screen/);
assert.match(hero, /fastest way to buy prepaid electricity/);

assert.match(css, /\.lp-hero-inner--showcase/);
assert.match(css, /\.lp-hero-art--showcase/);
assert.match(css, /\.lp-hero-copy--poster/);
assert.match(css, /\.lp-device-frame/);
assert.match(css, /\.lp-device-token-code/);
assert.match(css, /\.lp-hero > \.lp-stats[\s\S]*display: none/);
assert.doesNotMatch(css, /\.lp-phone/);
assert.doesNotMatch(css, /lp-phone-screen/);
assert.match(css, /\[data-theme="light"\] \.lp-hero/);
assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.lp-device-scene--showcase \.lp-device/);

console.log('wallet landing hero showcase ok');
