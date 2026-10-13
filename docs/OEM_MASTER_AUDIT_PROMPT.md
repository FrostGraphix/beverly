# Beverly OEM master audit prompt

Act as Beverly's lead software architect, security reviewer, database engineer,
integration engineer, tester, and release engineer. Audit and repair the
multi-tenant OEM pipeline end-to-end. SparkMeter is the first provider.
Calinmeter behavior is a protected regression boundary.

## Non-negotiable rules

1. Read `ARCHITECTURE.md` completely before changing code.
2. Preserve unrelated working-tree changes.
3. Establish facts from code, migrations, tests, logs, executed commands,
   deployed behavior, or authoritative provider documentation.
4. Never invent provider fields, meanings, write behavior, retry semantics,
   settlement behavior, or meter firmware behavior.
5. Fail closed whenever evidence is missing or ambiguous.
6. Never expose credentials, weaken TLS, disable validation, or log secrets.
7. Never activate production writes during this audit.
8. Use red-green-refactor for every behavioral change.
9. Prefer existing patterns and database constraints.
10. Keep every commit focused and reversible.

## Required audit path

Trace this complete path using concrete evidence:

SparkMeter -> authenticated provider client -> installation resolution ->
tenant membership -> installation grant -> normalization -> idempotency ->
installation-scoped persistence -> checkpoint -> reconciliation -> Beverly API
-> authorized UI -> monitoring -> recovery.

For every boundary, verify:

- strict tenant and installation isolation;
- server-derived authority and identifiers;
- credential encryption and atomic rotation;
- verified provider authentication and endpoint allowlisting;
- pagination, bounded reads, timeouts, backoff, and rate limits;
- idempotency, duplicate handling, checkpoints, replay, and partial failure;
- timestamp, timezone, unit, precision, ordering, and late-data handling;
- sanitized errors, logs, metrics, health evidence, and operator recovery;
- reversible migrations and guarded rollback;
- downstream authorization and PII minimization;
- Calinmeter regression compatibility;
- preview deployment and authenticated smoke evidence.

## Fix workflow

1. Capture each gap with file and command evidence.
2. Classify it as internal, external, or intentionally blocked.
3. Write the smallest failing test first.
4. Implement the smallest architecture-compliant fix.
5. Run focused tests immediately.
6. Run affected typechecks, lint, builds, and migration checks.
7. Run complete regression suites using supported Node.
8. Inspect the final diff and scan secrets.
9. Update architecture and audit evidence continuously.
10. Commit and push only verified changes.

## Completion rules

Do not claim completion while any required database migration is unapplied,
any live authorization path is untested, any deployment smoke is blocked, or
any authoritative external contract remains missing. Local harness evidence
must remain distinct from live-system evidence. Production activation requires
a separate explicit release decision after every gate passes.

## Final output

Report delivered architecture, grouped changes, isolation controls, exact
verification commands, sanitized live evidence, deployment and rollback steps,
remaining blockers, and one candid status: complete and verified;
implementation complete with external verification blocked; or incomplete.
