# Beverly CRM Smoke Report

Date: 2026-05-16

## Scope

- Core CRM shell and login.
- Dashboard charts and counters.
- Token generate and token records.
- Remote reading, control, and token tasks.
- Reports and consumption pages.
- Management and administration tables.
- Protocol and remote support pages.
- Wallet admin and vendor wallet pages.
- Auth, RBAC, session, guard, storage, and API proxy flows.

## Concrete Fixes

- Replaced Vue 2 `beforeDestroy` hooks with Vue 3 `beforeUnmount`.
- Restored login portal switching with `BaseButton` primitives.
- Updated theme contract ownership from Profile to Settings.
- Added guarded-write normalization for stale 403 messages.
- Added full-route browser smoke coverage for all admin and vendor routes.

## Smoke Results

- `npm.cmd test`: passed.
- `npm.cmd run build`: passed.
- `npm.cmd run test:browser`: passed.
- `npm.cmd run test:wallet`: passed.
- `npm.cmd run test:visual:audit`: passed.
- `node tests\guarded-write.test.mjs`: passed.
- `node tests\full-crm-browser-smoke.test.cjs`: passed.

## Route Coverage

- Admin routes visited: 57.
- Vendor routes visited: 4.
- Total browser-smoked routes: 61.
- Browser console errors: 0.

## Remaining Risk

- Vite still reports large chunks after minification.
- Local smoke ran on installed browser runtimes only.
- Worktree still contains unrelated dirty files.
