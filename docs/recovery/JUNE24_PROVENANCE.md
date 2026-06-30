# June 24 Recovery Provenance

## Recovery target

This branch reconstructs the verified June 24 worktree. The cutoff is 23:59 in Africa/Lagos.

The branch starts from `7bdb44a`. Its source tree is replaced selectively by the authoritative June 24 stash tree, `c3e083a5`.

## Evidence precedence

1. Verified transcript patches before cutoff.
2. The tracked stash tree, `c3e083a5`.
3. Selected functional files from `c3e083a5^3`.
4. The committed baseline, `7bdb44a`.

## Transcript restorations

- `019ee3d6-8674-7360-a364-c1ab1fb89b0b`, at `15:21:57Z`: meter-order and protected-preview tests.
- `019ee3df-dbc3-7460-a687-07b03247eee6`, at `15:22:57Z`: breadcrumb and header geometry.
- `019ee3df-dbc3-7460-a687-07b03247eee6`, at `15:26:43Z`: collapsible sidebar groups and icon families.

## Functional restorations

- Meter-order transition validation.
- Customer idempotency requirements.
- Atomic payment confirmation.
- Deterministic meter-order references.
- Complete admin interfaces.
- Complete developer-console interfaces.
- Complete mobile action menus.
- Vercel-aligned reports.
- Protected preview preflight checks.
- VAT and webhook-retention modules.

## Excluded evidence

- Antigravity placeholders.
- Runtime database debris.
- Generated logs and screenshots.
- Scratch scripts and generated PDFs.
- Unmerged Claude changes.
- June 25 remediation changes.

The later two-theme patch remains excluded. The approved recovery plan explicitly retains four theme modes.

## Deterministic repairs

An unused VAT import was removed. The import referenced no June 24 route implementation.

Three dashboard template fields were aligned. Their computed model already used camel-case names.

## Final verification repairs

- Meter-order requests now use atomic idempotency claims.
- Customer replays preserve payment authorization responses.
- Admin and vendor references are deterministic.
- Runtime VAT policies now drive every purchase preview.
- VAT policy approvals enforce maker-checker separation.
- VAT policy changes produce audit records.
- The notification panel now layers correctly on mobile.
- Direct bell and panel browser coverage was added.
- Tracked runtime artifacts match the mainline versions.
- Backend verification now passes one hundred tests.
- The complete recovery smoke suite passes.

## Safety controls

The original dirty worktree remains untouched. Recovery uses a separate worktree.

No force-push is permitted. Production promotion requires explicit visual approval.

The external evidence vault contains repository archives, Git archives, reflogs, unreachable-object listings, working-tree patches, and SHA-256 checksums.

The recovery preview uses branch-scoped demo authentication. Vercel deployment protection remains enabled.
