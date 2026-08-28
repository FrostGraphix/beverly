const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const login = fs.readFileSync(path.join(root, 'src/components/LoginPage.vue'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'src/styles/liquid-glass.css'), 'utf8');

assert.match(login, />Your Smart Power Partner\.<\/p>/);
assert.doesNotMatch(login, /Forgot password\?/);
assert.doesNotMatch(login, /forgotPassword\s*\(/);
assert.match(styles, /\.auth-page \.auth-card-sub\s*\{[^}]*text-transform:\s*none/s);
assert.match(styles, /@media \(max-width:\s*640px\)[\s\S]*\.auth-page \.auth-panel--right\s*\{[^}]*padding:\s*12px/s);
assert.match(styles, /@media \(max-width:\s*640px\)[\s\S]*\.auth-page \.auth-row\s*\{[^}]*flex-direction:\s*row/s);
assert.match(styles, /\.auth-page \.auth-row[^}]*white-space:\s*nowrap/s);

console.log('crm login mobile layout passed');
