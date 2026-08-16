# Beverly CRM & Wallet Ecosystem - Master Playbook & Operations Manual

Status: **Canonical Operating Manual**

Repository: `FrostGraphix/beverly`

Target Node Engine: `Node 22.x`

Package Manager: `pnpm 10.28.0`

---

## Table of Contents

1. [Executive Overview & Monorepo Architecture](#1-executive-overview--monorepo-architecture)
2. [Environment Modes, Security & Configuration Governance](#2-environment-modes-security--configuration-governance)
3. [Local Setup, Development & Bootstrap Workflows](#3-local-setup-development--bootstrap-workflows)
4. [Testing Strategy, Audit Tools & Quality Gates](#4-testing-strategy-audit-tools--quality-gates)
5. [Wallet & Vending Operational Playbook](#5-wallet--vending-operational-playbook)
6. [AMR Meter Gateway & EIH Consumption Engine](#6-amr-meter-gateway--eih-consumption-engine)
7. [Production Deployment & Vercel Pipeline Runbook](#7-production-deployment--vercel-pipeline-runbook)
8. [Database Persistence, Supabase RLS & Migration Management](#8-database-persistence-supabase-rls--migration-management)
9. [Troubleshooting & Known Failure Modes (Cause & Resolution)](#9-troubleshooting--known-failure-modes-cause--resolution)
10. [Incident Response, Disaster Recovery & Security Rotation](#10-incident-response-disaster-recovery--security-rotation)
11. [Release Management & Go-Live Gates](#11-release-management--go-live-gates)

---

## 1. Executive Overview & Monorepo Architecture

Beverly is a controlled, high-integrity Smart Power Partner CRM and Wallet operations platform. It allows operations, finance, support, and field teams to manage electricity vendors, meter customers, vending activities, manual funding queues, receipt generation, consumption analytics, and administrative overrides.

### 1.1 Canonical Architecture

The root file [ARCHITECTURE.md](file:///c:/Users/ACOB/Desktop/VS%20Code/Beverly/ARCHITECTURE.md) is the **single canonical source of architecture truth**. Note that `docs/ARCHITECTURE.md` is retained as legacy reference only.

### 1.2 System Component Topology

```
+-----------------------------------------------------------------------------------+
|                                 FRONTEND LAYER                                    |
|  Root SPA (`src/`) | Monorepo Apps: `admin-app`, `vendor-app`, `customer-app`,     |
|                    `landing-app`  | Pinia State  | Token Design System            |
+-----------------------------------------------------------------------------------+
                                          |
                                          v (HTTP / REST)
+-----------------------------------------------------------------------------------+
|                                 GATEWAY LAYER                                     |
|  Vercel Serverless Gateway (`api/reference.js` proxies `/api/v1/*`)               |
|  Lowercase Route Routing (`/api/wallet/*`, `/api/vendor/*`)                       |
+-----------------------------------------------------------------------------------+
                                          |
                        +-----------------+-----------------+
                        |                                   |
                        v                                   v
+---------------------------------------+ +-----------------------------------------+
|            BACKEND SERVICE            | |            AMR METER GATEWAY            |
| Fastify Wallet Service                | | Upstream Meter Proxy (`api/reference.js` |
| (`backend/wallet/`)                   | | -> Upstream AMR EIH Endpoints)          |
| Ledger & Vend Logic, Paystack Adapter | +-----------------------------------------+
+---------------------------------------+
                        |
                        v
+-----------------------------------------------------------------------------------+
|                              PERSISTENCE & SECURITY                               |
|  Supabase Postgres + Row Level Security (RLS) | Supabase Auth | Storage Buckets   |
|  SQLite (Local Dev / Preview Cache) | Local Memory (Test Suite)                  |
+-----------------------------------------------------------------------------------+
```

### 1.3 Key File & Directory Map

- `src/main.js`: SPA entry point booting Vue 3.
- `src/App.vue`: Root shell routing.
- `src/components/vendor/`: Vendor portal pages and wallet user interface flows.
- `src/components/wallet/`: Staff wallet administration operations.
- `src/services/api.js`: Centralized authentication headers and HTTP client helpers.
- `src/services/action-service.mjs`: Guarded write execution boundary.
- `src/services/consumption-service.mjs` & `consumption-aggregator.mjs`: 3-Wave EIH meter data calculation engine.
- `src/styles/`: Design tokens (`tokens.css`), themes (`themes.css`), UI primitives (`primitives.css`), app shell geometry (`layouts.css`).
- `backend/wallet/`: Canonical wallet TypeScript service, immutable ledger, vending rules, Paystack payment integration, and RLS mappings.
- `backend/src/services/tariff-snapshot-service.js`: Synchronizes live account assignments into date-effective historical rates for consumption valuation.
- `api/reference.js`: Serverless API facade and proxy for live upstream meter readings and wallet endpoints.
- `supabase/migrations/`: SQL migration files defining database schema, RLS policies, RPC functions, and audit triggers.
- `tools/`: Build scripts, preflight validators, test runners, and production env auditors.

---

## 2. Environment Modes, Security & Configuration Governance

### 2.1 Operating Environment Modes

1. **Offline Demo Mode (Default for local development)**
   - Operates on synthetic mock data.
   - Gated by `DEMO_AUTH_ENABLED=true` and `DEMO_AUTH_PASSWORD`.
2. **Live Read Mode**
   - Reads real upstream meter and customer data.
   - Requires valid `LIVE_BEARER_TOKEN` or user session token.
3. **Live Write Mode**
   - Allows mutations to upstream meters and live systems.
   - **STRICTLY GATED** by `ALLOW_LIVE_WRITES=true`. Disabled by default in preview and production environments until approved.
4. **Wallet Production Mode**
   - Money writes default disabled unless explicitly enabled per route policy.
   - Financial transactions persist to Supabase PostgreSQL.

### 2.2 Security Policies & Authorization Rules

- **Row Level Security (RLS)**: Enforced on all Supabase tables. Vendor users are strictly isolated by `organization_id`. Staff users follow role claims (`super-admin`, `operations-manager`, `account`, `finance-checker`). User metadata NEVER grants authorization directly.
- **Immutable Financial Ledger**: Wallet balances are strictly derived from append-only ledger rows (`wallet_ledger`). Balance corrections MUST use compensating transaction entries; direct UPDATE or DELETE operations on ledger rows are forbidden.
- **Idempotency**: All material money writes (funding requests, vending purchases) require an `idempotency-key` header to prevent double-spending or duplicate token generation.
- **Developer Console Protection**: `DEV_CONSOLE_ENABLED` is `false` by default. Routes under `/dev/*` return `404 Not Found` in production unless explicitly provisioned with `dev.console` claims.

---

## 3. Local Setup, Development & Bootstrap Workflows

### 3.1 Prerequisites

- **Node.js**: Version `22.x` (Use `nvm use` or verify with `npm run node:verify`).
- **pnpm**: Version `10.28.0` (Managed via `corepack`).

### 3.2 Environment Provisioning

Copy `.env.example` to `.env.local` or `.env`:

```powershell
cp .env.example .env.local
```

Ensure critical parameters are configured:
```ini
NODE_ENV=development
ALLOW_LIVE_WRITES=false
DEMO_AUTH_ENABLED=true
DEMO_AUTH_PASSWORD=your-secure-demo-password
CORS_ORIGINS=http://localhost:5173,http://localhost:5175,http://127.0.0.1:5173
PORT=5173
```

### 3.3 Bootstrapping the Dev Stack

Run the unified local development stack:
```powershell
npm run dev
```
This executes `tools/run-dev-stack.cjs`, starting Vite for the frontend and bringing up local facade services.

To run Vite standalone:
```powershell
npm run dev:web
```

---

## 4. Testing Strategy, Audit Tools & Quality Gates

The project maintains a multi-layered testing matrix. **Release is blocked if any gate fails.**

```
+-----------------------------------------------------------------------------------+
|                                QUALITY GATES MATRIX                               |
+----------------------+-----------------------------------+------------------------+
| Gate Category        | Execution Command                 | Primary Target         |
+----------------------+-----------------------------------+------------------------+
| 1. Node & Tooling    | `npm run node:verify`             | Engine 22.x Compliance |
| 2. Static Typecheck  | `npm run typecheck`               | TypeScript & JSDoc     |
| 3. Core Build        | `npm run build`                   | SPA & Wallet Backend   |
| 4. Security & Audit  | `npm run security:check`          | Env & Hardening        |
|                      | `npm run hardening:audit`         | Policy Enforcement     |
|                      | `npm run security:review:prod`    | Prod Env Hardening     |
| 5. Unit & Contracts  | `npm test`                        | Root Test Suite        |
|                      | `npm run test:wallet`             | Ledger & Vend Logic    |
|                      | `npm run test:mfa`                | TOTP & Credentials     |
|                      | `npm run test:services`           | Service Layer Mappers  |
|                      | `npm run test:security`           | Security Provenance    |
| 6. Visual & Flow     | `npm run flow:audit`              | UI Flow Contracts      |
|                      | `npm run test:visual:audit`       | Design Parity          |
| 7. Browser QA        | `npm run test:browser`            | Playwright / Chromium  |
|                      | `npm run test:full-smoke`         | End-to-End CRM Flow    |
| 8. Vercel Preview    | `npm run vercel:preflight`        | Deploy Preflight       |
|                      | `npm run smoke:vercel`            | Live Preview Endpoint  |
+----------------------+-----------------------------------+------------------------+
```

### Complete Verification Command Suite

Execute the entire quality suite before submitting code:
```powershell
npm run build
npm run typecheck
npm test
npm run hardening:audit
npm run test:browser
```

---

## 5. Wallet & Vending Operational Playbook

### 5.1 Vendor Onboarding & Role Hierarchy

1. Admin registers new vendor organization via `/wallet-admin/vendors`.
2. Vendor accounts are assigned role `vendor` (org admin) or `vendor_user` (staff vendor).
3. Credentials & MFA TOTP seeds are generated client-side locally (no external QR services).

### 5.2 Manual Funding Lifecycle & Maker-Checker Controls

```
[ Vendor / Operator ] ---> Submits Funding Request (Amount, Proof Metadata, Idempotency Key)
                                    |
                                    v
                           Status: `PENDING_REVIEW`
                                    |
                                    v
[ Finance Checker ]    ---> Reviews Proof & Approves (`finance-checker` role required)
                                    |
            +-----------------------+-----------------------+
            | (Approved)                                    | (Rejected)
            v                                               v
Ledger Credit Posted                             Status: `REJECTED`
Wallet Balance Updated                           No Ledger State Change
```

> [!IMPORTANT]
> **Maker-Checker Security Constraint**: The actor who creates a manual funding request CANNOT approve their own request. Approval requires a distinct user possessing the `finance-checker` role.

### 5.3 Vend Order Purchase Lifecycle (Tokens & Remote-Send)

1. **Purchase Request**: Vendor selects Customer / Meter and initiates vend.
2. **Hold Placement**: Immutable hold is posted against vendor's wallet (`POST /api/wallet/purchase`).
3. **Vend Dispatch**: Token is generated or dispatched upstream.
4. **Fulfillment Outcome**:
   - **Success**: Delivery confirmed -> Hold captured -> Receipt generated with token.
   - **Failure**: Delivery fails -> Hold released -> Vendor funds unreserved.
   - **Unknown / Timeout**: Retains `PENDING` state for manual reconciliation or cron auto-recovery.

### 5.4 Paystack Payment Gateway Integration

- **Callback Generation**: Paystack callback URLs are built strictly server-side from trusted portal origins; client-supplied URLs are ignored.
- **Webhook Reconciliation**: Handled via `backend/wallet/src/services/payment-webhooks.ts`. Webhooks are validated against the Paystack secret signature.
- **Value Delivery Guards**: Automated value posting requires verified payment status, exact amount match, NGN currency, and matching reference ownership.

---

## 6. AMR Meter Gateway & EIH Consumption Engine

### 6.1 Three-Wave EIH Architecture

To handle large-scale meter datasets without blocking the UI:
- **Wave 1 (KPIs)**: Rapid fetch of high-level totals and system health.
- **Wave 2 (Charts & Analytics)**: Sales distribution charts and daily meter trends.
- **Wave 3 (Ledger Data)**: Full transaction history and detailed meter reading logs.

### 6.2 Tariff Valuation Rules

- `DailyDataMeter.total1` represents canonical consumption truth (`usage1` is ignored).
- Aggregate monetary valuation (NGN) uses date-effective historical tariff snapshots (`backend/src/services/tariff-snapshot-service.js`).
- If tariff rate history is missing for a date range, that portion of kWh remains explicitly marked as `unpriced`.
- Negative deltas are clamped to `0` to prevent baseline drift corruption.

### 6.3 Backfill & Reconciliation Tools

```powershell
# Smoke check backfill tool
npm run consumption:backfill:smoke

# Run full consumption gap reconciliation
npm run consumption:raw-reconcile

# Verify gap reconciliation results
npm run consumption:verify
```

---

## 7. Production Deployment & Vercel Pipeline Runbook

### 7.1 Deployment Architecture

- **Host**: Vercel SPA + Vercel Serverless Functions (`/api/*`).
- **Backend Service**: Fastify wallet service bundled into serverless handler with `WALLET_API_BASE_URL=internal`.
- **Scheduled Maintenance**: Supabase Cron calls `/api/cron/wallet-maintenance` with `CRON_SECRET`. Secrets are stored in Supabase Vault.

### 7.2 Pre-Deployment Checklist

Execute before pushing to deployment branch:
```powershell
npm run vercel:preflight
npm run security:review:production
```

### 7.3 Preview Testing with Vercel Protection Bypass

When Vercel Authentication Protection is enabled on preview deployments, run smoke tests using the protection bypass header:

```powershell
$env:TARGET_URL="https://your-preview-url.vercel.app"
$env:VERCEL_PROTECTION_BYPASS="your-vercel-protection-bypass-secret"
npm run smoke:vercel
```

---

## 8. Database Persistence, Supabase RLS & Migration Management

### 8.1 Supabase Database Configuration

- All migrations reside in `supabase/migrations/`.
- Schema additions MUST include transactional guards (`IF NOT EXISTS`, idempotency constraints).
- Client applications access database exclusively via read-only REST APIs using publishable keys. Service roles are restricted to backend handlers.

### 8.2 Migration Hygiene Audit

Run the migration hygiene auditor to verify schema integrity:
```powershell
node tools/migration-hygiene-check.cjs
```

---

## 9. Troubleshooting & Known Failure Modes (Cause & Resolution)

This section documents real historical and potential failure modes, their verified root causes, implemented solutions, and step-by-step diagnostic workflows.

---

### Issue 1: Paystack Webhook Signature Verification Failures & Callback Security Risks
- **Category**: Security / Payments
- **Symptom**: Webhook events fail signature check, or payment callbacks accept tampered URLs allowing unauthorized wallet credits.
- **Root Cause**:
  1. Paystack webhook validator was referencing an incorrect secret key variable (`PAYSTACK_PUBLIC_KEY` instead of `PAYSTACK_SECRET_KEY`).
  2. Frontend payment views passed browser-constructed `callback_url` parameters to backend endpoints.
  3. Callback verification lacked explicit actor ownership verification.
- **Implemented Fix**:
  - Updated `backend/wallet/src/adapters/paystack.ts` to strictly validate webhooks against `PAYSTACK_SECRET_KEY`.
  - Refactored `backend/wallet/src/routes/customer.ts` so the server builds trusted callback URLs from `PUBLIC_APP_URL`.
  - Added actor ownership checks in `backend/wallet/src/services/payment-webhooks.ts`.
- **Diagnostic & Resolution Process**:
  1. Inspect webhook logs in Supabase / Vercel dashboard.
  2. Verify `.env` contains identical `PAYSTACK_SECRET_KEY` as Paystack Dashboard.
  3. Run payment contract tests: `npm run test:wallet`.

---

### Issue 2: Public Vercel Preview Smoke Failures (`401 Unauthorized`)
- **Category**: Deployment / CI
- **Symptom**: `npm run smoke:vercel` fails with `401 Unauthorized` HTTP errors against preview URLs.
- **Root Cause**: Vercel preview deployment protection blocks unauthenticated automated HTTP traffic.
- **Implemented Fix**:
  - Enhanced `tools/vercel-smoke.cjs` to detect and pass `x-vercel-protection-bypass` headers when `VERCEL_PROTECTION_BYPASS` environment variable is present.
- **Diagnostic & Resolution Process**:
  1. Retrieve `VERCEL_PROTECTION_BYPASS` secret from Vercel Project Settings -> Security.
  2. Set environment variable prior to running smoke tests:
     ```powershell
     $env:VERCEL_PROTECTION_BYPASS="<secret-token>"
     $env:TARGET_URL="https://beverly-preview.vercel.app"
     npm run smoke:vercel
     ```

---

### Issue 3: Playwright Browser QA Selector Drift
- **Category**: Test Integrity / UX
- **Symptom**: `npm run test:browser` fails at login screen with `Element not found: button.login-button`.
- **Root Cause**: UI refactoring changed button markup to use `<BaseButton class="auth-submit">`, severing brittle CSS class selectors in browser tests.
- **Implemented Fix**:
  - Added permanent `data-testid` contracts (`data-testid="login-submit"`, `data-testid="table-action-btn"`) across primary components.
  - Updated browser tests to query `[data-testid="..."]` attributes.
- **Diagnostic & Resolution Process**:
  1. Run browser test in headed mode: `npx playwright test --headed`.
  2. If element is missing, inspect component source for missing `data-testid`.
  3. Re-run test suite: `npm run test:browser`.

---

### Issue 4: TOTP Secret Leak & Third-Party QR Code Generation Exposure
- **Category**: Security / Auth
- **Symptom**: Multi-Factor Authentication (MFA) setup transmitted raw TOTP secret seeds to an external Google Chart / third-party QR code API.
- **Root Cause**: Legacy component `src/components/MfaSetupFlow.vue` constructed external `https://chart.googleapis.com/chart?chs=...` image URLs containing sensitive TOTP secrets.
- **Implemented Fix**:
  - Replaced external API call with local generation using the project dependency `qrcode-generator`.
  - QR codes are now rendered directly into inline SVG / data URIs in browser memory.
- **Diagnostic & Resolution Process**:
  1. Search codebase for unapproved external image endpoints: `grep_search` for `chart.googleapis.com`.
  2. Run MFA test suite: `npm run test:mfa`.

---

### Issue 5: Node.js Runtime Version Mismatch (`Node 24` vs `Node 22`)
- **Category**: Runtime / Configuration
- **Symptom**: `npm run node:verify` fails or unexpected `ExperimentalWarning` deprecation messages occur.
- **Root Cause**: Developer machine running Node `24.x` while `.nvmrc`, `package.json`, and CI environments enforce `Node 22.x`.
- **Implemented Fix**:
  - Added strict engine enforcement check script `tools/node-version-check.cjs`.
  - Added explicit `--disable-warning=ExperimentalWarning` flag to npm package scripts.
- **Diagnostic & Resolution Process**:
  1. Check active Node version: `node -v`.
  2. Switch to Node 22 via NVM: `nvm use 22`.
  3. Validate runtime posture: `npm run node:verify`.

---

### Issue 6: Hardcoded Credential Leakage in Seed / Maintenance Tools
- **Category**: Security
- **Symptom**: Hardening audit flags embedded service credentials or API tokens in script files.
- **Root Cause**: Developer test script `tools/seed-meter-aggregates.mjs` contained fallback service role keys hardcoded in plain text.
- **Implemented Fix**:
  - Removed embedded string fallbacks; script now strictly throws an error if environment variables (`SUPABASE_SERVICE_ROLE_KEY`) are missing.
  - Added static credential scanner `tools/production-hardening-audit.cjs` to CI pipeline.
- **Diagnostic & Resolution Process**:
  1. Run hardening audit: `npm run hardening:audit`.
  2. If flagged, remove hardcoded secret immediately and rotate compromised credentials in Supabase Dashboard.

---

### Issue 7: Serverless PDF Receipt Generation Timeout / Missing Chromium URL
- **Category**: Serverless / PDF Generation
- **Symptom**: Receipt PDF generation endpoint `/api/receipt-pdf` fails with 500 status code on Vercel.
- **Root Cause**: `@sparticuz/chromium-min` required an explicit remote binary executable URL (`CHROMIUM_EXECUTABLE_URL`) which was unconfigured in environment variables.
- **Implemented Fix**:
  - Updated `api/receipt-pdf.js` to validate `CHROMIUM_EXECUTABLE_URL` presence on startup and fall back to clean server-rendered HTML receipt format if unavailable.
- **Diagnostic & Resolution Process**:
  1. Ensure `CHROMIUM_EXECUTABLE_URL` is configured in Vercel Environment Variables.
  2. Test receipt generation via: `npm run test:services`.

---

### Issue 8: EIH Tariff Valuation Gaps (Unpriced kWh Balances)
- **Category**: Data Engine / Financial Calculation
- **Symptom**: Station consumption analytics displays missing or incomplete NGN total values while showing valid kWh figures.
- **Root Cause**: Customer accounts lacked date-effective tariff rate snapshots for past consumption windows.
- **Implemented Fix**:
  - Implemented `backend/src/services/tariff-snapshot-service.js` which automatically captures date-effective tariff rates whenever account assignments change.
  - Analytics now explicitly returns priced and unpriced kWh totals, displaying complete currency totals only when unpriced kWh is within storage rounding tolerance.
- **Diagnostic & Resolution Process**:
  1. Run tariff backfill script: `npm run consumption:tariff-backfill`.
  2. Verify calculation accuracy: `npm run test:consumption-valuation`.

---

## 10. Incident Response, Disaster Recovery & Security Rotation

### 10.1 Operational Escalation Matrix

| Incident Level | Criteria | Immediate Action | Primary Role Responsible |
|---|---|---|---|
| **P1 - Critical** | Ledger corruption, unauthorized money write, live vend outage | 1. Set `ALLOW_LIVE_WRITES=false`<br>2. Freeze affected vendor wallet<br>3. Engage Lead Engineer | Operations Manager & Lead Dev |
| **P2 - High** | Payment webhook failure, upstream AMR proxy downtime | 1. Enable fallback reads<br>2. Switch to manual payment verification | Backend Operator |
| **P3 - Medium** | Non-blocking UI glitch, export formatting error | Log ticket in issue tracker; address in next patch cycle | Frontend Engineer |

### 10.2 Secret & Key Rotation Procedures

1. **Supabase Service & Anon Keys**:
   - Navigate to Supabase Dashboard -> Settings -> API.
   - Generate new API keys.
   - Update Vercel Environment Variables (`SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_ANON_KEY`).
   - Trigger production redeployment.
2. **Paystack Secret Keys**:
   - Rotate secret key in Paystack Dashboard.
   - Update `PAYSTACK_SECRET_KEY` in Vercel.
   - Re-run payment tests: `npm run test:mfa` & `npm run test:security`.

### 10.3 Emergency System Freeze Command

To immediately lock down live mutations system-wide:
1. In Vercel Project Settings, set `ALLOW_LIVE_WRITES=false`.
2. Redeploy production deployment.
3. Verify live write lock posture: `npm run security:review:production`.

---

## 11. Release Management & Go-Live Gates

Prior to approving the removal of a production release block, **every item on this checklist must be verified**:

- [ ] **Node Version**: Active environment is running Node `22.x`.
- [ ] **Build Gate**: `npm run build` completes with exit code 0.
- [ ] **Typecheck Gate**: `npm run typecheck` passes cleanly without errors.
- [ ] **Test Gate**: `npm test` passes 100% of unit and integration tests.
- [ ] **Wallet Suite Gate**: `npm run test:wallet` passes all financial ledger and vending checks.
- [ ] **Hardening Audit Gate**: `npm run hardening:audit` passes `12/12` checks.
- [ ] **Browser QA Gate**: `npm run test:browser` passes cleanly.
- [ ] **Vercel Preflight**: `npm run vercel:preflight` passes all environment scans.
- [ ] **Preview Smoke**: `npm run smoke:vercel` passes against live preview deployment with bypass secret.
- [ ] **Security Review**: `npm run security:review:production` confirms `ALLOW_LIVE_WRITES` state and CORS restrictions.
- [ ] **Documentation**: `README.md` and release logs reflect final release status.

---
*End of Master Playbook.*
