# Beverly CRM And Vending Wallet Platform Design

## Purpose

This document maps the full Beverly CRM and Vending Wallet platform as it exists now, how the two systems connect, what each page does, what the main flows are, and how the system should continue toward production use.

It separates current implementation from target design, so rollout decisions stay clear.

## Platform Summary

Beverly CRM is the main operations system.

The Vending Wallet is an embedded finance layer inside the same CRM shell.

The CRM owns customer, meter, tariff, station, token, remote task, report, and admin operations.

The Wallet owns vendor onboarding, vendor users, wallets, funding, wallet ledger, token purchases, receipt history, settlement, disputes, reversals, reports, and audit logs.

The connection point is the route manifest, shared session logic, shared UI shell, shared theme, and service functions that call the wallet APIs.

## Current Architecture

### Main Shell

The application is a Vue single-page app using hash routes.

Main routing lives in:

- `src/data/route-manifest.js`

The route manifest defines:

- CRM page routes.
- Wallet admin routes.
- Wallet vendor routes.
- Role-based visibility.
- API endpoint metadata.
- Table metadata.
- Export metadata.
- Sidebar grouping.

### Shared Services

Core service files include:

- `src/services/api.js`
- `src/services/table-service.js`
- `src/services/action-service.mjs`
- `src/services/token-flow.mjs`
- `src/services/receipt-tools.mjs`
- `src/services/vendor-wallet-service.mjs`
- `src/services/vendor-purchase-service.mjs`
- `src/services/vendor-funding-service.mjs`

These services currently handle:

- Login/session state.
- API requests.
- Table data loading.
- Write actions.
- Token task creation.
- Receipt models.
- Wallet funding.
- Wallet purchases.
- Wallet ledger.
- Reconciliation.
- Manual credits.
- Vendor onboarding.

## Role Model

Role routing is controlled from `route-manifest.js`.

Important role groups:

- `super-admin`
- `account`
- `finance-checker`
- `vendor_user`
- `vendor_manager`

Wallet staff roles:

- `super-admin`
- `account`
- `finance-checker`

Wallet vendor roles:

- `vendor_user`
- `vendor_manager`

Staff users see wallet admin pages.

Vendor users see vendor wallet pages.

The CRM and wallet use one shared session model.

## CRM Pages

### Dashboard

Route:

- `#/dashboard`

Purpose:

- Operations overview.
- High-level metrics.
- Charts.
- Shortcuts.
- Recent activity.

Main value:

- Fast operational status.
- Daily management visibility.

### Credit Token

Route:

- `#/token-generate/credit-token`

Purpose:

- Generate electricity recharge tokens.
- Preview receipts.
- Print receipts.
- Export receipt PDFs.

Main logic:

- Customer selection.
- Meter validation.
- Tariff lookup.
- Unit calculation.
- Token generation.
- Receipt creation.
- Print/export flow.

Wallet connection:

- Vendor wallet purchase flow should call the same token generation logic.
- Vendor wallet receipt should follow the same receipt standard.

### Clear Tamper

Route:

- `#/token-generate/clear-tamper`

Purpose:

- Generate clear tamper tokens.

Main logic:

- Meter lookup.
- Token request.
- Task/result tracking.

### Clear Credit

Route:

- `#/token-generate/clear-credit`

Purpose:

- Generate clear credit commands.

Main logic:

- Meter lookup.
- Credit reset task.
- Result tracking.

### Max Power

Route:

- `#/token-generate/max-power`

Purpose:

- Generate max power tokens or commands.

Main logic:

- Meter lookup.
- Power limit input.
- Token/task submission.

### Token Records

Routes:

- `#/token-record/credit-record`
- `#/token-record/clear-tamper-record`
- `#/token-record/clear-credit-record`
- `#/token-record/max-power-record`

Purpose:

- View historical token operations.
- Filter records.
- Export records.
- Print or inspect receipts.

Wallet connection:

- Vendor token purchases should also appear in token records.
- Vendor source should be traceable.

### Remote Operation

Routes:

- `#/remote-operation/meter-reading`
- `#/remote-operation/meter-control`
- `#/remote-operation/token-task`

Purpose:

- Create remote tasks for meters.
- Read meter data.
- Send control commands.
- Send tokens remotely.

Wallet connection:

- Vendor remote-send purchase mode should create remote token tasks here.

### Remote Operation Task Records

Routes:

- `#/remote-operation-task/meter-reading-record`
- `#/remote-operation-task/meter-control-record`
- `#/remote-operation-task/token-task-record`

Purpose:

- Track remote task status.
- Confirm success/failure.
- Review created tasks.

Wallet connection:

- Wallet remote-send purchases should use these task records for delivery proof.

### Data Reports

Routes:

- `#/data-report/long-non-purchase`
- `#/data-report/low-purchase`
- `#/data-report/consumption-statistics`
- `#/data-report/interval-data`
- `#/data-report/site-consumption`

Purpose:

- Analyze customer behavior.
- Analyze consumption.
- Identify revenue risk.
- Track interval readings.
- Support operations planning.

Wallet connection:

- Wallet purchase history should feed customer purchase analysis.
- Vendor channel should become a report dimension.

### Management

Routes:

- `#/management/gateway`
- `#/management/customer`
- `#/management/tariff`
- `#/management/account`

Purpose:

- Manage system master data.
- Maintain customers.
- Maintain tariffs.
- Maintain gateways.
- Maintain operator accounts.

Wallet connection:

- Wallet purchases depend on customer, meter, and tariff data.
- Vendor users should not modify CRM master data.

### Administration

Routes:

- `#/administration/user`
- `#/administration/role`
- `#/administration/log`
- `#/administration/station`
- `#/administration/item`
- `#/administration/meter`
- `#/administration/debt`

Purpose:

- User management.
- Role management.
- Audit logs.
- Station setup.
- Item setup.
- Meter setup.
- Debt setup.

Wallet connection:

- Wallet roles should align with CRM roles.
- Wallet audit logs should be part of the audit strategy.
- Station and meter data are required for vendor vending.

### Protocol

Routes:

- `#/protocol/dlms`
- `#/protocol/dlt645`

Purpose:

- Protocol-specific meter communication tools.

Wallet connection:

- Remote vending may depend on these protocol paths.

### Remote Support

Routes:

- `#/remote-support/gprs-task`
- `#/remote-support/gprs-online-status`
- `#/remote-support/load-profile`
- `#/remote-support/event-notification`
- `#/remote-support/firmware-update`
- `#/remote-support/file-upload`

Purpose:

- Track connectivity.
- Support remote meter jobs.
- Handle file uploads.
- Support firmware and events.

Wallet connection:

- Remote-send token reliability depends on online status and task execution.

### System

Routes:

- `#/system/station-onboarding-studio`
- `#/system/automation-command`

Purpose:

- Station setup workflows.
- Operational automation.

Wallet connection:

- Station onboarding can support vendor region mapping.
- Automation can support refresh jobs and cleanup jobs.

## Wallet Admin Pages

Wallet admin pages are rendered mainly by:

- `src/components/wallet/AdminWalletOperationsPage.vue`

### Wallet Admin Dashboard

Route:

- `#/wallet/admin/dashboard`

Purpose:

- Show wallet operations status.
- Show vendor counts.
- Show active wallets.
- Show pending funding.
- Show purchases.
- Show failed transactions.
- Show wallet balance trend.
- Show operational queues.

Current state:

- UI is implemented.
- Cards and charts are present.
- Some values are demo/local fixtures.

Target state:

- Values come from wallet tables.
- Charts come from snapshots or query views.
- Queues link to real pending work.

### Vendors

Route:

- `#/wallet/admin/vendors`

Purpose:

- View vendor organizations.
- Filter vendors.
- Open vendor records.
- Freeze vendors.
- Regenerate vendor passwords.
- Export vendors.

Current state:

- Table UI exists.
- Demo data is used.
- Admin actions mutate local page state.

Target state:

- Use persisted vendor organizations.
- Use real freeze/unfreeze actions.
- Use audit logging for each action.

### Create Vendor

Route:

- `#/wallet/admin/vendors/create`

Purpose:

- Create a vendor organization.
- Create initial vendor access.
- Assign limits and contact data.

Current state:

- Form logic exists.
- Submission updates local state.

Target state:

- Insert vendor organization.
- Create wallet.
- Create vendor user.
- Send invite.
- Write audit log.

### Users And Roles

Route:

- `#/wallet/admin/users-roles`

Purpose:

- Manage wallet staff users.
- Manage vendor users.
- Suspend users.
- Reset users.
- Invite users.
- Review roles.

Current state:

- Table UI exists.
- Demo user actions exist.

Target state:

- Use real auth users.
- Use role permission tables.
- Enforce maker-checker for sensitive roles.

### Verification

Route:

- `#/wallet/admin/verification`

Purpose:

- Review vendor onboarding submissions.
- Approve vendors.
- Reject vendors.
- Request changes.

Current state:

- Decision logic exists locally.

Target state:

- Persist onboarding status.
- Store documents in Supabase Storage.
- Write immutable audit logs.

### All Wallets

Route:

- `#/wallet/admin/all-wallets`

Purpose:

- View all wallet balances.
- View wallet status.
- Freeze wallet.
- Inspect ledger.

Current state:

- Page exists in wallet admin shell.

Target state:

- Use wallet and ledger tables.
- Balance is derived from ledger.
- Direct balance edits are avoided.

### Funding And Credits

Route:

- `#/wallet/admin/funding-credits`

Purpose:

- Review funding requests.
- Approve funding.
- Reject funding.
- Handle manual credits.

Current state:

- Approval and rejection methods exist.

Target state:

- Funding approval writes ledger entries.
- Manual credit requires approval.
- Proof files are stored.
- Audit logs are immutable.

### Purchase Monitor

Route:

- `#/wallet/admin/purchase-monitor`

Purpose:

- Monitor vendor purchases.
- See token purchases.
- See remote-send purchases.
- Open receipts.
- Open audit traces.

Current state:

- Page exists in admin shell.

Target state:

- Purchase orders load from backend.
- Each order has status, delivery, receipt, and audit trail.

### Exceptions

Route:

- `#/wallet/admin/exceptions`

Purpose:

- Review failed purchases.
- Review delivery failures.
- Review stuck remote-send tasks.

Target state:

- Exceptions are created automatically from failed jobs.
- Staff can resolve with reason codes.

### Reversals

Route:

- `#/wallet/admin/reversals`

Purpose:

- Handle wallet reversals.
- Reverse failed purchases.
- Record reason.

Target state:

- Use compensating ledger entries.
- Never delete original ledger entries.

### Disputes

Route:

- `#/wallet/admin/disputes`

Purpose:

- Track vendor or customer disputes.
- Attach evidence.
- Resolve cases.

Target state:

- Dispute lifecycle is persisted.
- Files are stored.
- Outcomes write audit logs.

### Settlement

Route:

- `#/wallet/admin/settlement`

Purpose:

- Reconcile vendor funding and purchases.
- Produce settlement reports.

Current services:

- `loadReconciliationReport`
- `runReconciliation`

Target state:

- Scheduled reconciliation jobs.
- Settlement batches.
- Exportable reports.

### Reports

Route:

- `#/wallet/admin/reports`

Purpose:

- Export wallet reports.
- Review sales.
- Review funding.
- Review vendor performance.

Target state:

- Reports use snapshots and query views.
- Export files have retention policy.

### Audit Log

Route:

- `#/wallet/admin/audit-log`

Purpose:

- Track wallet actions.
- Track admin decisions.
- Track approvals.
- Track security events.

Target state:

- Immutable audit events.
- Searchable by actor, target, action, and date.

## Vendor Wallet Pages

Vendor pages are rendered mainly by:

- `src/components/vendor/VendorWalletPage.vue`

### Vendor Dashboard

Route:

- `#/wallet/vendor/dashboard`

Purpose:

- Show vendor balance.
- Show daily sales.
- Show purchase count.
- Show recent funding.
- Show recent receipts.

Current state:

- Uses demo bootstrap when needed.
- Loads summary through wallet service.

Target state:

- Loads authenticated vendor organization.
- Shows live ledger-derived balance.

### Vendor Wallet

Route:

- `#/wallet/vendor/wallet`

Purpose:

- Show wallet balance.
- Show ledger.
- Show funding history.

Target state:

- Ledger rows load from backend.
- Running balance is visible.

### Buy Units

Route:

- `#/wallet/vendor/buy-units`

Purpose:

- Let vendor vend electricity units.
- Choose customer/meter.
- Enter purchase amount.
- Generate token or remote-send token.
- Produce receipt.

Current methods:

- `submitPurchase`
- `createTokenPurchase`
- `createRemoteSendPurchase`
- `completeTokenPurchase`
- `markRemoteSendPending`
- `completeRemoteSend`
- `setReceipt`

Target state:

- Debit wallet atomically.
- Generate token through CRM logic.
- Store purchase order.
- Store receipt.
- Handle failure safely.

### Vendor Receipts

Route:

- `#/wallet/vendor/receipts`

Purpose:

- View vendor receipts.
- Copy receipt.
- Reprint receipt.
- Download receipt PDF.

Target state:

- Receipt files are stored.
- Receipt metadata is queryable.
- Receipt numbers are automatic.

### Wallet Operations

Route:

- `#/wallet/vendor/operations`

Purpose:

- Vendor funding.
- Vendor history.
- Wallet activities.

Current methods:

- `submitFunding`
- `createFundingRequest`
- `uploadFundingProof`

Target state:

- Funding proof upload.
- Funding approval workflow.
- Ledger credit after approval.

## CRM To Wallet Connection

### Shared Navigation

The CRM and wallet are connected through one route manifest.

Wallet routes appear inside the CRM sidebar based on role.

Staff users see admin wallet routes.

Vendor users see vendor wallet routes.

### Shared Auth

The CRM and wallet use the same session source from `api.js`.

This allows:

- One login.
- One role identity.
- One session timeout policy.
- One user object.
- One permission model.

### Shared Master Data

Wallet vending depends on CRM data:

- Customers.
- Meters.
- Tariffs.
- Stations.
- Debt.
- Token generation rules.

Vendor wallet should not own this master data.

It should read it through controlled APIs or views.

### Shared Token Logic

The CRM token generation flow is the standard.

Wallet buy-units must call or reuse that same token logic.

This prevents duplicate vending rules.

### Shared Receipt Standard

The CRM browser print design is the receipt standard.

Wallet receipts, PDF exports, and receipt previews should match that layout.

Receipt output should include:

- Receipt ID.
- Customer ID.
- Customer name.
- Meter ID.
- Meter type.
- Tariff ID.
- Station ID.
- Amount paid.
- Total unit.
- Token.
- Tax/VAT.
- Time.
- Company footer.

### Shared Audit

CRM admin logs and wallet audit logs should be connected.

Wallet audit should capture:

- Vendor creation.
- User invite.
- Role change.
- Funding approval.
- Funding rejection.
- Manual credit.
- Wallet freeze.
- Purchase creation.
- Purchase completion.
- Reversal.
- Dispute update.
- Settlement run.
- Export generation.

## Main Wallet Data Model

### vendor_organizations

Stores vendor companies.

Suggested fields:

- `id`
- `name`
- `contact_name`
- `email`
- `phone`
- `status`
- `risk_level`
- `created_at`
- `approved_at`
- `approved_by`

### vendor_users

Links auth users to vendor organizations.

Suggested fields:

- `id`
- `vendor_organization_id`
- `user_id`
- `role`
- `status`
- `created_at`

### vendor_onboarding_submissions

Stores onboarding requests.

Suggested fields:

- `id`
- `vendor_organization_id`
- `submitted_by`
- `status`
- `payload`
- `reviewed_by`
- `reviewed_at`
- `review_note`

### wallets

Stores one wallet per vendor organization.

Suggested fields:

- `id`
- `vendor_organization_id`
- `currency`
- `status`
- `created_at`

### wallet_ledger_entries

Stores immutable money movement.

Suggested fields:

- `id`
- `wallet_id`
- `direction`
- `amount_minor`
- `balance_after_minor`
- `entry_type`
- `reference_type`
- `reference_id`
- `memo`
- `created_by`
- `created_at`

Rules:

- Never delete entries.
- Never edit money values.
- Use reversal entries.
- Balance comes from ledger.

### funding_requests

Stores vendor funding deposits.

Suggested fields:

- `id`
- `vendor_organization_id`
- `wallet_id`
- `amount_minor`
- `status`
- `proof_file_id`
- `submitted_by`
- `approved_by`
- `approved_at`
- `rejected_by`
- `rejected_at`
- `rejection_reason`

### purchase_orders

Stores vendor vending purchases.

Suggested fields:

- `id`
- `vendor_organization_id`
- `wallet_id`
- `customer_id`
- `customer_name`
- `meter_id`
- `station_id`
- `tariff_id`
- `amount_minor`
- `units`
- `purchase_mode`
- `status`
- `token`
- `remote_task_id`
- `receipt_id`
- `created_by`
- `created_at`

### receipts

Stores receipt metadata.

Suggested fields:

- `id`
- `purchase_order_id`
- `receipt_number`
- `pdf_file_id`
- `print_name`
- `payload`
- `created_at`

### wallet_files

Stores uploaded or generated files.

Suggested file types:

- Funding proof.
- Vendor document.
- Receipt PDF.
- Export CSV.
- Export PDF.
- Settlement report.

### manual_credit_requests

Stores manual wallet adjustments.

Suggested fields:

- `id`
- `wallet_id`
- `amount_minor`
- `reason`
- `status`
- `requested_by`
- `approved_by`
- `created_at`
- `approved_at`

### settlement_batches

Stores settlement runs.

Suggested fields:

- `id`
- `period_start`
- `period_end`
- `status`
- `totals`
- `created_by`
- `created_at`

### audit_logs

Stores immutable system actions.

Suggested fields:

- `id`
- `actor_user_id`
- `actor_role`
- `action`
- `target_type`
- `target_id`
- `before_data`
- `after_data`
- `ip_address`
- `user_agent`
- `created_at`

## Main End-To-End Flows

### 1. Staff Login Flow

1. Staff logs into CRM.
2. Session loads from `api.js`.
3. Role is normalized.
4. Route manifest filters visible pages.
5. Wallet staff routes appear.
6. Staff opens wallet admin page.

### 2. Vendor Login Flow

1. Vendor user logs in.
2. Session loads from `api.js`.
3. Role resolves as vendor.
4. Vendor wallet routes appear.
5. Vendor lands on wallet dashboard.
6. Vendor can fund wallet or buy units.

### 3. Vendor Creation Flow

1. Staff opens Create Vendor.
2. Staff enters vendor details.
3. System creates vendor organization.
4. System creates wallet.
5. System creates vendor user.
6. System sends invite or credentials.
7. Audit log records action.

### 4. Vendor Onboarding Flow

1. Vendor submits onboarding data.
2. Vendor uploads documents.
3. Submission enters pending review.
4. Staff reviews verification page.
5. Staff approves or rejects.
6. Vendor status updates.
7. Audit log records decision.

### 5. Funding Flow

1. Vendor opens funding form.
2. Vendor enters amount.
3. Vendor uploads proof.
4. Funding request becomes pending.
5. Staff reviews request.
6. Staff approves or rejects.
7. Approval writes wallet ledger credit.
8. Wallet balance updates.
9. Audit log records decision.

### 6. Token Purchase Flow

1. Vendor opens Buy Units.
2. Vendor selects customer or enters meter.
3. System validates customer and tariff.
4. Vendor enters amount.
5. System checks wallet balance.
6. System creates purchase order.
7. System debits wallet ledger.
8. System generates token through CRM token logic.
9. System stores token result.
10. System creates receipt.
11. Vendor sees receipt.
12. Admin can monitor purchase.

### 7. Remote Send Purchase Flow

1. Vendor creates purchase.
2. System validates meter.
3. System debits wallet.
4. System creates remote token task.
5. Purchase status becomes pending remote delivery.
6. Remote operation task completes.
7. Purchase status becomes completed.
8. Receipt becomes available.
9. Failure creates exception.

### 8. Failed Purchase Flow

1. Purchase fails during token generation or remote send.
2. System marks purchase failed.
3. Exception is created.
4. Staff reviews exception.
5. Staff retries, reverses, or resolves.
6. Reversal uses compensating ledger entry.
7. Audit log records action.

### 9. Receipt Flow

1. Purchase completes.
2. Receipt payload is created.
3. Browser print uses CRM standard layout.
4. PDF export uses same layout and data.
5. PDF file is stored.
6. Receipt name is automatic.
7. Vendor and admin can reopen receipt.

### 10. Reconciliation Flow

1. Scheduled job gathers funding and purchases.
2. System compares ledger, purchases, and receipts.
3. Reconciliation report is generated.
4. Exceptions are flagged.
5. Staff reviews settlement.
6. Settlement batch is closed.
7. Report export is stored.

## Important Logic Functions

### Route Manifest Logic

File:

- `src/data/route-manifest.js`

Responsibilities:

- Define routes.
- Define API mapping.
- Define sidebar groups.
- Normalize roles.
- Filter visible routes.
- Separate wallet staff pages.
- Separate wallet vendor pages.

Key logic:

- `normalizeRoleId`
- `visibleRoutes`
- `walletStaffRoles`
- `walletVendorRoles`
- `vendorWalletHashes`

### Admin Wallet Logic

File:

- `src/components/wallet/AdminWalletOperationsPage.vue`

Responsibilities:

- Render wallet admin pages.
- Determine active wallet page.
- Show dashboard cards.
- Show wallet charts.
- Render wallet tables.
- Run staff actions.
- Append audit rows.

Key logic:

- `syncHash`
- `activePage`
- `matches`
- `clearFilters`
- `exportCurrentView`
- `inviteUser`
- `suspendUser`
- `resetUser`
- `freezeVendor`
- `regeneratePassword`
- `createVendorAccount`
- `confirmVerificationDecision`
- `approveFunding`
- `rejectFunding`
- `openProof`
- `openReceipt`
- `openAudit`
- `generateReport`

### Vendor Wallet Logic

File:

- `src/components/vendor/VendorWalletPage.vue`

Responsibilities:

- Render vendor wallet pages.
- Load wallet summary.
- Submit funding.
- Submit purchases.
- Build receipts.
- Copy receipts.
- Switch vendor tabs.

Key logic:

- `initialTabFromHash`
- `bootstrap`
- `ensureDemoWallet`
- `refresh`
- `selectCustomer`
- `submitFunding`
- `submitPurchase`
- `makeToken`
- `setReceipt`
- `copyReceipt`

### Vendor Wallet Service Logic

File:

- `src/services/vendor-wallet-service.mjs`

Responsibilities:

- Create vendor organization.
- Approve vendor organization.
- Load wallet summary.
- Create funding request.
- Upload funding proof.
- Approve funding.
- List funding requests.
- Create purchases.
- Complete purchases.
- Load ledger rows.
- Submit onboarding.
- Review onboarding.
- Handle manual credits.
- Run reconciliation.

Key logic:

- `createVendorOrganization`
- `approveVendorOrganization`
- `loadWalletSummary`
- `createFundingRequest`
- `uploadFundingProof`
- `approveFundingRequest`
- `listFundingRequests`
- `createTokenPurchase`
- `createRemoteSendPurchase`
- `completeTokenPurchase`
- `markRemoteSendPending`
- `completeRemoteSend`
- `listPurchaseOrders`
- `loadLedgerRows`
- `submitOnboarding`
- `reviewOnboarding`
- `requestManualCredit`
- `approveManualCredit`
- `listManualCredits`
- `loadReconciliationReport`
- `runReconciliation`

### Vendor Purchase Service Logic

File:

- `src/services/vendor-purchase-service.mjs`

Responsibilities:

- Wrap wallet purchase APIs.
- Normalize purchase results.
- Convert purchase result to receipt.
- Hide low-level API details from UI.

### Vendor Funding Service Logic

File:

- `src/services/vendor-funding-service.mjs`

Responsibilities:

- Wrap funding APIs.
- Convert naira amount to minor units.
- Prepare proof uploads.
- Normalize funding result.

### Core API Logic

File:

- `src/services/api.js`

Responsibilities:

- Login.
- Demo login.
- Session cookies.
- API GET/POST/upload.
- Session timeout.
- Current user info.
- Live write gating.

### Table Logic

File:

- `src/services/table-service.js`

Responsibilities:

- Build table requests.
- Load route table data.
- Export route rows.
- Build receipt print model.
- Keep CRM tables consistent.

## Current State

Implemented now:

- Wallet routes exist.
- Wallet sidebar integration exists.
- Wallet admin shell exists.
- Vendor wallet shell exists.
- Wallet service functions exist.
- Funding flow UI exists.
- Purchase flow UI exists.
- Receipt handling exists.
- Admin dashboard UI exists.
- Wallet tables are styled like Beverly CRM.
- Wallet theme awareness has been improved.
- Wallet route access is role-based.

Partially implemented:

- Backend persistence.
- Live wallet admin data.
- Live vendor records.
- Live funding approvals.
- Live purchase monitor.
- Live settlement reports.
- Real file storage for receipts and proofs.
- Scheduled refresh jobs.
- Cleanup retention jobs.

Still demo/local in places:

- Dashboard KPI values.
- Vendor admin rows.
- Users and roles rows.
- Audit rows.
- Some wallet queue counts.
- Some vendor bootstrap behavior.

## Target Production Design

### Supabase Postgres

Move wallet data into Supabase Postgres.

Best candidates:

- Vendor organizations.
- Vendor users.
- Roles.
- Permissions.
- Wallets.
- Ledger entries.
- Funding requests.
- Purchase orders.
- Receipts.
- Manual credits.
- Reversals.
- Disputes.
- Settlement batches.
- Audit logs.
- Snapshot tables.

### Supabase Auth

Use Supabase Auth for:

- Staff login.
- Vendor login.
- Role claims.
- Session handling.
- Password reset.
- Invite flows.

### Supabase Storage

Use Supabase Storage for:

- Funding proof uploads.
- Vendor onboarding files.
- Receipt PDFs.
- Exported CSV files.
- Exported PDF files.
- Settlement reports.

### Row Level Security

Enable RLS for:

- Vendor organizations.
- Wallets.
- Ledger entries.
- Funding requests.
- Purchase orders.
- Receipts.
- Files.
- Audit logs.

Vendor users should only see their organization.

Staff users should see wallet admin data based on permission.

### Scheduled Jobs

Scheduled jobs should handle:

- Dashboard snapshot refresh.
- API cache refresh.
- Stuck purchase detection.
- Remote-send status sync.
- Cache expiry cleanup.
- Snapshot retention cleanup.
- Export retention cleanup.
- Settlement generation.
- Backup/restore drill reminders.
- Role permission audit.

## Data Governance

### Cache Expiry Cleanup

Cached API responses should expire automatically.

Recommended:

- Short-lived dashboard cache.
- Medium-lived report cache.
- Manual invalidation after writes.

### Snapshot Retention

Dashboard snapshots should be retained by policy.

Recommended:

- Hourly snapshots for 30 days.
- Daily snapshots for 12 months.
- Monthly summaries for long-term reporting.

### Export Retention

Exported files should expire.

Recommended:

- Standard exports: 30 days.
- Settlement exports: 12 months.
- Audit exports: controlled by admin policy.

### Backup And Restore Drill

Run scheduled restore drills.

Minimum:

- Monthly restore test.
- Verify auth users.
- Verify wallet ledger.
- Verify receipts.
- Verify storage files.

### Role Permission Audit

Run a recurring permission audit.

Check:

- Dormant users.
- Vendor users without vendor org.
- Staff with elevated roles.
- Permission drift.
- Suspended users with active sessions.

## Security Rules

### Wallet Money Rules

- Wallet balances must be ledger-derived.
- Money entries must be immutable.
- Corrections must use reversal entries.
- Funding approval must be audited.
- Manual credit must use maker-checker.
- Vendor cannot approve own funding.
- Vendor cannot change tariff.
- Vendor cannot edit CRM master data.

### Purchase Rules

- Wallet balance check must happen before debit.
- Debit and purchase creation must be atomic.
- Token generation result must be stored.
- Failed token generation must not silently lose money.
- Remote-send pending state must be visible.
- Reversal must preserve original purchase record.

### Receipt Rules

- Receipt ID must be unique.
- PDF and browser print must match.
- Receipt names must be automatic.
- Receipt payload must be stored.
- Receipt download must be repeatable.

## Design System

### Design Goal

The CRM and Wallet should feel like one platform.

Wallet pages should not feel separate.

They should inherit Beverly CRM:

- Sidebar quality.
- Font sizing.
- Font family.
- Table behavior.
- Button style.
- Card density.
- Modal layout.
- Chart styling.
- Theme awareness.

### Visual Identity

Primary brand:

- Beverly.

Sidebar logo:

- Green rounded square.
- White `B`.
- Text label `Beverly`.

Do not replace the sidebar logo with `ACOB CRM3` inside wallet pages.

Company identity can appear in receipts, reports, and document footers.

### Typography

The platform should use one font system.

Recommended direction:

- Same Beverly CRM font family.
- Bold page titles.
- Compact table labels.
- Smaller metadata text.
- No oversized wallet-only typography.

Text sizing:

- Page title: strong, readable.
- Section title: medium.
- Table header: compact uppercase.
- Field label: small.
- Field value: normal.
- Metadata: muted and smaller.

Wallet pages should avoid giant marketing-style headings.

### Theme System

Everything must be theme-aware.

Required surfaces:

- App background.
- Sidebar background.
- Navbar background.
- Table background.
- Table hover rows.
- Stat cards.
- Modals.
- Modal header.
- Modal footer.
- Form inputs.
- Dropdowns.
- Buttons.
- Charts.
- Tooltips.
- Receipt preview modal.
- Print hover modal.

Theme tokens should control:

- Background color.
- Surface color.
- Border color.
- Text color.
- Muted text color.
- Accent color.
- Success color.
- Warning color.
- Danger color.
- Chart colors.

Avoid hardcoded one-off colors in wallet pages.

### Layout System

The wallet layout should match CRM page rhythm.

Shared layout rules:

- Fixed left sidebar.
- Top navbar.
- Main content area.
- Consistent page gutters.
- Dense operational spacing.
- No unnecessary empty header bands.
- No decorative marketing sections.

Wallet dashboard cards:

- Use a 2x3 grid on desktop.
- Use 2 columns where space allows.
- Collapse cleanly on smaller screens.
- Keep card heights consistent.

Chart layout:

- Wallet Balance Trend and Operational Queues sit on the same row.
- Success vs Failure chart is removed.
- Bar charts use Beverly CRM chart behavior.
- Hover state should show meaningful values.

### Sidebar System

The wallet sidebar should match Beverly CRM.

Required behavior:

- Same logo treatment.
- Same active item style.
- Same icon sizing.
- Same section label style.
- Same badge style.
- Same item spacing.
- Same sign-out placement.

Removed wallet sidebar blocks:

- Finance Admin status pill.
- All systems operational card.

The sidebar should stay focused on navigation.

### Navbar System

Wallet navbars should match CRM density.

Required behavior:

- Page title on left.
- Action controls on right.
- No unused search bar.
- No blank divider section below navbar.
- Notification and user buttons remain consistent.

Removed navbar items:

- Top-right global wallet search bar.
- Empty band below navbar.

### Table System

Wallet tables should copy Beverly CRM table behavior.

Required table properties:

- Sticky header.
- Compact rows.
- Clear hover state.
- Pagination.
- Page-size control.
- Search/filter support where useful.
- Export button where useful.
- Row action buttons.
- Consistent empty state.
- Theme-aware borders.
- Theme-aware row background.

Table UX rules:

- Important IDs stay visible.
- Status should use badges.
- Money should be right-aligned.
- Dates should be scannable.
- Actions should be compact.

Pages needing CRM table system:

- Vendors.
- Users and Roles.
- Verification.
- All Wallets.
- Funding and Credits.
- Purchase Monitor.
- Exceptions.
- Reversals.
- Disputes.
- Settlement.
- Reports.
- Audit Log.

### Card System

Stat cards should match Beverly CRM.

Required behavior:

- Compact information density.
- Consistent icon size.
- Consistent value size.
- Consistent label size.
- Theme-aware background.
- Theme-aware border.
- No nested card styling.

Wallet dashboard cards:

- Total Vendors.
- Active Wallets.
- Pending Funding.
- Today's Purchases.
- Frozen Wallets.
- Failed Transactions.

### Button System

Buttons should match Beverly CRM.

Required button rules:

- Primary action uses green.
- Secondary action uses muted surface.
- Danger action uses danger color.
- Disabled action has clear opacity.
- Icon buttons use consistent dimensions.
- Button text must not overflow.

Button labels should be direct:

- Review.
- Approve.
- Reject.
- Export.
- Invite.
- Freeze.
- View.

### Modal System

All CRM and wallet modals should share one modal pattern.

Required modal rules:

- Header height should be compact.
- Header title should not sit inside an extra placeholder card.
- Close icon goes on the far right.
- Footer height should be compact.
- Footer should not contain extra placeholder blocks.
- Labels are left-aligned.
- Inputs are left-aligned.
- Body content is scrollable when needed.
- Header and footer remain visible when body scrolls.
- Modal is theme-aware.

Removed modal elements:

- Extra title placeholder div.
- Oversized top bar.
- Oversized bottom footer.
- Center-aligned field labels.

### Form System

Forms should match CRM behavior.

Required form rules:

- Labels left-aligned.
- Inputs left-aligned.
- Two-column forms on desktop.
- Single-column forms on mobile.
- Selects match input styling.
- Validation appears near field.
- Required fields are clear.
- Values do not overflow.

Wallet form examples:

- Create Vendor.
- Recharge.
- Funding Request.
- User Invite.
- Verification Review.
- Manual Credit.

### Receipt Design System

Browser print is the receipt standard.

PDF export must match browser print.

Receipt preview must match browser print.

Receipt modal must match browser print.

Receipt layout rules:

- Beverly logo block at top.
- Receipt ID block top-right.
- Amount purchased block.
- Customer and meter summary.
- Token block.
- Details grid.
- Company footer.

Duplicate fields should be avoided.

Only one full detail section should contain:

- Customer ID.
- Customer Name.
- Meter ID.
- Total Paid.
- Total Unit.

The small summary above token can include:

- Customer.
- Meter.
- Unit.
- Station.

Receipt naming:

- PDF names should be automatic.
- Browser print names should be automatic.
- Include receipt ID.
- Include customer or vendor slug.
- Include date.

Example:

- `Beverly_Credit_Token_Receipt_9957_alhaji_isah_baki_2026-05-12.pdf`

### Chart System

Charts should use Beverly CRM chart properties.

Required chart behavior:

- Theme-aware axis.
- Theme-aware grid.
- Theme-aware tooltip.
- Theme-aware bars.
- Clear hover values.
- No invisible labels.
- No hardcoded dark-only colors.

Dashboard chart rules:

- Wallet Balance Trend uses CRM bar chart style.
- Operational Queues sits beside it.
- Success vs Failure chart remains removed.

### Accessibility

Minimum requirements:

- Buttons have readable contrast.
- Inputs have visible focus.
- Tables remain keyboard usable.
- Modals trap focus.
- Close buttons have labels.
- Text does not overlap.
- Text fits inside buttons.
- Theme switch does not break readability.

### Responsive Rules

Desktop:

- Sidebar remains fixed.
- Cards use 2x3 grid.
- Tables use full width.
- Chart and queues share a row.

Tablet:

- Cards use 2 columns.
- Tables scroll horizontally if needed.
- Modals use safe width.

Mobile:

- Cards use 1 column.
- Forms use 1 column.
- Tables use horizontal scroll.
- Modal body scrolls.

### Design Acceptance Checklist

Design is complete when:

- CRM and Wallet look like one product.
- Wallet sidebar uses Beverly logo.
- Wallet pages use CRM typography.
- Wallet tables match CRM tables.
- Wallet stat cards match CRM cards.
- Wallet modals match CRM modals.
- Wallet charts match CRM charts.
- Wallet receipts match browser print.
- All wallet pages support theme changes.
- No finance admin pill remains in sidebar.
- No operational status card remains in sidebar.
- No unused top search remains.
- No blank navbar divider remains.
- No modal labels are center-aligned.
- No receipt detail fields are duplicated.

## Recommended Rollout Order

### Phase 1: Wallet Persistence

Move from demo/local state to Supabase tables.

Includes:

- Vendors.
- Wallets.
- Funding.
- Purchases.
- Receipts.
- Audit logs.

### Phase 2: Ledger Integrity

Make ledger the source of truth.

Includes:

- Immutable ledger.
- Atomic debits.
- Atomic credits.
- Reversals.
- Balance views.

### Phase 3: Receipt Storage

Make receipts durable.

Includes:

- Receipt payload table.
- PDF storage.
- Automatic naming.
- Reprint support.

### Phase 4: Admin Workflows

Wire admin pages to live data.

Includes:

- Vendor creation.
- User roles.
- Verification.
- Funding approval.
- Purchase monitor.
- Exceptions.

### Phase 5: Scheduled Jobs

Add scheduled platform maintenance.

Includes:

- Snapshot refresh.
- Stuck purchase scan.
- Remote-send sync.
- Cache cleanup.
- Export cleanup.
- Permission audit.

### Phase 6: Reports And Settlement

Complete finance reporting.

Includes:

- Settlement batches.
- Reconciliation.
- Vendor reports.
- Audit exports.

## High-Value Improvements

### Fast Access

Use snapshots for dashboards.

Use indexed wallet tables.

Use cached report views.

### Easier Data Capture

Keep CRM master data central.

Use vendor wallet forms for sales capture.

Store every purchase as structured data.

### Better Finance Control

Use ledger entries.

Use maker-checker approval.

Use audit logs.

Use reconciliation reports.

### Better Vendor Experience

Give vendors one place to:

- Fund wallet.
- Buy units.
- View balance.
- Reprint receipts.
- Track history.

### Better Operations Control

Give staff one place to:

- Manage vendors.
- Approve funding.
- Monitor purchases.
- Resolve failures.
- Export reports.

## Known Gaps

Current gaps to close:

- Replace demo wallet admin data.
- Replace demo vendor bootstrap data.
- Persist wallet actions.
- Persist admin audit logs.
- Persist receipt PDFs.
- Connect purchase monitor to real purchase orders.
- Connect wallet charts to snapshots.
- Connect settlement page to reconciliation runs.
- Add RLS policy coverage.
- Add scheduled refresh jobs.
- Add cleanup retention jobs.

## Acceptance Checklist

Wallet is production-ready when:

- Staff roles load correct pages.
- Vendor roles load correct pages.
- Vendor creation persists.
- Vendor approval persists.
- Wallet balance is ledger-derived.
- Funding approval creates ledger credit.
- Purchase creates ledger debit.
- Token purchase creates receipt.
- Remote-send purchase tracks task status.
- Failed purchase creates exception.
- Reversal creates compensating ledger entry.
- Receipt PDF matches browser print.
- Receipt PDF is stored.
- Audit logs cover all sensitive actions.
- Dashboard cards use live data.
- Charts use real snapshots.
- Reports export real data.
- Scheduled jobs refresh and clean data.
- RLS prevents cross-vendor access.

## Final System Direction

The CRM should remain the master operations system.

The wallet should become the controlled vending finance layer.

CRM owns meters, customers, tariffs, stations, and token logic.

Wallet owns vendor money, funding, purchases, receipts, and settlement.

The best architecture is not two separate products.

The best architecture is one Beverly operations platform with a wallet module that uses shared identity, shared master data, shared receipt standards, and separate financial controls.
