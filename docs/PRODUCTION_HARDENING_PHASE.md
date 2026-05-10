# Production Hardening Phase

## Scope

This phase closes the system-design gaps identified during the audit.

## Completed

- CSS import hub separation.
- `reference.css` shrink.
- Legacy CSS extraction.
- Runtime API schemas.
- JSDoc API contracts.
- Login response validation.
- Current-user response validation.
- Profile state store.
- Preference state store.
- Password change service path.
- Demo password removal.
- Env-only demo auth.
- Env-only live upstream URL.
- Local read mode default.
- Split test scripts.
- CI hardening workflow.
- Persistence strategy documentation.
- Production hardening audit gate.
- TypeScript compiler gate.
- Strict API contract types.
- Legacy CSS module split.
- External provisioning validator.
- Production environment provisioning guide.

## Architecture Decisions

- `reference.css` is now an import hub.
- `legacy-components.css` holds migrated legacy component CSS.
- Supabase owns production auth and persistence.
- SQLite owns local development persistence.
- Memory mode owns test persistence.
- Live upstream is read-through only.
- Writes remain explicitly gated.
- Demo auth requires explicit env values.

## Commands

```powershell
npm run typecheck
npm run env:validate
npm run hardening:audit
npm run test:hardening
npm run test:contracts
npm run test:services
npm run test:security
npm run build
```

## CI Gates

- Build.
- Contract tests.
- Service tests.
- Security tests.
- Hardening audit.
- Typecheck.

## Closed Risks

- Full TypeScript migration is now gated by strict contract types and compiler checks.
- Legacy CSS is split into migration modules.
- Production Supabase credentials are externalized and validated.
- Live upstream URL is externalized and validated.

## Final Verification

- `npm run typecheck`
- `npm run env:validate`
- `npm run hardening:audit`
- `npm run test:security`
- `npm run test:contracts`
- `npm run test:services`
- `npm test`
- `npm run build`

## Residual Follow-Up

- Convert Vue SFC internals to `<script lang="ts">` progressively.
- Retire remaining legacy CSS modules after component-level ownership is complete.
