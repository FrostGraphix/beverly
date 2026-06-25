const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relPath) {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

function main() {
  const router = read('apps/customer/src/router/index.ts');
  const signup = read('apps/customer/src/views/Signup.vue');
  const login = read('apps/customer/src/views/Login.vue');
  const verify = read('apps/customer/src/views/Verify.vue');
  const recover = read('apps/customer/src/views/Recover.vue');
  const shell = read('apps/customer/src/components/CustomerAuthShell.vue');
  const styles = read('apps/customer/src/styles/app.css');

  assert(router.includes("path: '/signup'"));
  assert(router.includes("path: '/login'"));
  assert(router.includes("path: '/recover'"));
  assert(router.includes("path: '/verify'"));

  assert(shell.includes('title: string;'));
  assert(shell.includes('bw-auth-header'));
  assert(shell.includes('bw-auth-mark'));

  assert(signup.includes('Create account'));
  assert(signup.includes('Buy electricity tokens in seconds'));
  assert(signup.includes('CustomerAuthShell'));

  assert(login.includes('Customer Wallet'));
  assert(login.includes('Sign in to buy tokens and manage your wallet'));

  assert(recover.includes('Recover access'));
  assert(recover.includes('/api/v1/customer/auth/login'));

  assert(verify.includes('isRecovery'));
  assert(verify.includes("title: 'Enter your code'"));
  assert(verify.includes('Return to sign in'));

  assert(styles.includes('.bw-auth-header'));
  assert(styles.includes('.bw-auth-mark'));
  assert(styles.includes('.bw-auth-footer'));
  assert(styles.includes('.bw-auth-inline-link'));
}

main();
console.log('customer-auth-ui-contract ok');
