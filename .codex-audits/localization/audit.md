# Localization Audit

Date: 2026-08-29.

## Scope

Surfaces checked:

- Beverly CRM.
- Wallet Admin.
- Vendor Portal.
- Customer Portal.
- Wallet Landing.
- Shared language selector.

Languages checked:

- English (`en-NG`).
- Yoruba (`yo-NG`).
- Hausa (`ha-NG`).
- Igbo (`ig-NG`).

## Evidence

1. `01-refunds-english.png`: English refunds view.
2. `02-language-menu-legacy.png`: Legacy code-only selector.
3. `03-yoruba-partial.png`: Confirmed partial switching.
4. `04-session-blocker.png`: Admin verification blocker.
5. `05-landing-yoruba-live.png`: Verified instant Yoruba switch.

## Findings

1. Landing localization: healthy.
   - All four locales switched instantly.
   - Hero text changed immediately.
   - Document language changed correctly.
   - No page reload occurred.

2. Language selector: improved.
   - Full native names replace codes.
   - Current language remains visible.
   - Keyboard-native selection remains intact.
   - Shared tokens remain reused.

3. Shared catalogs: protected.
   - Every registered key matches.
   - English fallback stays deterministic.
   - Missing keys fail tests.

4. Refunds localization: implemented.
   - KPIs now translate.
   - Filters now translate.
   - Tables now translate.
   - Mobile cards now translate.
   - Dates follow selected locale.

5. Portal shells: partial.
   - Account menus now translate.
   - Navigation remains mostly English.
   - Page content remains mostly English.

6. CRM shell: partial.
   - Account controls now translate.
   - Most routes remain English.
   - Most pages remain English.

## Coverage Inventory

Translation-hook file coverage:

| Surface | Hooked files | Vue files | Status |
|---|---:|---:|---|
| CRM | 1 | 84 | Incomplete |
| Admin | 3 | 60 | Incomplete |
| Vendor | 1 | 35 | Incomplete |
| Customer | 1 | 42 | Incomplete |
| Landing | 11 | 16 | Strong |

This measures localization hooks only.
It is not phrase coverage.

## Accessibility

Confirmed:

- Full language names appear.
- Native select semantics remain.
- Visible focus styling remains.
- Valid BCP 47 tags apply.

Not confirmed:

- Full keyboard regression testing.
- Screen-reader pronunciation quality.
- Complete translated reading order.
- Full WCAG localization compliance.

## Accuracy Limits

No native-language review occurred.
Linguistic certification remains pending.
Production accuracy cannot be claimed.

## Verification

- Full production build passed.
- Type checking passed.
- Localization contract passed.
- Existing language contract passed.
- Public browser switching passed.
- Admin post-fix capture was blocked.
- The admin session had expired.

