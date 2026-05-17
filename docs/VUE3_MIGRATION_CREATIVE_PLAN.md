# Vue 3 Migration Creative Plan

## Architecture Read

Root `ARCHITECTURE.md` is canonical.

Current frontend boots Vue 3.

`src/App.vue` owns shell routing.

`TablePage.vue` owns generic routes.

Services own business behavior.

Base components stay visual.

Styles use token layers.

Legacy CSS is temporary.

No conflict found.

## Target

Migrate Beverly to Vue 3.

Keep Vite as bundler.

Replace Vuex with Pinia.

Upgrade router to v4.

Preserve API contracts.

Preserve route parity.

Preserve write gates.

Preserve design tokens.

## Why This Path

Smallest safe leap.

Lowest rewrite risk.

Highest code reuse.

Modern ecosystem path.

Better long-term support.

Cleaner state ownership.

Stronger test future.

## Migration Thesis

Treat migration as renewal.

Not a naked upgrade.

Keep operator confidence.

Upgrade hidden foundations.

Sharpen visible surfaces.

Move legacy into primitives.

Cut risk by islands.

## North Star

Beverly becomes command-grade.

Fast under pressure.

Dense but readable.

Modern but familiar.

Safer around writes.

Cleaner for maintainers.

## Phase 0

Freeze current behavior.

Capture route matrix.

Capture key screenshots.

Capture receipt outputs.

Capture API fixtures.

Mark broken tests.

Document accepted drift.

## Phase 1

Create migration branch.

Create Vue 3 sandbox.

Keep current app intact.

Mirror build scripts.

Mirror env loading.

Mirror route manifest.

Prove one route.

## Phase 2

Upgrade core runtime.

Install Vue 3.

Install router v4.

Install Pinia.

Replaced Vue 2 plugin.

Keep Vite unchanged.

Keep Node 22.

## Phase 3

Port app shell.

Port `src/main.js`.

Port `src/App.vue`.

Port sidebar logic.

Port theme switching.

Port auth guard.

Port route resolver.

## Phase 4

Port base primitives.

Start with buttons.

Then inputs.

Then selects.

Then modals.

Then table shell.

Keep visual-only rule.

## Phase 5

Port service layer.

Keep services framework-free.

Preserve API shapes.

Preserve auth headers.

Preserve write guards.

Preserve response mappers.

Add typed contracts.

## Phase 6

Port table engine.

Start with `TablePage`.

Keep manifest-driven routes.

Preserve action column.

Preserve mobile cards.

Preserve print actions.

Guard pagination behavior.

## Phase 7

Port critical flows.

Dashboard first.

Token records second.

Token generation third.

Remote tasks fourth.

Consumption flow fifth.

Receipts sixth.

## Phase 8

Replace Vuex.

Create Pinia stores.

Keep stores thin.

Move logic into services.

Store session state.

Store UI preferences.

Store auth context.

## Phase 9

Finish CSS migration.

Retire legacy sheets.

Move modals into primitives.

Move tables into primitives.

Keep tokens canonical.

Block raw colors.

Add visual contracts.

## Phase 10

Harden production behavior.

Run full contracts.

Run browser flows.

Run Vercel smoke.

Run write staging.

Run security checks.

Compare screenshots.

## Creative Upgrade Track

Give migration taste.

No generic refactor.

Improve command surfaces.

Tighten empty states.

Improve modal hierarchy.

Upgrade receipt visuals.

Improve mobile density.

## Risk Ledger

Router behavior may drift.

Modal flows may regress.

Tables may overflow.

Receipts may mismatch.

Auth redirects may break.

Charts may remount differently.

Legacy CSS may leak.

## Kill Criteria

Stop on auth drift.

Stop on write drift.

Stop on route drift.

Stop on table clipping.

Stop on receipt mismatch.

Stop on failing smoke.

Fix before continuing.

## File Ownership

`src/main.js`

Boot ownership.

`src/App.vue`

Shell ownership.

`src/components/base/`

Primitive ownership.

`src/services/`

Behavior ownership.

`src/data/route-manifest.js`

Route ownership.

`src/styles/`

Token ownership.

`tests/`

Regression ownership.

## Dependency Map

Frontend consumes services.

Services consume API helpers.

Routes consume manifest.

Pages consume primitives.

Styles consume tokens.

Tests consume contracts.

Backend remains unchanged.

## Test Gates

`npm run build`

Build gate.

`npm run test:contracts`

Contract gate.

`npm run test:services`

Service gate.

`npm run test:browser`

Browser gate.

`npm run smoke:vercel`

Preview gate.

## Success Criteria

All routes render.

All reads match.

All writes stay gated.

All receipts match.

Tables remain usable.

Mobile remains dense.

Legacy CSS shrinks.

## First Sprint

Create Vue 3 sandbox.

Upgrade boot path.

Port BaseButton.

Port BaseModalShell.

Port dashboard route.

Run focused tests.

Document route parity.

## Second Sprint

Port TablePage.

Port ActionModal.

Port receipt tools.

Port table tests.

Port modal tests.

Run visual audit.

Compare screenshots.

## Third Sprint

Port token flows.

Port remote tasks.

Port consumption flow.

Replace Vuex.

Add Pinia tests.

Run full contracts.

Cut preview branch.

## Architecture Update Needed

What: Vue 3 runtime.

Why: Vue 2 EOL.

Impact: boot layer changes.

What: Pinia state.

Why: Vuex 3 legacy.

Impact: state contracts change.

What: router v4.

Why: Vue 3 requirement.

Impact: guard syntax changes.

## Final Recommendation

Use staged island migration.

Avoid full rewrite.

Keep backend stable.

Keep services stable.

Move UI deliberately.

Ship behind preview.

Promote after parity.
