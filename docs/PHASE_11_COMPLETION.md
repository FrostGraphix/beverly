Phase 11 Completion
===================

Architecture fit
- `tools/visual-parity*.cjs` owns screenshot and diff automation.
- `tests/visual-parity.test.cjs` guards route-to-reference coverage.
- `replica-screenshots/phase-11/` stores desktop, mobile, and diff artifacts.
- `src/App.vue` adds parity-only visible-route mode for screenshot fidelity.

Implemented
- route-to-reference screenshot mapping
- desktop screenshot capture for all 23 visible reference routes
- mobile screenshot capture for all 23 visible reference routes
- pixel diff generation
- JSON parity report generation
- parity-only visible sidebar mode
- build script wiring
- parity config test

Latest report
- desktop compared: 23
- mobile captured: 23
- mobile overflow count: 0
- worst desktop diff: Dashboard 15.02%

Artifacts
- `replica-screenshots/phase-11/visual-parity-report.json`
- `replica-screenshots/phase-11/desktop/`
- `replica-screenshots/phase-11/mobile/`
- `replica-screenshots/phase-11/diff/`

Status
- Phase 11 pipeline runs end to end
- parity targets are measured
- remaining gap is visual fidelity, mainly Dashboard and several data-heavy tables
