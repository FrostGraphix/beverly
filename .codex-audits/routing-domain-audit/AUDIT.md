# Beverly routing audit

Date: 2026-08-21

## Confirmed outcome

`https://acob-beverly.vercel.app/wallet` returns a server-side `308` redirect to `https://beverly.acoblighting.com/wallet`.

The target then redirects to `/wallet/` and serves the Beverly CRM deployment. The browser reaches the CRM sign-in screen before any wallet client-side router can run.

## Remediation status

Fixed and deployed on 2026-08-21.

- Removed both cross-domain host redirects.
- Canonicalized wallet callbacks on `acob-beverly.vercel.app`.
- Added the missing vendor reset-link origin.
- Updated backend defaults and deployment examples.
- Replaced the regression-preserving routing test.
- Deployed production as `dpl_Fuk7ZM9oz5gUMAi6cRF2GaHJ5xvK`.
- Verified landing, vendor, customer, admin, forgot-password, and health routes.
- Confirmed every verified route remains on `acob-beverly.vercel.app`.

## Root cause

The first redirect in `vercel.json` and `vercel.preview.json` matches every path on `acob-beverly.vercel.app` and permanently redirects that traffic to `beverly.acoblighting.com`.

Vercel redirects execute before rewrites. Therefore, the later `/wallet` rewrite to `/wallet/index.html` never runs on the public Vercel alias.

The redirect was introduced by commit `c9a11f62` on 2026-08-21. The same commit added a passing test that explicitly requires this redirect, so automated checks currently preserve the defect.

## Network evidence

- Source response: `308 Permanent Redirect`
- Source location: `https://beverly.acoblighting.com/wallet`
- Target response: `308` to `/wallet/`, then `200`
- Both responses identify Vercel
- Source cache policy: `public, max-age=0, must-revalidate`
- Target DNS: `19c01398522b8469.vercel-dns-017.com`

## Browser evidence

- Final production URL: `https://beverly.acoblighting.com/wallet`
- Visible result: Beverly CRM sign-in
- Production console: no redirect errors
- Local `/wallet`: correct wallet landing
- Local console: unrelated FedCM warning only

## Configuration evidence

- `vercel.json:75` contains the global host redirect.
- `vercel.preview.json:15` duplicates it.
- `vercel.json:105-107` contains correct wallet rewrites.
- `vercel.json:7-12` hardcodes CRM-domain callbacks.
- `tests/vercel-config.test.cjs:101-108` requires the redirect.
- `apps/wallet-landing/src/portals.ts:22-27` uses healthy same-origin production routes.

## Deployment evidence

The current Beverly project lists `evcng.com`. It does not list `beverly.acoblighting.com`. The custom hostname therefore does not resolve through the intended project configuration inspected here.

## Recommended correction

1. Remove both global host redirects.
2. Choose one canonical wallet hostname.
3. Attach that hostname correctly.
4. Replace hardcoded callback origins.
5. Update the redirect contract test.
6. Add external routing tests.
7. Redeploy production and preview.
8. Recheck every portal path.

## Evidence limits

The latest unique deployment requires Vercel authentication. It could not be visually inspected. The public alias, custom domain, local build, repository configuration, tests, DNS, and HTTP responses were inspected directly.

## Screenshots

- `01-vercel-wallet-redirects-to-crm-safe.png`
- `02-expected-wallet-landing-local.png`
- `03-production-wallet-routing-fixed.png`
