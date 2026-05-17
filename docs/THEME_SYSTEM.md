# Beverly CRM Theme System

## Purpose

This file defines the theme system for Beverly CRM and the Vending Wallet.

The goal is one shared theme contract across:

- CRM pages.
- Wallet admin pages.
- Vendor wallet pages.
- Tables.
- Modals.
- Charts.
- Receipts.
- Print previews.
- PDF previews.

## Source Files

Theme files:

- `src/styles/tokens.css`
- `src/styles/themes.css`
- `src/styles/primitives.css`
- `src/styles/layouts.css`

Wallet theme consumers:

- `src/components/wallet/AdminWalletOperationsPage.vue`
- `src/components/vendor/VendorWalletPage.vue`

## Theme Architecture

The theme system has three layers.

1. Primitive tokens.
2. Semantic tokens.
3. Component tokens.

Primitive tokens define raw values.

Semantic tokens define meaning.

Component tokens define UI behavior.

Components should use semantic and component tokens.

Components should avoid raw hex colors.

## Primitive Tokens

Primitive tokens live in:

- `src/styles/tokens.css`

They include:

- Green scale.
- Red scale.
- Amber scale.
- Blue scale.
- Slate scale.
- Black.
- White.
- Font families.
- Font sizes.
- Spacing.
- Radii.
- Motion.
- Shadows.

Examples:

```css
--bev-color-green-500: #10b981;
--bev-color-red-500: #ef4444;
--bev-color-amber-500: #f59e0b;
--bev-color-slate-900: #0f172a;
--bev-font-sans: 'Inter', 'Outfit', system-ui, -apple-system, sans-serif;
--bev-space-4: 16px;
--bev-radius-md: 8px;
--bev-motion-fast: 0.12s cubic-bezier(0.4, 0, 0.2, 1);
```

## Semantic Tokens

Semantic tokens describe usage.

They also live in:

- `src/styles/tokens.css`

Core semantic tokens:

```css
--color-brand
--color-brand-hover
--color-brand-strong
--color-brand-soft
--color-text
--color-text-strong
--color-text-muted
--color-text-faint
--color-text-inverse
--color-surface-page
--color-surface-card
--color-surface-glass
--color-surface-overlay
--color-border
--color-border-strong
--color-success
--color-success-soft
--color-danger
--color-danger-soft
--color-warning
--color-warning-soft
--color-info
--color-info-soft
```

Use these tokens first.

## Component Tokens

Component tokens define sizing.

They live in:

- `src/styles/tokens.css`

Important component tokens:

```css
--button-height-sm
--button-height-md
--button-height-lg
--button-radius
--button-font-size
--button-font-weight
--field-height
--field-radius
--field-padding-x
--badge-radius
--modal-width
--modal-radius
--table-action-column-width
--wallet-table-row-height
--wallet-card-radius
--wallet-receipt-width
--shell-sidebar-width
--shell-sidebar-collapsed-width
--shell-header-height
--shell-page-gutter
--icon-button-size
```

Use these for repeatable UI sizing.

## Legacy Aliases

The project still supports older aliases.

These aliases map to newer tokens.

Examples:

```css
--primary: var(--color-brand);
--success: var(--color-success);
--danger: var(--color-danger);
--warning: var(--color-warning);
--info: var(--color-info);
--text-main: var(--color-text);
--text-strong: var(--color-text-strong);
--text-muted: var(--color-text-muted);
--bg-page: var(--color-surface-page);
--bg-card: var(--color-surface-card);
--border-color: var(--color-border);
--font-family: var(--bev-font-sans);
```

New code should prefer semantic tokens.

Legacy aliases are acceptable during migration.

## Current Themes

Themes live in:

- `src/styles/themes.css`

Current theme selectors:

```css
[data-theme="light"]
[data-theme="dark"]
[data-theme="executive"]
[data-theme="ocean"]
[data-theme="contrast"]
```

Themes override semantic tokens only.

Do not override component structure inside theme selectors.

## Light Theme

Light theme is the default token state.

It uses:

- Green brand.
- White cards.
- Pale green page surface.
- Slate text.
- Soft green borders.

Use case:

- Default CRM operations.
- Bright office screens.
- General admin work.

## Dark Theme

Dark theme uses:

- Dark navy page surface.
- Dark card surfaces.
- Green brand.
- Pale green strong text.
- Muted slate secondary text.

Use case:

- Low-light environments.
- Command-center screens.
- Long monitoring sessions.

## Executive Theme

Executive theme uses:

- Deep green background.
- Premium green accents.
- Softer dark surfaces.
- Strong finance feel.

Use case:

- Management screens.
- Wallet admin dashboards.
- Finance reviews.

## Ocean Theme

Ocean theme uses:

- Light green page surface.
- White cards.
- Deep green sidebar.
- Clean operations feel.

Use case:

- Normal daily CRM use.
- Data entry.
- Reports.

## Contrast Theme

Contrast theme uses:

- Black surfaces.
- Yellow brand.
- High contrast text.
- Strong borders.

Use case:

- Accessibility.
- Poor displays.
- Visibility-critical work.

## Theme Rules

All new UI must be theme-aware.

Allowed:

```css
color: var(--color-text);
background: var(--color-surface-card);
border-color: var(--color-border);
box-shadow: var(--shadow-sm);
```

Avoid:

```css
color: #ffffff;
background: #001b0c;
border-color: #00ff66;
```

Exception:

- Brand assets.
- Receipt print constants.
- Charts needing fixed export color.

Even exceptions should be documented.

## Required Theme Coverage

Every theme must support:

- Body background.
- App shell.
- Sidebar.
- Navbar.
- Page surface.
- Cards.
- Tables.
- Forms.
- Buttons.
- Badges.
- Modals.
- Dropdowns.
- Tooltips.
- Charts.
- Receipt previews.
- Hover modals.
- Print preview modals.
- Empty states.
- Loading states.
- Error states.

## Sidebar Theme Rules

Use sidebar tokens:

```css
--sidebar-bg-start
--sidebar-bg-end
--sidebar-text
--sidebar-text-hover
--sidebar-active-bg
--sidebar-active-border
--sidebar-logo-bg
--sidebar-logo-border
--sidebar-hover-bg
--sidebar-hover-border
--sidebar-footer-bg
--sidebar-footer-border
```

Wallet sidebar must match CRM sidebar.

Logo remains Beverly.

Do not add wallet-only side panels.

Removed sidebar items:

- Finance Admin pill.
- Operational status card.

## Navbar Theme Rules

Navbar should use:

```css
--bg-header
--color-border
--color-text
--color-text-strong
--color-surface-card
```

Navbar must not use hardcoded dark green backgrounds.

Wallet pages should not add empty divider bands.

Top-right unused search should stay removed.

## Table Theme Rules

Tables should use:

```css
--color-surface-card
--color-surface-page
--color-border
--color-border-strong
--color-text
--color-text-muted
--color-brand-soft
```

Required states:

- Default row.
- Hover row.
- Selected row.
- Sticky header.
- Empty state.
- Loading state.
- Pagination.
- Disabled action.

Money columns should keep readable contrast.

Status columns should use semantic colors.

## Modal Theme Rules

Modals should use:

```css
--color-surface-card
--color-surface-page
--color-surface-overlay
--color-border
--color-text
--color-text-muted
--modal-radius
--modal-width
```

Required modal behavior:

- Header is compact.
- Footer is compact.
- Body can scroll.
- Close button is right aligned.
- Labels are left aligned.
- Inputs are left aligned.
- Theme works in all modes.

Do not place the title inside an extra card.

Do not use center-aligned form labels.

## Form Theme Rules

Use field tokens:

```css
--field-height
--field-radius
--field-padding-x
--color-border
--color-surface-card
--color-text
--color-text-muted
--color-brand-soft
```

Required states:

- Default.
- Hover.
- Focus.
- Invalid.
- Disabled.
- Read-only.

Focus must be visible.

Validation must be readable.

## Button Theme Rules

Use button tokens:

```css
--button-height-sm
--button-height-md
--button-height-lg
--button-radius
--button-font-size
--button-font-weight
```

Button types:

- Primary.
- Secondary.
- Ghost.
- Quiet.
- Danger.
- Icon.

Primary buttons use:

```css
background: var(--color-brand);
color: var(--color-text-inverse);
```

Danger buttons use:

```css
background: var(--color-danger-soft);
color: var(--color-danger);
```

## Card Theme Rules

Cards should use:

```css
--color-surface-card
--color-border
--color-text
--color-text-muted
--wallet-card-radius
--shadow-sm
```

Wallet KPI cards should stay compact.

Dashboard cards should use the same visual language as CRM.

Avoid nested card styling.

## Chart Theme Rules

Charts must read CSS variables.

Required tokens:

```css
--color-text
--color-text-muted
--color-border
--color-brand
--color-brand-soft
--color-success
--color-warning
--color-danger
--color-info
--color-surface-card
```

Required chart behavior:

- Axis labels remain visible.
- Tooltip is theme-aware.
- Grid lines are visible.
- Bars use brand or semantic colors.
- Hover states remain clear.

Wallet Balance Trend should use Beverly CRM bar chart properties.

## Receipt Theme Rules

Browser print is the receipt standard.

PDF export must match browser print.

Receipt preview must match browser print.

Receipt theme rules:

- Screen preview can be theme-aware.
- Print/PDF should use receipt-safe colors.
- Text must remain visible in PDF.
- Receipt layout must not depend on app background.

Receipt constants may use fixed colors when needed for print fidelity.

Required receipt colors:

- Dark receipt background.
- Yellow token accent.
- White primary text.
- Muted secondary text.
- Thin accent borders.

## Wallet Theme Rules

Wallet pages must consume the shared CRM theme.

Do not create a separate wallet palette.

Wallet admin shell can define wallet status aliases:

```css
--wallet-status-available
--wallet-status-held
--wallet-status-pending
--wallet-status-approved
--wallet-status-rejected
--wallet-status-frozen
--wallet-status-failed
--wallet-status-reversed
--wallet-status-disputed
```

These must map to semantic colors.

They should not introduce unrelated fixed colors.

## Status Color Rules

Use semantic status tokens.

Success:

```css
--color-success
--color-success-soft
```

Warning:

```css
--color-warning
--color-warning-soft
```

Danger:

```css
--color-danger
--color-danger-soft
```

Info:

```css
--color-info
--color-info-soft
```

Neutral:

```css
--color-neutral
--color-neutral-soft
```

## Spacing Rules

Use spacing tokens:

```css
--bev-space-1
--bev-space-2
--bev-space-3
--bev-space-4
--bev-space-5
--bev-space-6
--bev-space-7
--bev-space-8
```

Common use:

- `--bev-space-2` for tight inline gaps.
- `--bev-space-3` for controls.
- `--bev-space-4` for panels.
- `--bev-space-6` for page sections.

## Radius Rules

Use radius tokens:

```css
--bev-radius-xs
--bev-radius-sm
--bev-radius-md
--bev-radius-lg
--bev-radius-xl
--bev-radius-pill
```

Operational UI should stay compact.

Cards should normally stay at 8px to 12px.

Pills should use `--bev-radius-pill`.

## Motion Rules

Use motion tokens:

```css
--bev-motion-fast
--bev-motion-normal
--bev-motion-layout
```

Use fast motion for:

- Hover.
- Focus.
- Button states.

Use normal motion for:

- Modal entry.
- Drawer entry.
- Table row reveal.

Use layout motion for:

- Sidebar collapse.
- Page shell movement.

## Accessibility Rules

Every theme must meet:

- Readable text contrast.
- Visible focus state.
- Visible disabled state.
- Visible hover state.
- Non-color-only status meaning.
- Legible chart labels.
- Legible table rows.
- Legible modal text.

Contrast theme must be treated as a first-class theme.

## Implementation Pattern

Correct:

```css
.wallet-card {
  border: 1px solid var(--color-border);
  background: var(--color-surface-card);
  color: var(--color-text);
  border-radius: var(--wallet-card-radius);
}

.wallet-card strong {
  color: var(--color-text-strong);
}
```

Incorrect:

```css
.wallet-card {
  border: 1px solid #064e3b;
  background: #001b0c;
  color: #ffffff;
}
```

## Theme Testing Checklist

Test each theme:

- Light.
- Dark.
- Executive.
- Ocean.
- Contrast.

Check these pages:

- Dashboard.
- Credit Token.
- Token Records.
- Table pages.
- Action modals.
- Wallet Admin Dashboard.
- Vendors.
- Users and Roles.
- Funding and Credits.
- Purchase Monitor.
- Audit Log.
- Vendor Dashboard.
- Vendor Buy Units.
- Vendor Receipts.

Check these surfaces:

- Sidebar.
- Navbar.
- Cards.
- Tables.
- Buttons.
- Inputs.
- Selects.
- Badges.
- Modals.
- Charts.
- Tooltips.
- Receipt preview.
- PDF preview.

## Acceptance Checklist

Theme system is complete when:

- All UI uses theme tokens.
- Wallet uses CRM theme tokens.
- No wallet-only palette remains.
- Light theme is readable.
- Dark theme is readable.
- Executive theme is readable.
- Ocean theme is readable.
- Contrast theme is readable.
- Tables are theme-aware.
- Modals are theme-aware.
- Charts are theme-aware.
- Receipts preview correctly.
- PDF export remains readable.
- Hover modals are theme-aware.
- Sidebar remains Beverly branded.
- No hardcoded colors control major UI.

