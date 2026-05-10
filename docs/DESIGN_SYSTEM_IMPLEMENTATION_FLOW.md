# Beverly Creative Implementation Flow

## Purpose

Create one execution flow for major UI, theme, modal, table, receipt, export, and system-design upgrades.

The flow follows the root architecture:

- Vue pages stay in `src/components`.
- Base primitives stay in `src/components/base`.
- Route metadata stays in `src/data/route-manifest.js`.
- Reads stay in `src/services/*`.
- Theme deltas stay in `src/styles/themes.css`.
- Tokens stay in `src/styles/tokens.css`.
- Reusable UI contracts stay in `src/styles/primitives.css`.
- Layout geometry stays in `src/styles/layouts.css`.
- `src/styles/reference.css` remains a migration hub only.
- Tests stay in `tests`.
- Visual artifacts stay in `tmp`.

## Creative Task List

### 1. Architecture Lock

- Read `ARCHITECTURE.md`.
- Map affected routes.
- Map affected services.
- Map affected styles.
- Map affected tests.
- Block wrong directories.
- Block duplicated patterns.
- Block raw color drift.
- Block business logic drift.

Done when:

- Every change has ownership.
- Every owner matches architecture.
- Every consumer is known.

### 2. Experience Audit

- Inspect dashboard.
- Inspect all tables.
- Inspect profile hover modal.
- Inspect abnormal alarm.
- Inspect token generation.
- Inspect receipt views.
- Inspect browser exports.
- Inspect PDF exports.
- Inspect all modal flows.
- Inspect every theme.

Done when:

- Weak hierarchy is listed.
- Broken alignment is listed.
- Theme misses are listed.
- Responsive risks are listed.
- Accessibility risks are listed.

### 3. Creative Direction Sprint

Generate three directions before implementation:

1. Operational Command
   - Dense.
   - Fast scanning.
   - Strong tables.
   - Quiet surfaces.
   - Clear actions.

2. Executive Utility
   - Premium dashboards.
   - Strong summaries.
   - Polished modals.
   - Elegant exports.
   - Reduced clutter.

3. Field Console
   - Status-forward.
   - Alarm-aware.
   - Task-focused.
   - High contrast.
   - Mobile tolerant.

Selection rule:

- Choose the direction that improves clarity, trust, speed, and maintainability.
- Prefer useful differentiation over decoration.
- Reject novelty that slows work.

### 4. Design Token Pass

- Define missing semantic tokens.
- Prefer green palettes.
- Preserve light mode.
- Preserve contrast intent.
- Keep contrast logo dark.
- Remove raw theme colors.
- Normalize focus rings.
- Normalize borders.
- Normalize shadows.
- Normalize surfaces.

Done when:

- Themes cover every UI area.
- Components inherit tokens.
- Contrast remains legible.
- Green themes feel branded.

### 5. Table Supercharge Pass

- Stabilize action columns.
- Keep actions fully visible.
- Improve button grouping.
- Add theme-aware states.
- Preserve dense scanning.
- Preserve horizontal behavior.
- Polish empty states.
- Polish loading states.
- Polish export actions.

Done when:

- Actions never clip.
- Columns stay readable.
- Tables match all themes.
- Mobile behavior is intentional.

### 6. Modal System Pass

- Normalize modal surfaces.
- Remove circular overlays.
- Use hover modal behavior.
- Improve profile settings.
- Improve success states.
- Improve failure states.
- Improve final states.
- Remove useless API previews.
- Apply brand tokens.
- Preserve keyboard access.

Done when:

- Modals feel related.
- Modals stay task-focused.
- Brand appears consistently.
- No modal traps exist.

### 7. Dashboard Pass

- Restore stat card sizing.
- Keep metric hierarchy.
- Use solid bar colors.
- Bind charts to theme.
- Fix abnormal alarm colors.
- Remove white outlines.
- Add clear alarm indicators.
- Keep chart legends readable.

Done when:

- Dashboard reads cleanly.
- Charts follow theme.
- Alarms communicate severity.
- Cards match previous scale.

### 8. Receipt And Export Pass

- Align browser receipt design.
- Align PDF receipt design.
- Align export content.
- Check totals.
- Check customer identity.
- Check station identity.
- Check timestamps.
- Check units.
- Check signatures.
- Check spacing.
- Check print width.

Done when:

- Receipt UI matches export.
- PDF output matches intent.
- Browser export is accurate.
- Content is complete.

### 9. Service Integrity Pass

- Keep API calls in services.
- Keep mappers pure.
- Keep export shaping typed.
- Keep receipt shaping deterministic.
- Keep table helpers isolated.
- Keep chart options isolated.
- Keep write guards intact.

Done when:

- UI owns presentation only.
- Services own data shaping.
- Tests cover contracts.

### 10. Verification Gauntlet

- Run `npm run build`.
- Run targeted contracts.
- Run theme contracts.
- Run table contracts.
- Run modal contracts.
- Run receipt tests.
- Run export tests.
- Run dashboard tests.
- Run browser QA.
- Capture screenshots.

Done when:

- Build passes.
- Target tests pass.
- Screenshots prove output.
- No console blockers remain.

## Critique Pass

### Strengths

- The flow protects architecture.
- It prevents visual drift.
- It includes creative options.
- It keeps business logic isolated.
- It treats exports seriously.
- It handles theme completeness.
- It includes verification gates.

### Weaknesses

- It is broad.
- It can become slow.
- Screenshots need discipline.
- Manual review still matters.
- Full tests may be heavy.

### Corrections

- Batch related surfaces.
- Use targeted tests first.
- Run full gates before release.
- Keep screenshots focused.
- Avoid cosmetic-only churn.

## Triple Check

### Architecture Check

- Frontend changes stay in `src/components`.
- Visual primitives stay in `src/components/base`.
- Data logic stays in `src/services`.
- Routes stay in `src/data`.
- CSS layers stay separated.
- Tests stay in `tests`.
- Artifacts stay in `tmp`.

### Product Check

- Operators scan faster.
- Tables expose actions clearly.
- Modals reduce confusion.
- Receipts are trustworthy.
- Exports are complete.
- Dashboard status is obvious.
- Themes feel cohesive.

### Engineering Check

- No hardcoded secrets.
- No duplicated services.
- No raw color drift.
- No broken write guards.
- No skipped error states.
- No untested critical paths.
- No hidden theme regressions.

## Best Plan Flow

### Phase 1: Map

1. Read architecture.
2. Read route owner.
3. Read service owner.
4. Read style owner.
5. Read test owner.

Output:

- Scope map.
- Consumer map.
- Risk map.

### Phase 2: Decide

1. Audit current UI.
2. Generate three concepts.
3. Critique each concept.
4. Pick strongest concept.
5. Define acceptance gates.

Output:

- Chosen direction.
- Rejected alternatives.
- Acceptance checklist.

### Phase 3: Build Foundation

1. Add tokens first.
2. Add primitives second.
3. Add layout contracts third.
4. Add component polish fourth.
5. Add tests fifth.

Output:

- Reusable styling.
- Minimal local CSS.
- Stable UI contracts.

### Phase 4: Build Surfaces

1. Upgrade tables.
2. Upgrade modals.
3. Upgrade dashboard.
4. Upgrade receipts.
5. Upgrade exports.
6. Upgrade edge states.

Output:

- Complete user flows.
- Theme-safe surfaces.
- Verified content output.

### Phase 5: Verify

1. Run build.
2. Run targeted tests.
3. Run visual audit.
4. Check browser flows.
5. Capture evidence.
6. Record remaining risk.

Output:

- Passing gates.
- Screenshot evidence.
- Known limitations.

## Implementation Rules

- Read before editing.
- State file paths first.
- Keep changes scoped.
- Prefer existing helpers.
- Prefer token-backed CSS.
- Keep functions small.
- Preserve write gates.
- Preserve route contracts.
- Add tests with changes.
- Verify before release.

## Acceptance Checklist

- [x] Architecture boundaries are audited.
- [x] Themes are audited.
- [x] Tables keep actions visible.
- [x] Modals are audited.
- [x] Profile uses hover modal.
- [x] Dashboard charts follow theme.
- [x] Abnormal alarm chart avoids white outlines.
- [x] Receipts share one content model.
- [x] PDF export contract is audited.
- [x] Browser export contract is audited.
- [x] Build passes.
- [x] Target flow test passes.
- [x] Browser QA passes.
- [x] Visual audit passes.

## Implemented Flow Gate

Command:

```powershell
npm run flow:audit
```

Test:

```powershell
npm run test:flow
```

Artifact:

- `tmp/creative-implementation-flow/audit-report.json`

The gate checks:

- Architecture ownership.
- Creative plan sections.
- Required design-system files.
- Green theme palettes.
- Contrast logo readability.
- Token foundation.
- Table action visibility.
- Profile hover modal shape.
- Dashboard chart theming.
- Receipt and export parity.
- Runnable verification scripts.

Verified locally:

- `npm run flow:audit`
- `npm run test:flow`
- `npm run build`
- `npm run test:browser`
- `npm run test:visual:audit`

## Active Gaps

- Complete CSS migration from `reference.css`.
- Continue migrating `legacy-components.css`.
- Full TypeScript migration remains open.
- Add stricter export snapshots.
- Add modal visual regression shots.
- Add dashboard chart screenshot checks.
