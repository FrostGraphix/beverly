# Beverly same-origin routing fix

Date: 2026-08-30

## Confirmed production defect

- `https://beverly.acoblighting.com/` returned `200` and stayed on the custom hostname.
- `https://beverly.acoblighting.com/dashboard` navigated to `https://acob-beverly.vercel.app/wallet/`.
- `https://beverly.acoblighting.com/wallet` returned `307` with the Vercel wallet URL in `Location`.
- Browser console errors were absent because Vercel performed the redirect before application code ran.

## Root cause

Commit `614cc7d4` added host-conditioned redirects in `vercel.json`. Those rules moved wallet routes, aliases, and unknown path routes from `beverly.acoblighting.com` to `acob-beverly.vercel.app`. `tests/vercel-config.test.cjs` explicitly required the cross-origin behavior.

## Implemented correction

- Removed every redirect conditioned on `beverly.acoblighting.com`.
- Preserved same-origin wallet, admin, vendor, customer, and fallback rewrites.
- Replaced the cross-origin test contract with same-origin assertions.
- Preserved the independent Vercel alias and portal-host routing.

## Verification

- Red test reproduced the cross-origin defect.
- Updated Vercel configuration contract passed.
- Domain fallback contract passed.
- Canonical wallet routing contract passed.
- Portal isolation contract passed.
- Vercel production contract passed.
- Deployment preflight passed without warnings.
- Type checking passed.
- Full production build passed.

## Deployment status

Deployed and promoted to production on 2026-08-31.

- Deployment: `dpl_6T9cSeK16Zc4DfuXSoCXc9MwDezA`
- Status: `Ready`
- `https://beverly.acoblighting.com/dashboard` returns `200` without leaving the hostname.
- `/wallet` redirects only to the same-origin `/wallet/` path.
- Wallet, admin, vendor, and customer portal paths return `200`.
- `https://beverly.acoblighting.com/api/v1/health` returns `200`.
- Browser verification ended on `https://beverly.acoblighting.com/dashboard`.
- Browser console contained no warnings or errors.
- Post-deploy Vercel error scan returned no logs.
