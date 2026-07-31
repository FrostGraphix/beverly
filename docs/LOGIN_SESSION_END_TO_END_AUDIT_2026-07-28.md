# Beverly login and session audit — 2026-07-28

## Verdict

The sign-in form itself is visually clear and structurally sound, but the session-expiry path is unhealthy. A terminal `401 Invalid session` is treated as refreshable, then dashboard fallback calls continue after redirecting to login. This explains the provided console cascade. Password recovery is also not a recovery flow.

## Scope and evidence

- Live production sign-in page at `https://beverly.acoblighting.com/#/login`.
- User-provided production screenshot showing `401`, refresh `400`, and gateway-health `502` responses.
- Current frontend and server session code.
- Live empty-form validation and forgot-password behavior.
- Existing auth, service-layer, flow, and hardening checks.

No valid credential was available in the audit browser, so successful login, MFA, OEM selection, and the authenticated dashboard could not be exercised live. The supplied password was masked and was not recovered or reused.

## Flow health

1. **Open sign-in — Healthy.** Clear hierarchy, labeled controls, password visibility control, visible keyboard focus, and 44–48 px primary targets.
2. **Submit empty form — Needs improvement.** Errors are visible and focus moves to the first invalid field, but fields do not expose explicit `aria-invalid` or `aria-describedby` relationships.
3. **Request password help — Unhealthy.** The control produces a red “Sign in failed” alert telling the user to contact an administrator. It provides no recovery action or contact route and leaves stale field errors visible.
4. **Resume or expire a session — Unhealthy.** A terminal invalid session triggers an unnecessary refresh attempt, redirect, and late protected calls from the dashboard fallback phase.
5. **Load dashboard and gateway health — Degraded.** Dashboard fallback requests continue after auth loss; gateway health synchronously depends on the live gateway read and returns `502` when that dependency fails.

## Ranked findings

### P1 — Protected requests continue after terminal auth failure

`fetchDashboardData()` converts every first-phase failure to `null`, then interprets the missing data as a reason to start `/dashboard/hourly`, `/dashboard/gprs`, and `/token/creditTokenRecord/readMore`. It does not re-check session state before that second phase. This exactly matches the three late `401` requests in the supplied screenshot.

- `src/services/dashboard-service.mjs:91-140`
- `src/components/DashboardPage.vue:193-209`
- `src/services/oem-prefetch.mjs:29-66`

Minimal correction: only enter the fallback phase while `readSessionState()` is still present, and stop queued OEM warm tasks once it disappears. Add one behavioral test proving that no second-phase call starts after a terminal `401`.

### P1 — All 401 responses are treated as refreshable

The response interceptor calls `refreshSession()` for every first `401`, including `Invalid session`. The server intentionally clears `bev_token`, `bev_refresh`, and `bev_session` for an invalid CRM session, so the subsequent refresh has no credential and returns `400 refreshToken required`. This is expected server behavior paired with incorrect client classification.

- `src/services/api.js:144-168`
- `api/reference.js:181-242`
- `api/reference.js:3616-3624`

Minimal correction: treat server-session terminal reasons (`Invalid session`, idle timeout, absolute timeout, server session required) as non-refreshable. Clear local state and redirect once; refresh only an upstream access-token `401` while the CRM session is still valid.

### P1 — “Forgot password?” is not a recovery flow

The button only replaces the form error with “Contact your Beverly administrator,” while the alert heading remains “Sign in failed.” There is no contact link, recovery request, or actionable next step.

- `src/components/LoginPage.vue:25-40`
- `src/components/LoginPage.vue:251-256`

Minimum viable fix: rename it to “Need sign-in help?” and provide a real administrator contact action. Add self-service reset only when the backend supports it.

### P2 — Gateway status polling couples the UI to a heavy synchronous operation

Every bell refresh invokes a live gateway read, state reconciliation, persistence, and incident dispatch before responding. A live-read failure becomes a `502`, which is what the supplied screenshot shows. Unmounting stops future polling but does not cancel the request already in flight.

- `src/components/StationAlertsBell.vue:253-260`
- `api/reference.js:4433-4477`
- `backend/src/services/gateway-health-service.js:327-470`

Serve the last persisted health summary to the bell and run reconciliation on the existing background path. Until then, pass an abort signal and suppress expected cancellation noise.

### P2 — The advertised silent dashboard mode is ignored

Dashboard calls pass `{ silent: true }`, but `getApi()` and `postApi()` do not preserve or honor it, and the interceptor records every failed sibling request. This turns one auth event into console and telemetry noise.

- `src/services/dashboard-service.mjs:95`
- `src/services/api.js:165-169`
- `src/services/api.js:305-322`

Honor `silent` for expected fallback/cancellation failures while retaining one terminal-session event.

### P2 — “Remember me” overpromises

The checkbox only stores the username/email. It does not remember the authenticated session.

- `src/components/LoginPage.vue:103`
- `src/components/LoginPage.vue:172-199`

Rename it to “Remember email.”

### P2 — Validation state needs explicit assistive-technology wiring

Visible labels, `role="alert"`, focus movement, and target sizes are good. However, invalid inputs do not set `aria-invalid`, and error text has no stable ID referenced through `aria-describedby`. Wrapping the error in the label may be announced inconsistently.

- `src/components/LoginPage.vue:58-99`
- `src/components/base/BaseInput.vue:1-8`

Add explicit invalid state and description IDs. Keyboard and screen-reader testing is still required; screenshots and DOM inspection cannot establish WCAG conformance.

### P3 — Unused fixed verification field

The login form carries a hidden fixed `verifycode: "s3b9"`, but the submitted login payload excludes it and no other code references it.

- `src/components/LoginPage.vue:14`
- `src/components/LoginPage.vue:167`

Delete both lines. Net: -2 lines, -0 dependencies.

## Test result

- `npm run test:auth` — passed.
- `tests/service-layer.test.mjs` — passed.
- `npm run flow:audit` — 11/11 passed.
- `npm run hardening:audit` — 16/16 passed.

These checks do not cover the failing sequence: concurrent protected calls → terminal `401` → redirect → zero later protected calls.

## Recommended order

1. Classify terminal session responses and redirect once without refresh.
2. Stop dashboard fallback and queued OEM warming when local session state is cleared.
3. Add the missing behavioral regression test.
4. Make password help actionable and rename “Remember me.”
5. Decouple gateway-health reads from reconciliation and persistence.
6. Add explicit accessible invalid-state wiring.
