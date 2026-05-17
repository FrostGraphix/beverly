# Beverly CRM Ready Rollout Functions

## Ready Now

- Dashboard: shows business metrics.
- Theme Switcher: changes app themes.
- Login: authenticates staff users.
- Session Timeout: expires idle sessions.
- Role Routing: restricts page access.
- Global Search: finds app pages.

## Token Operations

- Credit Token: generates recharge tokens.
- Clear Tamper: generates reset tokens.
- Clear Credit: clears meter credit.
- Max Power Token: sets power limits.
- Token Preview: reviews before submit.
- Token Confirm: submits final token.
- Send To Meter: sends token remotely.
- Receipt Preview: previews standard receipt.
- Browser Print: prints receipt format.
- PDF Receipt: downloads receipt PDF.
- Auto Naming: names receipts automatically.

## Token Records

- Credit Records: lists token sales.
- Tamper Records: lists reset tokens.
- Clear Credit Records: lists clear tokens.
- Export Records: exports table data.
- Print Records: prints receipts.
- Receipt Lookup: retrieves receipt data.

## Remote Operations

- Meter Reading Task: requests meter data.
- Meter Control Task: sends control tasks.
- Meter Token Task: sends token tasks.
- Batch Tasks: schedules many meters.
- Task Output Modal: inspects returned payload.
- Task Status: tracks completion state.

## Reports

- Interval Data: shows meter intervals.
- Hourly Modal: shows hourly readings.
- Consumption Stats: aggregates usage.
- Site Consumption: station-level insight.
- Fraud View: flags suspicious usage.
- Nonpurchase Report: finds inactive users.
- Low Purchase Report: finds low buyers.
- Export Reports: downloads report rows.

## Management

- Gateway CRUD: manages gateways.
- Customer CRUD: manages customers.
- Tariff CRUD: manages tariffs.
- Account CRUD: manages meter accounts.
- Meter CRUD: manages meters.
- Station CRUD: manages stations.
- Item CRUD: manages items.
- Import Data: uploads bulk records.
- Export Data: downloads table data.
- Delete Records: removes selected records.

## Admin

- User Management: creates staff users.
- Role Management: controls permissions.
- Audit Log: tracks admin actions.
- Profile Panel: updates user profile.
- Password Change: updates credentials.
- Preferences: stores user settings.

## Best ASAP Rollout

1. Credit token flow.
2. Receipt print/PDF.
3. Token record export.
4. Interval data report.
5. Customer/account management.
6. Audit log tracking.
7. Role-based access.

# Wallet System Completion Timeline

## Day 1: Data Model

- Finalize wallet tables.
- Finalize vendor tables.
- Finalize ledger tables.
- Finalize funding tables.
- Finalize purchase tables.
- Add Postgres migrations.
- Add seed roles.

## Day 2: Auth And Permissions

- Connect wallet staff roles.
- Connect vendor roles.
- Add route guards.
- Add permission checks.
- Add audit events.
- Add session rules.

## Day 3: Vendor Operations

- Connect vendor creation.
- Connect vendor verification.
- Connect vendor user invites.
- Connect vendor suspension.
- Connect vendor audit trail.

## Day 4: Funding Flow

- Connect funding requests.
- Connect proof uploads.
- Connect funding approvals.
- Connect rejection flow.
- Write ledger entries.
- Update wallet balances.

## Day 5: Purchase Flow

- Connect buy-units flow.
- Connect token generation.
- Connect remote send.
- Connect receipt storage.
- Connect receipt downloads.
- Connect purchase history.

## Day 6: Admin Monitoring

- Connect wallet dashboard.
- Connect vendor directory.
- Connect users page.
- Connect all wallets.
- Connect purchase monitor.
- Connect reversals.
- Connect disputes.

## Day 7: Settlement And Reports

- Build settlement batches.
- Lock settlement periods.
- Generate wallet reports.
- Export CSV/PDF files.
- Add retention policy.
- Add reconciliation summary.

## Day 8: QA And Release

- Test admin wallet flow.
- Test vendor wallet flow.
- Test funding approvals.
- Test purchases.
- Test receipts.
- Test permissions.
- Test audit logs.
- Run production build.
- Prepare release checklist.

## Rollout Target

- MVP completion: 5 working days.
- Full operational completion: 8 working days.
- Production hardening: 2 extra days.
