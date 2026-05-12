# Beverly Design System

Status: production-hardening.

Score: 8.4/10.

Scalability: strong foundation, active migration.

## Truth Source

Root architecture is canonical.

Token files:
- `src/styles/tokens.css`
- `src/styles/themes.css`
- `src/styles/primitives.css`
- `src/styles/layouts.css`

Temporary hub:
- `src/styles/reference.css`

Migration layer:
- `src/styles/legacy-components.css`
- `src/styles/legacy-*.css`

Rule:
- Do not add tokens to `reference.css`.
- Do not add theme blocks to `reference.css`.
- Do not add route logic to base components.

## Design Thesis

Beverly is an operational command surface.

It should feel:
- calm
- dense
- legible
- premium
- utility-first

It should avoid:
- generic SaaS cards
- decorative noise
- raw color drift
- modal sprawl
- table action clipping

## Token Layers

Primitive tokens:
- raw colors
- type scale
- spacing
- radii
- motion
- shadows

Semantic tokens:
- brand
- text
- surfaces
- borders
- feedback states
- source states

Component tokens:
- buttons
- fields
- badges
- modals
- tables
- shell geometry

## Source Badges

Use source badges for data provenance.

Supported variants:
- `live`
- `cached`
- `demo`
- `info`
- `neutral`
- `success`
- `warning`
- `danger`

Purpose:
- expose data mode
- reduce operator ambiguity
- make mixed-mode states visible

## Themes

Supported themes:
- light
- dark
- executive
- ocean
- contrast

Theme rules:
- Theme deltas live in `themes.css`.
- Themes override semantic tokens only.
- Green palettes remain brand-led.
- Contrast theme must prioritize legibility.
- Components inherit through tokens.

## Base Primitives

Base primitives live in `src/components/base`.

Current primitives:
- `BaseButton`
- `BaseInput`
- `BaseSelect`
- `BaseCheckbox`
- `BaseToggle`
- `BaseIconButton`
- `BaseBadge`
- `BaseModalShell`
- `BaseCard`
- `BasePageHeader`
- `BaseTableShell`

Rules:
- App pages consume primitives.
- Raw controls are blocked.
- Base components stay visual only.
- Business behavior stays in pages or services.

## Layout Contracts

Layout ownership:
- page geometry: `layouts.css`
- reusable behavior: `primitives.css`
- theme deltas: `themes.css`
- migration styles: `legacy-*.css`

Table contracts:
- action column remains visible
- sticky action width is token-backed
- horizontal overflow is intentional
- dense scanning beats ornament

Modal contracts:
- shared shell behavior
- keyboard-safe close flows
- task-focused content
- no circular overlay regressions

## Verification

Required gates:

```powershell
npm run flow:audit
npm run test:contracts
npm run test:browser
npm run test:visual:audit
```

Contract coverage:
- token ownership
- theme completeness
- primitive adoption
- table action visibility
- modal behavior
- receipt/export parity
- visual audit screenshots

## Critique

What is strong:
- architecture boundaries are explicit
- route ownership is centralized
- service/data ownership is clean
- tokens are layered correctly
- contracts catch regressions
- browser QA covers critical flows

What is weak:
- Vue 2 limits long-term scaling
- legacy CSS still carries too much UI
- full TypeScript coverage is incomplete
- visual regression is focused, not exhaustive
- docs previously drifted from implementation

What was fixed:
- stale token documentation
- missing source-badge contract
- design-system scalability guard
- browser-safe badge variants
- obsolete legacy table sheet removed
- broader visual routes added

## Roadmap

Next structural moves:
1. Retire `legacy-modals.css`.
2. Move modal styling into primitives.
3. Move table styling into primitives.
4. Add chart screenshot regression.
5. Add receipt PDF snapshot checks.
6. Expand typed route contracts.

Exit target:
- 9.5/10 design-system maturity.
- `reference.css` remains import-only.
- Legacy CSS becomes empty or removed.
- All critical UI has visual evidence.
