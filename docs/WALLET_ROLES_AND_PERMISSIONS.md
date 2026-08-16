# Wallet Roles And Permissions (Simple Guide)

This page explains:

1. Who can use the wallet system.
2. What each person can do.
3. What each person cannot do.

---

## 1) The 3 User Types

### A) Admin Staff

These are internal Beverly team members.

Examples:

- Super Admin
- Developer
- Operations Manager
- Finance Checker
- Account Officer

### B) Vendor User

These are vendor company staff.

They use the vendor portal.

### C) Customer

These are end customers.

They use the customer wallet portal.

---

## 2) Admin Staff Roles (Plain English)

## Super Admin

Can do everything.

Also the only role that can:

- Change roles and permissions.
- Freeze/unfreeze/close/reactivate wallets.
- Transfer available balance between vendor wallets after MFA, approval, and confirmation.

## Developer

Can:

- Access the Developer Console when it is enabled and the required production elevation is present.
- Transfer available balance between vendor wallets after MFA, approval, and confirmation.

Cannot:

- Access other Wallet Admin business functions by default.
- Gain transfer authority merely because a custom role receives the permission; the server also requires the explicit `developer` or `super-admin` role.

## Operations Manager

Focuses on operations.

Can:

- Monitor vending and purchases.
- Review vendors.
- Manage disputes and support.
- View customers.
- Run reconciliation.
- View audit logs.
- View consumption and abnormal alarms.

Cannot:

- Approve funding.
- Change access control.
- Manage feature flags.

## Finance Checker

Focuses on money controls.

Can:

- View funding queue/history.
- Approve/reject funding.
- Approve/reject refunds.
- View settlement.
- Run reconciliation.
- View audit logs.

Cannot:

- Manage vendors.
- Manage support tickets/FAQ/chat.
- Manage access control.

## Account Officer

Focuses on account visibility.

Can:

- View dashboard.
- View funding data.
- View customers.
- Monitor purchases/vending.
- View settlement.
- Run reconciliation.

Cannot:

- Approve funding/refunds.
- Manage vendors.
- Manage access control.

---

## 3) Vendor User Can Do

Vendors can only handle their own business data.

They can:

- View and edit own profile.
- Upload/change profile picture.
- See own wallet and ledger.
- Fund wallet (including proof upload).
- Preview and buy tokens.
- View own purchases and receipts.
- Open disputes.
- Use support ticket/chat.
- Set up MFA.
- Set or verify vend credential.

They cannot:

- Access admin pages.
- Access other vendors’ data.
- Change system roles or permissions.

---

## 4) Customer Can Do

Customers can only handle their own account.

They can:

- Sign up and log in.
- Edit own profile.
- Upload/change profile picture.
- Complete KYC steps.
- Link/unlink own meters.
- View own wallet and ledger.
- Fund wallet.
- Preview and buy tokens.
- See transactions and receipts.
- Create meter orders.
- Open disputes.
- Use support ticket/chat.
- Request data export/deletion flows.

They cannot:

- Access admin pages.
- Access vendor pages.
- Access other customers’ data.

---

## 5) High-Level Permission Buckets (Admin)

Think of permissions like feature switches.

- Dashboard view
- Vendors review/manage
- Customers view
- Funding view/approve
- Vendor balance transfers manage
- Vending monitor
- Refunds manage
- Disputes manage
- Support manage
- Settlement view
- Reconciliation run
- Fraud review
- Privacy review
- Audit view
- Feature flags manage
- Access control manage
- Consumption analytics view

If a role does not have a permission, route access is blocked.

---

## 6) Safety Rules Built In

1. Access is deny-by-default.
2. Unmapped admin route is blocked.
3. Permission denials are audit-logged.
4. Super Admin has full permission set.
5. Role/permission edits are Super Admin only.
6. Vendor transfers require `wallet.vendor_transfers.manage` plus the `super-admin` or `developer` role and verified MFA.

---

## 7) Quick “Who Handles What” Map

- Vendor onboarding: Super Admin, Operations Manager (review), Super Admin (full manage).
- Funding approvals: Finance Checker, Super Admin.
- Vendor-to-vendor balance transfers: Super Admin or Developer only.
- Refund approvals: Finance Checker, Super Admin.
- Disputes/support: Operations Manager, Super Admin.
- Feature flags: Super Admin only (or role with flag permission if granted).
- User/role management: Super Admin only.

---

## 8) One-Line Summary

Admins run platform controls.

Vendors run their organization activity.

Customers run their personal wallet activity.

