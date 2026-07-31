# Beverly login/session re-audit — 2026-07-28

## Corrected verdict

The initiating fault is confirmed: production cannot decrypt the OEM credentials because `OEM_CREDENTIALS_ENCRYPTION_KEY` is missing. The live proxy consequently authenticates upstream reads incorrectly; Calinmeter returns `401` for `/api/token/creditTokenRecord/readMore` and `/api/gateway/read`.

The frontend then mistakes the upstream service's `401` for the Beverly user's own session expiring. It attempts `/api/auth/refresh`; when that fails, it clears the Beverly session and redirects to login.

Therefore this is **not primarily a user-password or ordinary idle-session problem**. It is an upstream OEM-credential configuration failure combined with incorrect `401` status propagation.

## Evidence

1. The 16:41 screenshot uses the older `index-Cfgo_mS1.js` bundle. It shows gateway health `502`, credit-token `401`, refresh failure, and redirect to login.
2. The 17:21 screenshot uses the newer `index-Cso4CeCn.js` bundle. It shows repeated credit-token `401` responses while the dashboard remains visible, demonstrating that the prefetch-isolation fix reduced the damage but did not repair upstream authentication.
3. The current in-app browser initially had a valid authenticated dashboard. After reload, the authenticated OEM Hub appeared. Entering the Calinmeter workspace rendered the dashboard, then redirected to login within about five seconds.
4. Vercel production logs for deployment `dpl_BWVPWNvDXaY7XCExa8s3kNhL9AHb` repeatedly show:
   - `[oem-credential-crypto] decrypt failed OEM_CREDENTIALS_ENCRYPTION_KEY is required to store OEM credentials in production`
   - `[live-auth-failure] {"pathname":"/api/token/creditTokenRecord/readMore", ... "status":401}`
   - `[live-auth-failure] {"pathname":"/api/gateway/read", ... "status":401}`
   - `[gateway-health] Live gateway read failed`
5. The live proxy explicitly forwards upstream `401/403` responses as browser `401/403` responses (`api/reference.js:4130-4191`). The Axios interceptor treats browser `401` as a Beverly session problem (`src/services/api.js:144-177`).

## Flow health

1. **Beverly authentication — Initially healthy.** The session was valid enough to load `/auth/me`, the OEM Hub, and the selected dashboard.
2. **OEM credential resolution — Failed.** The production encryption key is missing, so stored OEM credentials cannot be decrypted.
3. **Upstream token/gateway reads — Failed.** Calinmeter rejects the resulting authentication with `401`.
4. **Proxy status translation — Failed.** Upstream dependency authentication is returned as if the Beverly user were unauthorized.
5. **Client recovery — Failed.** The app refreshes or clears the user's session because it cannot distinguish upstream auth from user-session auth.
6. **Post-fix OEM prefetch isolation — Improved but incomplete.** Commit `4bea33e4` isolates background prefetch failures and gates fallbacks after local session loss; the current smoke test only asserts exports exist and does not simulate the failure chain.
7. **Gateway-health fallback — Misleading.** The new handler converts the failed live read to `200` with an empty list. The bell ignores `meta.warning`, which can make unavailable monitoring look like “no outages.”

## Required remediation order

1. Restore `OEM_CREDENTIALS_ENCRYPTION_KEY` in Vercel Production using the **same key that encrypted the existing OEM credential rows**. A new random key will not decrypt them. If the original key is unavailable, rotate by re-entering/re-encrypting the OEM credentials under a new key. The wallet backend must use the same value.
2. Redeploy, then verify `/api/token/creditTokenRecord/readMore` and `/api/gateway/read` return successful upstream responses.
3. In `proxyLive()`, translate upstream `401/403` into a dependency failure such as `502` or `503` with a machine-readable `UPSTREAM_AUTH_FAILURE` code. Never send an upstream-auth `401` to the browser.
4. Make the client refresh only responses explicitly classified as Beverly session failures.
5. Replace `tests/oem-prefetch-isolation.test.cjs` with a behavioral regression: valid Beverly session + upstream `401` must not call `/api/auth/refresh`, clear session state, or navigate to login.
6. Add `OEM_CREDENTIALS_ENCRYPTION_KEY` to production environment validation and deployment preflight.
7. Preserve last-known gateway alerts and show “Gateway status unavailable” when `meta.warning` is present; do not present an empty fallback as healthy.

## Checks

- `npm run test:auth` — passed.
- `tests/oem-prefetch-isolation.test.cjs` — passed, but is only an export smoke test.
- `tests/service-layer.test.mjs` — passed.

These passing checks do not cover missing production OEM encryption configuration or upstream-401 status translation.
