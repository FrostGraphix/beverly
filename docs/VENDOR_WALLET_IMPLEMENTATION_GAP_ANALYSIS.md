# Vendor Wallet Implementation Gap Analysis

Status:
- Audit document.
- Based on implemented wallet files.
- Based on root `ARCHITECTURE.md`.
- Based on `docs/VENDOR_WALLET_IMPLEMENTATION_MASTER_PLAN.md`.
- The provided Claude artifact URL was not fetchable from this environment, so visual guidance is inferred from the written flow, Beverly's design system, and the implemented screens.

## Executive Summary

The wallet system is partially implemented and buildable.

The backend foundation is stronger than the frontend experience.

The current implementation proves:
- local vendor organizations
- wallet provisioning
- funding requests
- funding approval
- manual credit maker-checker
- purchase holds
- token completion
- remote-send completion
- receipt records
- reconciliation summary

The current implementation does not yet prove:
- real vendor portal separation
- real vendor authentication flow
- forced password reset
- real onboarding UI
- proof file upload
- finance-grade review UX
- production Supabase persistence wiring
- strong cross-tenant server authorization
- direct customer purchase
- complete Figma-level design system screens

## Current Implementation Map

Implemented backend files:
- `backend/src/services/wallet-ledger-service.js`
- `backend/src/services/wallet-funding-service.js`
- `backend/src/services/wallet-purchase-service.js`
- `backend/src/services/wallet-approval-service.js`
- `backend/src/services/wallet-reconciliation-service.js`
- `backend/src/services/vendor-onboarding-service.js`

Implemented frontend files:
- `src/components/VendorWalletPage.vue`
- `src/components/AdminWalletOperationsPage.vue`
- `src/services/vendor-wallet-service.mjs`

Implemented persistence:
- `supabase/migrations/20260512190000_vendor_wallet_foundation.sql`

Implemented tests:
- `tests/wallet-ledger.test.cjs`
- `tests/wallet-api.test.cjs`
- `tests/wallet-frontend-contract.test.cjs`

Implemented docs:
- `docs/VENDOR_WALLET_GOAL_TRACKER.md`
- `docs/VENDOR_WALLET_IMPLEMENTATION_MASTER_PLAN.md`

## Verification Run

Commands run:

```powershell
node --disable-warning=ExperimentalWarning tests/wallet-ledger.test.cjs
node --disable-warning=ExperimentalWarning tests/wallet-api.test.cjs
node --disable-warning=ExperimentalWarning tests/wallet-frontend-contract.test.cjs
npm run build
```

Results:
- wallet ledger tests passed
- wallet API tests passed
- wallet frontend contract passed
- production build passed

Build warning:
- main application bundle is above the Vite 500 kB warning threshold

## Architecture Fit

What matches:
- wallet API paths use lowercase `/api/wallet/*`
- vendor API paths use lowercase `/api/vendor/*`
- wallet financial truth is ledger-derived
- funding approval posts a ledger credit
- purchases place holds before capture
- failed purchases release holds
- maker-checker manual credit exists
- Supabase migration includes wallet tables and RLS policies

What does not match:
- `ARCHITECTURE.md` says vendor pages live in `src/components/vendor/`, but implementation uses `src/components/VendorWalletPage.vue`.
- `ARCHITECTURE.md` says staff wallet surfaces live in `src/components/wallet/`, but implementation uses `src/components/AdminWalletOperationsPage.vue`.
- `ARCHITECTURE.md` names `wallet-hold-service.js`, `wallet-risk-service.js`, and `wallet-audit-service.js`, but those services do not exist.
- `ARCHITECTURE.md` names several frontend wallet services, but implementation collapses most work into `src/services/vendor-wallet-service.mjs`.
- `ARCHITECTURE.md` still lists roles only as Super admin, Operations manager, and Account in the Roles section, despite wallet roles being introduced elsewhere.

Required correction:
- Either move files into the documented directories and split services, or update architecture to reflect the actual implementation.

Recommended correction:
- Move toward the architecture instead of weakening the architecture.

## Security Gap Analysis

### Critical: Demo actor IDs are used in production-facing UI

Current UI sends literal actors such as:
- `admin`
- `finance`
- `vendor-user`
- `finance-checker`
- `ops-maker`

Why this is risky:
- actions can be attributed to fake actors
- maker-checker can be bypassed conceptually
- audit logs become unreliable
- frontend can influence server actor identity when auth is disabled or fallback logic accepts payload actors

Expected behavior:
- backend must derive actor identity from `request.__auth`
- payload `actorId` should be ignored for authenticated wallet writes
- tests should prove forged actor IDs are rejected or ignored

### Critical: Vendor tenant access is not enforced per wallet payload

Current API role gates check role families, but wallet endpoints accept `organizationId` and `walletId`.

Why this is risky:
- a vendor could request another organization's wallet summary if endpoint authorization allows the role and payload is not scoped
- RLS helps only when the direct Supabase client is used with user claims
- current local service path bypasses Supabase RLS

Expected behavior:
- server should compare requested `organizationId` to authenticated vendor claim
- staff roles can access broader scopes
- vendor roles can access only their own organization

### High: Vendor and staff surfaces are not truly separate

Current state:
- wallet routes are added to the same `src/App.vue` shell
- vendor routes are visible through the same sidebar model
- there is no `VendorLoginPage`
- there is no vendor shell

Expected behavior:
- staff login and vendor login are separate entry points
- vendor portal uses a separate route tree and shell
- wrong-role login is blocked before dashboard access

### High: Proof upload is metadata-only

Current state:
- proof upload sends `storagePath`, `fileName`, and `contentType`
- no real file bytes are handled by the wallet UI
- no upload policy is enforced at this screen
- no proof preview exists

Expected behavior:
- vendor selects a real file
- file type and size are validated
- private storage upload succeeds
- proof preview appears in finance review
- duplicate proof hash is recorded

### High: Idempotency keys are generated with `Date.now()`

Current state:
- service layer creates idempotency keys using timestamps

Why this is weak:
- retrying the same user action creates a new key
- double-click protection is not guaranteed
- network retry semantics are not stable

Expected behavior:
- generate an operation ID when the user starts an action
- reuse it for retries of the same action
- store pending idempotency key in component state

### Medium: Finance approval endpoints are too broad

Current state:
- finance-checker or super-admin can approve funding
- manual credit approval uses service-level maker-checker logic
- funding approval checks requester mismatch only by string actor

Expected behavior:
- funding approval should enforce authenticated reviewer identity
- approval should support thresholds
- high-value approvals should require second checker later

## Backend Gap Analysis

What is strong:
- ledger balance is derived
- holds reduce available balance
- purchase capture posts debit
- funding and manual credit post credit
- freeze blocks purchase creation
- failed purchase releases hold
- reconciliation catches delivered orders without capture

Missing or incomplete:
- no real upstream vend dispatch
- no wallet hold expiry sweeper
- no purchase reversal flow exposed
- no risk service for limits or anomaly detection
- no audit service abstraction despite architecture
- no wallet balance snapshots table in local service implementation
- no customer-direct domain
- no bank settlement model
- no duplicate proof hash detection
- no transactional database boundary around multi-step purchase creation

Important risk:
- purchase creation places a hold before inserting the purchase order. If order insertion fails after hold creation, an orphan hold can remain.

Expected backend behavior:
- wrap hold creation and order creation in one database transaction
- or create order first in `created`, then place hold, then atomically promote to `hold_active`

## Frontend Gap Analysis

Current screens are functional demos.

They are not yet production UX.

### Vendor Wallet Page

Current strengths:
- balance is prominent
- pending funding count exists
- token purchase path exists
- remote-send path exists
- receipt panel exists
- history exists

Gaps:
- no dedicated vendor login
- no forced password reset
- no onboarding gate
- no proof upload control
- no review holding page
- no token recovery detail view
- no receipt download
- no copy token action
- no funding channel selection
- no funding reference instructions
- no customer/meter search
- no tariff or unit preview
- no confirmation step before purchase
- no validation messages
- no error display
- no blocked-state guidance
- no low-balance call-to-action
- no real pending remote-send state in UI flow

### Admin Wallet Operations Page

Current strengths:
- vendor creation exists
- funding queue exists
- manual credit queue exists
- reconciliation summary exists

Gaps:
- no vendor list
- no vendor detail page
- no KYC review tabs
- no proof viewer
- no rejection flow
- no reviewer notes
- no freeze/unfreeze controls
- no limit management
- no risk alerts
- no activity log
- no evidence-first layout
- no audit trail display
- no manual credit reason picker
- no manual credit rejection
- no second-level approval design

## UI and UX Screen Plan

### Vendor Portal Shell

Required screens:
- vendor login
- forced password reset
- onboarding form
- pending review page
- rejected onboarding page
- active dashboard
- wallet funding page
- buy token page
- remote-send page
- purchase history page
- receipt detail page
- profile page

Navigation:
- Dashboard
- Wallet
- Buy Token
- Funding
- History
- Receipts
- Profile
- Support

### Vendor Dashboard

Primary content:
- available balance
- held balance
- wallet status
- latest token
- pending funding
- quick top-up
- quick buy token

UX rules:
- balance first
- status second
- actions third
- history always visible

### Funding Screen

Required flow:
- choose funding channel
- enter amount
- generate reference
- show bank/payment instructions
- upload proof
- show proof preview
- submit for review
- show status timeline

Buttons:
- `Request top-up`
- `Upload proof`
- `Replace proof`
- `Cancel request`

Avoid:
- auto-uploading placeholder proof
- hiding rejection reason

### Buy Token Screen

Required flow:
- search customer or meter
- confirm meter identity
- choose amount or units
- preview tariff, tax, and estimated unit
- confirm purchase
- place hold
- complete token generation
- show receipt

Buttons:
- `Search meter`
- `Preview purchase`
- `Generate token`
- `Copy token`
- `Download receipt`
- `Buy again`

Avoid:
- one-click debit without preview
- default sample meter values

### Remote-Send Screen

Required flow:
- search meter
- enter amount
- preview delivery type
- confirm remote send
- show pending, success, failed, or unknown status
- retain remote reference

Buttons:
- `Preview remote send`
- `Send remotely`
- `Check status`
- `Open support case`

Avoid:
- completing remote-send immediately without ambiguous-state handling

### Receipt Detail Screen

Required content:
- receipt number
- token or remote reference
- meter
- customer
- amount
- units
- tariff
- fees or tax
- timestamp
- vendor
- support reference
- audit status

Actions:
- copy token
- print receipt
- download receipt
- share receipt later

### Staff Vendor Review Screen

Required layout:
- profile tab
- documents tab
- bank account tab
- wallet tab
- activity log tab

Actions:
- approve vendor
- reject vendor
- request more documents
- set limits
- assign risk rating

### Finance Funding Queue

Required layout:
- queue table
- proof viewer
- vendor context
- amount requested
- amount verified
- duplicate warning
- reviewer note

Actions:
- approve funding
- reject funding
- mark under review

## Figma Design System Alignment

Figma plugin note:
- The requested Figma plugin and skills are available as instructions, but no callable Figma MCP tool is exposed in this current tool context.
- Because of that, no Figma file was read or written during this audit.

Recommended Figma library scope:

Foundations:
- Color variables mapped to `src/styles/tokens.css`
- Typography variables mapped to `--bev-font-size-*`
- Spacing variables mapped to `--bev-space-*`
- Radius variables mapped to `--bev-radius-*`
- Status variables for success, warning, danger, info, neutral

Components to design in Figma:
- Wallet Balance Panel
- Wallet Status Badge
- Funding Request Card
- Funding Timeline
- Proof Upload Field
- Purchase Preview Panel
- Token Receipt Panel
- Wallet Ledger Row
- Vendor Dashboard Strip
- Finance Queue Row
- Vendor Review Header
- Approval Confirmation Modal
- Rejection Modal
- Risk Alert Row

Screen frames to design in Figma:
- Vendor Login
- Forced Password Reset
- Vendor Onboarding Stepper
- Pending Review
- Vendor Dashboard
- Funding Request
- Generate Token
- Remote Send
- Purchase History
- Receipt Detail
- Admin Vendor List
- Admin Vendor Detail
- Funding Queue
- Manual Credit Queue
- Reconciliation Dashboard

Figma-to-code rules:
- translate components into Vue SFCs
- reuse `src/components/base/*`
- use CSS variables from token files
- keep page geometry in `layouts.css` when reusable
- keep route-specific styling scoped only when it is truly local
- create no raw hex colors in wallet components
- validate every Figma screen against desktop and mobile screenshots

## Design System Gap Analysis

Current wallet UI does use tokens.

Current wallet UI still misses several system conventions:

- status badges are custom spans instead of `BaseBadge`
- repeated panels could become wallet primitives or layout classes
- wallet pages use root component paths instead of planned feature directories
- copy is a little slogan-like: `Money, tokens, receipts.`
- page actions are too demo-like: `Create account` appears inside vendor portal
- admin page lacks dense table treatment for queue work
- forms lack help text, validation, and review states
- receipt lacks a production receipt layout

Desired visual thesis:
- calm financial command surface
- dense review queues for staff
- guided transactional flow for vendors
- receipt clarity over decoration

## Corrected Implementation Roadmap

### Phase A: Stabilize Architecture

Tasks:
- move vendor pages to `src/components/vendor/`
- move staff wallet pages to `src/components/wallet/`
- split `vendor-wallet-service.mjs` into focused services
- either implement or remove architecture references to missing services
- update route imports
- update tests to check real file ownership

Exit result:
- architecture and filesystem agree

### Phase B: Fix Auth and Tenant Boundary

Tasks:
- add vendor login page
- add vendor shell
- enforce wrong-role rejection
- derive actor IDs server-side
- reject vendor access to other organization IDs
- add tests for forged actor IDs
- add tests for cross-tenant wallet reads

Exit result:
- wallet security is enforced server-side

### Phase C: Upgrade Vendor UX

Tasks:
- add onboarding screens
- add pending review page
- add rejected state page
- add funding channel and proof upload
- add purchase preview step
- add token receipt detail view
- add copy and download actions
- add validation and error states

Exit result:
- vendor workflow feels real, complete, and recoverable

### Phase D: Upgrade Staff UX

Tasks:
- build vendor list
- build vendor detail page
- build funding queue table
- add proof viewer
- add approve and reject modals
- add manual credit reason picker
- add freeze and limit controls
- add activity log

Exit result:
- finance can operate safely without hidden shortcuts

### Phase E: Harden Backend Transactions

Tasks:
- make purchase creation atomic
- add hold expiry job
- add reversal path
- add risk service
- add audit service
- add duplicate proof hash
- add limit profiles
- add wallet snapshots if needed

Exit result:
- wallet behaves like a financial subsystem

### Phase F: Build Figma Library

Tasks:
- create wallet design tokens
- create wallet components
- create staff and vendor screen frames
- validate desktop and mobile layouts
- create implementation rules for wallet screens

Exit result:
- code and design system converge

### Phase G: Expand Tests

Tasks:
- add cross-tenant API tests
- add forged actor tests
- add failed insert/orphan hold tests
- add proof upload tests
- add funding rejection tests
- add onboarding browser tests
- add receipt browser tests
- add wallet visual audit screenshots

Exit result:
- tests prove the real risk areas

## Release Readiness Rating

Current backend foundation:
- 6.8/10

Current frontend UX:
- 3.2/10

Current security posture:
- 4.5/10

Current design-system alignment:
- 5.5/10

Current production readiness:
- 4.8/10

Reason:
- core happy paths exist, but security boundary, real UX flows, production proof upload, and review screens are not complete.

## Final Recommendation

Do not treat the wallet system as fully implemented yet.

Treat it as a working foundation.

Next best move:
- fix architecture alignment
- fix actor and tenant security
- replace demo wallet UI with real vendor and staff flows
- then build Figma screens from the Beverly token system

The implementation is headed in the right direction, but the current screens are closer to an internal prototype than the production wallet experience described in the goal.
