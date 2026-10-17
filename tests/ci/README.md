# Disposable API integration environment

The `Isolated API contract tests` job starts a separate Supabase project on the GitHub runner. No hosted project is created, linked, restored or queried. It does not read `STAGING_API_BASE`, `STAGING_STAFF_TOKEN`, production backups, or repository secrets.

The job uses the repository's pinned CLI and Playwright dependencies. Its schema is a deliberately scoped synthetic fixture for the agreed health, authentication rejection, webhook signature rejection, signup validation and authenticated feature-flag HTTP contracts. The staff MFA and portal-session migrations are copied unchanged from the application migrations. This does **not** validate the complete migration history, ledger accounting, payments, UI flows, production deployment configuration or recovery.

Each run creates a random password and a synthetic Auth user, then obtains a genuine Supabase session through password authentication. JWT expiry is 600 seconds. A custom staff role gets only `wallet.flags.manage`, which is the existing permission required by feature-flag access; it is not a super-admin and the existing permission also permits flag management. There is no persistent staff token to rotate in GitHub. Keys/tokens are masked, traces are disabled, and no authentication artifacts are uploaded.

The real compiled API runs bound to loopback. The runner refuses non-loopback database/API addresses; the API fixture blocks external fetch destinations and redirects. No notification workers run. Payment provider integration is disabled and only a random, nonfunctional test-format signature key is supplied. The money-route switch is enabled **only in this disposable fixture** so invalid webhooks reach actual signature verification instead of returning a maintenance response. There are no financial rows or real provider credentials.

The stack and its synthetic records are removed by an `always()` cleanup step. GitHub-hosted runner disposal is the additional cleanup boundary on cancellation. CLI startup logs stay on that disposable runner; only sanitized error lines may be printed.

Local Docker is currently unavailable, so the full integration result must come from the hosted CI job. Test discovery and JavaScript syntax checks alone are not integration acceptance. A health-only check against an already-running local port during setup did not establish this fixture's correctness.

References: [Supabase CI testing](https://supabase.com/docs/guides/deployment/ci/testing), `backend/wallet/src/plugins/auth.ts`, `backend/wallet/src/routes/admin.ts`, `backend/wallet/src/services/portal-session.ts`, and the two canonical migrations named in the workflow.
