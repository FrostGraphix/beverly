# Access Control & Dashboard Remediation Plan

**Date:** 2026-07-28
**Scope:** Wallet Admin — (A) Roles & Permissions "Add role" feature, (B) Dashboard end-to-end
**Branch target:** `main` (PR per workstream)
**Status:** Ready to execute

---

## 0. How to read this document

Every finding below is anchored to a verified file and line number read from the working tree
on 2026-07-28. Findings are graded:

| Grade | Meaning |
|---|---|
| **CONFIRMED** | Defect proven by reading the code path end to end. No environment access needed. |
| **VERIFY-FIRST** | Behaviour depends on live database state. A pre-flight query is specified; the fix is conditional on its result. |
| **POLICY** | Code behaves as written; the written behaviour is wrong or misleading for the product. |

No item is stated as fact without an anchor. Items that could not be proven from the repo are
marked VERIFY-FIRST with the exact query that settles them — they are **not** guessed.

---

## 1. Verified fact base

These are the load-bearing facts every fix depends on. Each was read directly.

### 1.1 Permission plumbing

| Fact | Anchor |
|---|---|
| All admin routes pass `requireStaff` → `requireAdminPermission` → `enforceResourceStation` | `backend/wallet/src/routes/admin.ts:620,658-664` |
| Route→permission map | `backend/wallet/src/routes/admin.ts:270-428` |
| Unmapped route ⇒ hard 403 `permission_not_mapped` | `backend/wallet/src/routes/admin.ts:444-450` |
| Every denial writes an audit row `access.permission_denied` | `backend/wallet/src/routes/admin.ts:452-461` |
| `requireAccessManager` is a **role-string** check, not a permission check | `backend/wallet/src/routes/admin.ts:472-481` |
| `staffStations()` returns `null` for super-admin only; `[]` for an unassigned staffer | `backend/wallet/src/routes/admin.ts:483-488` |
| Station-less non-super-admin ⇒ 403 `station_required` on **every** non-open route | `backend/wallet/src/routes/admin.ts:522-529` |
| `OPEN_ADMIN_ROUTES` = `GET/PATCH /me`, `POST /logout`, 3 profile-picture routes | `backend/wallet/src/routes/admin.ts:266-273` |
| Custom roles authenticate — `custom-` prefix is honoured | `backend/wallet/src/plugins/auth.ts:169` |
| `GET /me` returns `{ user, permissions, catalog }` — **`catalog` is currently unused by the client** | `backend/wallet/src/routes/admin.ts:666-685` |
| Client `hasPermission` short-circuits on `role === 'super-admin'` | `apps/admin/src/stores/auth.ts:29` |
| Zod throws ⇒ 400 `validation_failed` with `details[]` | `backend/wallet/src/plugins/error-handler.ts:16-23` |
| `ApiError` carries `details`; callers currently read only `.message` | `apps/admin/src/lib/api.ts:32-33,141` |

### 1.2 Role defaults (drives every "which role sees what" claim)

`backend/wallet/src/routes/admin-access-constants.ts:27-47`

| Permission | super-admin | operations-manager | finance-checker | account |
|---|:--:|:--:|:--:|:--:|
| `wallet.dashboard.view` | ✅ | ✅ | ✅ | ✅ |
| `wallet.funding.view` | ✅ | ❌ | ✅ | ✅ |
| `wallet.vendors.review` | ✅ | ✅ | ❌ | ❌ |
| `wallet.vending.monitor` | ✅ | ✅ | ❌ | ✅ |

### 1.3 Schema facts

| Fact | Anchor |
|---|---|
| `roles.role_key` unique index | `supabase/migrations/20260511150000_harden_role_permissions_rls.sql:43` |
| `roles.name` is added as **`text`** in-repo | `…20260511150000…:23`, `…20260505124500…:23` |
| Migration casts `name::text` in `WHERE` clauses (defensive against a legacy non-text type) | `…20260511150000…:350-369` |
| `permissions` has `unique(role_key, route_hash)` + `on delete cascade` from `roles` | `…20260511150000…:69-76` |
| `users.role_key` FK → `roles(role_key)` | `…20260511150000…:51` |
| `wallets` columns: `id, owner_type, owner_id, currency, status, balance_minor, …` | `supabase/migrations/20260518153000_vendor_onboarding_schema_alignment.sql:103-115` |
| `v_wallet_balances` exposes `wallet_id, currency, status, ledger_balance_minor, active_holds_minor, available_balance_minor` — **no owner columns** | `supabase/migrations/20260518165000_wallet_runtime_ledger_schema.sql:188-220` |
| `getBalance()` reads that view, one wallet per call | `backend/wallet/src/services/ledger.ts:258-278` |

### 1.4 Build & test reality

| Fact | Anchor |
|---|---|
| Root `build` chains wallet-backend `tsc` + 5 vite builds | `package.json` → `scripts.build` |
| `apps/admin` build runs `vue-tsc --noEmit && vite build` — **TS errors in `.vue` break the build** | `apps/admin/package.json` |
| Backend tests: vitest, `src/**/__tests__/**/*.test.ts` | `backend/wallet/vitest.config.ts` |
| Repo tests: plain node scripts chained in `package.json` scripts |`package.json` → `test`, `test:wallet`, `test:contracts` |
| `tools/test-runner.cjs` expands a named script and parallelises it | `tools/test-runner.cjs:1-40` |
| **`tests/admin-role-creation-ui-contract.test.cjs` is referenced by 0 npm scripts** | verified via `grep -c` against `package.json` |
| **`tests/admin-dashboard-wallet-summary-contract.test.cjs` is referenced by 0 npm scripts** | verified via `grep -c` against `package.json` |
| Migration hygiene: `YYYYMMDDHHMMSS_name.sql`, unique version, idempotent DDL | `tools/migration-hygiene-check.cjs:1-55` |

> **Finding T-0 (CONFIRMED).** Both contract tests written for the two features under audit are
> orphaned — they exist on disk but no script runs them, so they have never gated a build.
> This is why finding **D-1** below has survived: its guard test asserts a *string* in `admin.ts`
> and would pass even with the bug present.

---

## 2. Audit A — "Add role" (Roles & Permissions)

Feature path: `apps/admin/src/views/RolesPermissions.vue` (`openRoleEditor` :206, `saveRole` :219,
modal :453-497) → `POST /api/v1/admin/access/roles` (`admin.ts:882-914`).

### A-1 — Critical permissions grantable with no confirmation — **CONFIRMED** — Severity: High

Toggling a `critical` permission in the matrix forces a confirm dialog
(`RolesPermissions.vue:157-169`). The role editor has **no equivalent gate**: `saveRole`
(`:219`) posts whatever is checked. Server-side validation only tests catalog membership
(`admin.ts:896-897`).

A role created this way may hold `dev.console`, which maps to the entire developer console
including `PUT /dev/sys-config/:key` (`admin.ts:421`) and `GET /dev/schema` (`:425`).

Mitigating factors (verified, do not remove): dev routes additionally require
`DEV_CONSOLE_ENABLED`, `actor.mfaVerified`, and a break-glass header outside development
(`admin.ts:623-637`). So this is an over-grant of a high-value surface, not an unauthenticated
bypass. Severity High, not Critical.

### A-2 — `roles.name` rejects custom values — **CONFIRMED 2026-07-28** — Severity: High

> **Pre-flight result (production):** `name` is `USER-DEFINED`, `udt_name = app_role`,
> `is_nullable = NO`. The VERIFY-FIRST branch below resolved to *confirmed*: custom role
> creation was broken in production, failing with `22P02 invalid input value for enum app_role`
> and surfacing as a generic `role_create_failed` toast.
>
> **Resolution shipped** — and it is *not* the `ALTER COLUMN … TYPE text` originally drafted
> here. `app_role` appears in no migration in this repo (it is a legacy CRM type), and
> `roles.name` is written in exactly two places and read in none. Converting the type would
> mutate a type the legacy CRM may still compare against, for no benefit. Instead:
>
> 1. `supabase/migrations/20260728140000_roles_name_nullable.sql` drops the NOT NULL,
>    guarded by an `information_schema` check so it is idempotent and a no-op on a
>    repo-built database. The enum and every existing value are left intact.
> 2. The custom-role insert no longer writes `name` at all.
> 3. `isLegacyRoleNameSchemaError()` maps `22P02`/`23502` to a `503
>    role_schema_migration_required` with the migration filename, so an unmigrated
>    environment is diagnosable instead of silently generic.
>
> Reverting is `set not null` after removing any custom roles — no data conversion involved.
> The original type-change draft is retained below for the record.

### A-2 (original draft) — `roles.name` may reject custom values — **VERIFY-FIRST** — Severity: High if confirmed

`POST /access/roles` inserts `name: roleKey` (`admin.ts:899`). In-repo, `roles.name` is `text`
(`…20260511150000…:23`), so **on a database built purely from this repo's migrations the insert
succeeds**. The concern is real but conditional: the same migration writes `where name::text = 'admin'`
(`:350-369`), a cast only necessary if `name` is a non-text type in an already-provisioned CRM
database. If production carries `name` as an enum or a `NOT NULL` domain, every custom-role
insert fails with `400 role_create_failed` and the UI shows a generic toast.

**Pre-flight query — run before any A-workstream code lands:**

```sql
select column_name, data_type, udt_name, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'roles'
order by ordinal_position;
```

- If `name` is `text` and nullable ⇒ A-2 is a non-issue; still apply **A-2b**.
- If `name` is a USER-DEFINED/enum type ⇒ apply **A-2a** (migration) *before* anything else.

**A-2b (unconditional):** stop writing a derived value into a redundant column. `name` is
legacy; `role_key` is the identity. Keep writing it only while the column is `NOT NULL`.

### A-3 — Role-name spoofing — **CONFIRMED** — Severity: High

No uniqueness or reserved-name check on `role_name` (`admin.ts:884-895` validates length only).
Creating a role named `Super Admin` yields `role_key = 'custom-super-admin'` — not in
`SYSTEM_ROLE_KEYS` (`admin-access-constants.ts:63`), therefore permitted — and every UI surface
renders `role_name` alone: the staff role `<select>` (`RolesPermissions.vue:922`), the role rail
(`:676`), the filter chips (`:832`), the staff card pill (`:872`). An operator reassigning staff
cannot distinguish the decoy from the real role.

### A-4 — Slug rules break non-ASCII and silently collide — **CONFIRMED** — Severity: Medium

`admin.ts:889`: `name.toLowerCase().replace(/[^a-z0-9]+/g,'-')`.

- Cyrillic / CJK / emoji names slug to `""` → `slug.length < 2` → `400 invalid_role_name` with
  the message *"Choose a unique custom role name"*, which misdescribes the failure.
- `"Ops!"`, `"ops"`, `"O-P-S"` all collapse to `custom-ops` → `409 role_exists` for names the
  operator sees as distinct.

### A-5 — `wallet.access.manage` is mislabeled — **POLICY** — Severity: Medium

Route policy maps role writes to `wallet.access.manage` (`admin.ts:278-281`) but the handlers
gate on `req.actor.role !== 'super-admin'` (`admin.ts:472-481`). A custom role holding that
permission passes the route policy, loads the page, and 403s on every write. The catalog label
is *"Manage roles and permissions"* (`admin-access-constants.ts:22`) — it is read-only in fact.

### A-6 — Zero-permission roles allowed — **CONFIRMED** — Severity: Medium

`permissions` defaults to `[]` (`admin.ts:887`). Staff assigned to such a role authenticate
(`auth.ts:169`) and then see an empty sidebar (`AppShell.vue:103`) and 403 everywhere.

### A-7 — Edit path is non-atomic while create rolls back — **CONFIRMED** — Severity: Medium

Create deletes the role row if the permission insert fails (`admin.ts:906-909`). Edit fires
`PATCH` then `PUT` from the browser (`RolesPermissions.vue:230-233`); a failed `PUT` leaves the
rename applied while the toast reports failure.

### A-8 — Custom roles invisible on the Permissions page — **CONFIRMED** — Severity: Medium

`apps/admin/src/views/Permissions.vue:28` hardcodes `STAFF_ROLES`; `:84` filters the matrix to
it. Two pages give contradictory answers about who holds what.

### A-9 — TOCTOU on the existence pre-check — **CONFIRMED** — Severity: Low

`admin.ts:894` `maybeSingle()` races the unique index; concurrent creates return
`400 role_create_failed` instead of `409 role_exists`.

### A-10 — Duplicated system-role list — **CONFIRMED** — Severity: Low

`RolesPermissions.vue:95` restates `SYSTEM_ROLE_KEYS` (`admin-access-constants.ts:63`).

### A-11 — Client/server validation mismatch, `details` discarded — **CONFIRMED** — Severity: Low

Submit requires only a non-empty trimmed name (`RolesPermissions.vue:220,490`); server requires
≥2 chars (`admin.ts:885`). The resulting zod 400 carries field-level `details`
(`error-handler.ts:20`) that `saveRole`'s catch drops (`:238`).

### A-12 — Cosmetic / a11y — **CONFIRMED** — Severity: Low

- All custom roles render amber via `rc()` fallback (`RolesPermissions.vue:106`) — visually
  identical to Account Officer.
- `.ac-role-editor` (`:456`) has no `role="dialog"`, `aria-modal`, `aria-labelledby`, no focus
  trap, no Esc-to-close; its × button has no `aria-label` — the invite modal 50 lines below
  does (`:509`).
- `openRoleEditor()` is not gated on `loading`, so the permission list can render empty.

---

## 3. Audit B — Dashboard

Feature path: `apps/admin/src/views/Dashboard.vue` → 4 feeds → `admin.ts`.
Route gate: `wallet.dashboard.view` (`apps/admin/src/router/index.ts:12`).

### D-0 — The structural problem — **CONFIRMED** — Severity: High

`fetchAll` (`Dashboard.vue:209-233`) issues four requests unconditionally, each gated on a
*different* permission the page never checks:

| Feed | Permission | Anchor | super-admin | ops-mgr | finance | account |
|---|---|---|:--:|:--:|:--:|:--:|
| `/funding/pending` | `wallet.funding.view` | `admin.ts:304` | ✅ | **403** | ✅ | ✅ |
| `/vendor-applications` | `wallet.vendors.review` | `admin.ts:290` | ✅ | ✅ | **403** | **403** |
| `/vending` | `wallet.vending.monitor` | `admin.ts:325` | ✅ | ✅ | **403** | ✅ |
| `/wallets/summary` | `wallet.funding.view` | `admin.ts:310` | ✅ | **403** | ✅ | ✅ |

Consequences, each traced:

1. **False outage banner.** Any rejection appends to `feedErrors` (`:219-231`) and renders
   *"Live dashboard degraded"* (`:266`). Operations Manager sees it permanently; Finance
   Checker sees three feeds listed. Nothing is broken — the roles are simply not entitled.
2. **False zeros on money tiles.** `statPendingFundingMinor` / `statTotalWalletFloatMinor`
   (`:30,34`) keep their `0` initial value on 403, so an Operations Manager reads
   **"Pending Funding ₦0.00 — 0 requests awaiting approval"** and **"Total Wallet Float ₦0.00
   — 0 active"** rendered in the brand colour (`:284,373`). A restricted view is presented as
   an authoritative figure.
3. **Audit-log flooding.** Each 403 writes `access.permission_denied` (`admin.ts:452-461`).
   The poll interval is 30 s (`Dashboard.vue:238`), so one idle Operations Manager tab produces
   ~5,760 denial rows/day — burying the log the `wallet.audit.view` role depends on.
4. **Station-less staff see a fully dead dashboard.** `enforceResourceStation` 403s every
   non-open route when a non-super-admin has no station (`admin.ts:526-529`), so all four feeds
   fail with no explanation.

The correct pattern already exists in the same file — the card footer links are permission-gated
(`:433,468,487,546`). The fetches and the tiles are not.

### D-1 — `/wallets/summary` returns zero for every non-super-admin — **CONFIRMED** — Severity: High

`admin.ts:1666` selects `id, owner_type, status` — **`owner_id` is not selected** — and
`:1671-1673` then filters on `wallet.owner_id`. `owners.vendors.has(undefined)` is always
`false`, so any actor with a station scope gets `wallets = []` ⇒ `walletCount: 0`,
`totalFloatMinor: 0`, `activeWallets: 0`.

Finance Checker and Account Officer **hold** `wallet.funding.view`, so the request returns 200.
No banner, no error — the Total Wallet Float tile simply shows ₦0.00. This is the single
highest-value defect in the audit: silent, authoritative, and wrong.

The existing guard test does not catch it because it greps `admin.ts` for the literal
`totalBalanceMinor:  totalFloat` (`tests/admin-dashboard-wallet-summary-contract.test.cjs:26`)
and never executes the handler — and the test is orphaned from every npm script anyway (T-0).

### D-2 — Money KPIs computed client-side over a truncated feed — **CONFIRMED** — Severity: High

`/vending` caps at 200 rows by default (`admin.ts:2211`); `/funding/pending` at 200
(`admin.ts:1477` → `listPendingFunding`, `services/funding.ts:644-651`).
`todayVendingTotal`, `failedToday`, `deliveredToday` (`Dashboard.vue:51-64`) reduce over that
window. Past 200 orders, "Today's Purchases" undercounts and can *decrease* during the day as
newer rows displace earlier ones.

**Do not naively switch to the existing `/purchases/summary`** (`admin.ts:2242-2266`): verified,
it (a) does not filter by `status`, so `todayValueMinor` counts non-delivered orders, and
(b) computes `sumMinor()` over the returned rows of an unbounded `select` — the `count` is
exact but the **value is not**. A correct delivered-only aggregate must be added (§5.2 D-2).

### D-3 — "Today" is the browser's timezone — **CONFIRMED** — Severity: Medium

`new Date(); setHours(0,0,0,0)` (`Dashboard.vue:52,58,62`). A browser on UTC yields a different
daily cut-off than the Lagos business day, on figures operators reconcile against.

### D-4 — Recent Transactions is filtered to today, and the filter UI is dead code — **CONFIRMED** — Severity: Medium

`recentDateFilter` defaults to `'today'` (`:38`) and is applied by
`filteredRecentTransactions` (`:120-127`), while the card header reads *"Most recent vending
orders"* (`:543`). Before the day's first transaction the table shows **"No transactions yet."**
on a system with full history.

The controls that would reveal this are declared and **never rendered**: `RECENT_TYPE_FILTERS`
(`:41-48`), `recentActivityTabs` (`:109`), `recentStations` (`:117`), `showRecentFilters`
(`:39`), `recentStationFilter` (`:37`). The `disputes` tab additionally has no row source —
`recentActivityRows` (`:68-108`) emits only `purchases`/`reversals`/`failed`/`funding`, so its
count is structurally always 0.

### D-5 — Applications feed is not station-scoped — **CONFIRMED** — Severity: Medium

`/vendor-applications` (`admin.ts:1130-1139`) applies no station filter, unlike `/vending`
(`:2213-2215`), `/funding/pending` (`:1478-1481`) and `/wallets/summary` (`:1668-1674`). A
station-scoped Operations Manager sees every vendor application estate-wide.

### D-6 — Ungated KPI link lands on NotFound — **CONFIRMED** — Severity: Medium

The Total Wallet Float tile is a `router-link to="/wallets"` with no permission guard
(`Dashboard.vue:361-365`); `/wallets` requires `wallet.funding.view` (`router/index.ts:20`) and
the guard routes unauthorized users to `not-found` (`router/index.ts:81`). Every other dashboard
link is `v-if`-gated; this one was missed.

### D-7 — `/wallets/summary` is an unbounded N+1 on a 30 s poll — **CONFIRMED** — Severity: High (scalability)

`admin.ts:1666` selects **all** wallets with no limit; `:1676` then calls `getBalance(w.id)` once
per wallet inside a single `Promise.all`. Each call is a separate query against
`v_wallet_balances` (`services/ledger.ts:258-263`). Per admin, per 30 s, per open tab.

### D-8 — Stale permissions survive a `/me` outage — **CONFIRMED** — Severity: Medium

`hydrate()` loads cached `user` + `permissions` from `localStorage` (`stores/auth.ts:44-52`);
on a non-401 `refreshSession` failure it returns and keeps them (`:56`). A demoted staffer with
a valid token and a flaky `/me` keeps the old sidebar. Server-side enforcement is unaffected.

### D-9 — No station context on the page — **CONFIRMED** — Severity: Medium

The header claims *"Real-time overview of Beverly vending wallet"* (`Dashboard.vue:256`) while
every non-super-admin figure is silently station-filtered. `/me` returns `station_ids`
(`admin.ts:634,680`) but `StaffProfile` does not even declare the field
(`stores/auth.ts:4-11`).

### D-10 — Minor — **CONFIRMED** — Severity: Low

- `feedErrors` cannot distinguish 403 / 503 / network — identical banner text (`:220-229`).
- KPI sparklines are hardcoded SVG paths (`:300-301,319-320`) presented beside live figures.
- `animateStat` (`:136-149`) starts an uncancelled rAF chain per poll; overlapping polls
  interleave.
- `:354` — `apps.length > 0 ? 'flat' : 'flat'`, both branches identical.
- Poll ignores `visibilitychange`; background tabs keep the D-0.3 audit storm running.

---

## 4. Execution strategy

Four PRs, strictly ordered. Each is independently revertable and independently green.

| PR | Title | Contains | Blocking? |
|---|---|---|---|
| **PR-1** | `fix(admin): wallet summary station scope + dashboard entitlements` | D-1, D-0, D-6, D-9 | none — start here |
| **PR-2** | `perf(admin): batched wallet balances + delivered-order aggregate` | D-7, D-2, D-3 | after PR-1 |
| **PR-3** | `fix(admin): dashboard recent-activity filters + scoping` | D-4, D-5, D-8, D-10 | after PR-1 |
| **PR-4** | `fix(access): harden custom role creation` | A-1…A-12 | independent; A-2a gates on §5.4 pre-flight |

Rationale for order: D-1 is a one-line fix for a live financial misstatement and must not wait
behind a refactor. PR-2 changes the same handler PR-1 touches, so it follows to avoid conflict.
PR-4 is orthogonal and may run in parallel by a second engineer.

---

## 5. Implementation

Every change below specifies the exact file, the exact anchor, and the exact replacement.
Line numbers are pre-change; apply top-down within a file so earlier edits do not shift later
anchors, or match on the quoted text.

### 5.1 PR-1 — Wallet summary scope + dashboard entitlements

#### D-1 — `backend/wallet/src/routes/admin.ts:1666`

```ts
// before
const { data: walletsRaw } = await adminClient.from('wallets').select('id, owner_type, status');
// after
const { data: walletsRaw } = await adminClient.from('wallets').select('id, owner_type, owner_id, status');
```

That is the whole fix. Do **not** also change the filter at `:1671-1673` — it is correct once
`owner_id` is present.

#### D-0.a — Server: expose entitlement metadata the client can trust

The client must know *why* a feed is unavailable. `GET /me` already returns `catalog`
(`admin.ts:683`), so no new endpoint is required — the client has the full permission list at
`stores/auth.ts:65`. No server change needed for D-0. **Skip any temptation to add an endpoint.**

#### D-0.b — Client: gate each fetch, and distinguish "restricted" from "zero"

`apps/admin/src/views/Dashboard.vue`

1. Add a per-feed state type next to the existing refs (after `:27`):

```ts
type FeedState = 'ok' | 'restricted' | 'error';
const feedState = ref<Record<'funding' | 'apps' | 'vending' | 'wallets', FeedState>>({
    funding: 'ok', apps: 'ok', vending: 'ok', wallets: 'ok',
});
const canSeeFunding  = computed(() => auth.hasPermission('wallet.funding.view'));
const canSeeApps     = computed(() => auth.hasPermission('wallet.vendors.review'));
const canSeeVending  = computed(() => auth.hasPermission('wallet.vending.monitor'));
```

2. Replace `fetchAll` (`:209-233`) so each feed is requested only when entitled, and a 403 is
   classified rather than reported as an outage. `ApiError` exposes `.status`
   (`apps/admin/src/lib/api.ts:32`) — import it.

```ts
import { ApiError, api, naira, shortDate } from '../lib/api';

async function settle<T>(
    key: 'funding' | 'apps' | 'vending' | 'wallets',
    entitled: boolean,
    run: () => Promise<T>,
): Promise<T | null> {
    if (!entitled) { feedState.value[key] = 'restricted'; return null; }
    try {
        const value = await run();
        feedState.value[key] = 'ok';
        return value;
    } catch (error) {
        feedState.value[key] = error instanceof ApiError && error.status === 403 ? 'restricted' : 'error';
        return null;
    }
}

async function fetchAll() {
    const [fundingRes, appsRes, vendingRes, walletRes] = await Promise.all([
        settle('funding', canSeeFunding.value, () => api.get<{ funding: FundingRequest[] }>('/api/v1/admin/funding/pending')),
        settle('apps',    canSeeApps.value,    () => api.get<{ applications: Application[] }>('/api/v1/admin/vendor-applications')),
        settle('vending', canSeeVending.value, () => api.get<{ purchases: Purchase[] }>('/api/v1/admin/vending')),
        settle('wallets', canSeeFunding.value, () => api.get<WalletSummary>('/api/v1/admin/wallets/summary')),
    ]);

    if (fundingRes) funding.value = fundingRes.funding;
    if (appsRes)    apps.value    = appsRes.applications;
    if (vendingRes) vending.value = vendingRes.purchases;
    if (walletRes)  walletSummary.value = walletRes;

    feedErrors.value = Object.entries(feedState.value)
        .filter(([, state]) => state === 'error')
        .map(([key]) => FEED_LABELS[key as keyof typeof FEED_LABELS]);
    syncAnimatedStats();
}
```

with, near `RECENT_TYPE_FILTERS`:

```ts
const FEED_LABELS = {
    funding: 'Funding queue', apps: 'Applications feed',
    vending: 'Vending feed',  wallets: 'Wallet summary',
} as const;
```

> `Promise.all` is safe here — `settle` never rejects. `Promise.allSettled` is no longer needed.

3. Render restriction instead of a false zero. For each affected tile, replace the value node:

- Pending Funding (`:284-286`) and its footer (`:287-292`) — wrap in
  `v-if="feedState.funding !== 'restricted'"`, and add a sibling
  `<div v-else class="bw-kpi-value bw-muted">Restricted</div>`
  plus `<span class="bw-kpi-note">Needs funding access</span>`.
- Total Wallet Float (`:373-377`) — same treatment keyed on `feedState.wallets`.
- Applications (`:350-357`) — keyed on `feedState.apps`.
- Failed Transactions (`:332-339`) and Tokens Delivered (`:388-392`) — keyed on
  `feedState.vending`.

4. Queue cards: add `v-if="feedState.funding !== 'restricted'"` to the funding card (`:405`) and
   `v-if="feedState.apps !== 'restricted'"` to the applications card (`:441`). A card the role
   can never populate should not occupy the grid.

5. Banner copy (`:266-268`) — unchanged mechanics, now only fires on genuine `'error'` states.

#### D-6 — `apps/admin/src/views/Dashboard.vue:361`

Make the Total Wallet Float tile a link **only** when entitled. Split into two nodes sharing one
`<template>` fragment for the body, or simplest and least invasive:

```html
<component
  :is="canSeeFunding ? 'router-link' : 'div'"
  :to="canSeeFunding ? '/wallets' : undefined"
  class="bw-kpi featured"
  :class="canSeeFunding && 'bw-kpi-link'"
  style="text-decoration:none; color:inherit"
  :aria-label="canSeeFunding ? 'Open all wallets' : undefined"
>
```

> The orphaned guard test asserts the literal `aria-label="Open all wallets"` is present in the
> file (`tests/admin-dashboard-wallet-summary-contract.test.cjs:22`). The form above keeps that
> string, so wiring the test into CI (§7) will not fail on this edit. Verify with
> `grep -c 'aria-label="Open all wallets"' apps/admin/src/views/Dashboard.vue` ⇒ `1`.

#### D-9 — Station context

1. `apps/admin/src/stores/auth.ts:4-11` — declare what the server already sends:

```ts
export interface StaffProfile {
    id: string;
    email: string | null;
    full_name: string | null;
    role: string;
    station_id?: string | null;
    station_ids?: string[];
    profile_picture_url: string | null;
    updated_at?: string | null;
}
```

2. `Dashboard.vue:256` — replace the static subtitle:

```ts
const scopeLabel = computed(() => {
    if (auth.user?.role === 'super-admin') return 'All stations';
    const ids = auth.user?.station_ids ?? [];
    if (!ids.length) return 'No station assigned — ask a Super Admin to assign one';
    return ids.length <= 3 ? `Stations: ${ids.join(', ')}` : `${ids.length} assigned stations`;
});
```

```html
<p>{{ scopeLabel }} · Refreshes every 30 s.</p>
```

This also surfaces the station-less dead-dashboard case (D-0.4) with an actionable message.

### 5.2 PR-2 — Performance + aggregate correctness

#### D-7 — Batched balances, no N+1, no migration

`v_wallet_balances` has no owner columns (verified §1.3), so scoping must still happen against
`wallets`. Two paginated queries replace N+1:

Add near the other helpers in `admin.ts` (e.g. after `missingColumn`, `:498`):

```ts
const PAGE = 1000;

async function fetchAllRows<T>(build: () => any): Promise<T[]> {
    const rows: T[] = [];
    for (let offset = 0; ; offset += PAGE) {
        const { data, error } = await build().range(offset, offset + PAGE - 1);
        if (error) throw error;
        const page = (data ?? []) as T[];
        rows.push(...page);
        if (page.length < PAGE) return rows;
    }
}
```

> Explicit `.range()` looping makes the result independent of any PostgREST `db_max_rows`
> setting. Do not rely on an unbounded `select` returning everything — that assumption is
> exactly what makes D-2 wrong today.

Replace `admin.ts:1666-1676`:

```ts
const assignedStations = staffStations(req);
const walletRows = await fetchAllRows<{ id: string; owner_type: string; owner_id: string; status: string }>(
    () => adminClient.from('wallets').select('id, owner_type, owner_id, status').order('id'),
);
let wallets = walletRows;
if (assignedStations) {
    const owners = await stationOwnerIds(assignedStations);
    wallets = walletRows.filter((w) => w.owner_type === 'vendor'
        ? owners.vendors.has(w.owner_id)
        : owners.customers.has(w.owner_id));
}
const balanceRows = await fetchAllRows<{ wallet_id: string; ledger_balance_minor: number; active_holds_minor: number }>(
    () => adminClient.from('v_wallet_balances').select('wallet_id, ledger_balance_minor, active_holds_minor').order('wallet_id'),
);
const balanceById = new Map(balanceRows.map((row) => [row.wallet_id, row]));
```

Then the existing accumulation loop (`:1681-1691`) reads
`const b = balanceById.get(w.id)` and `Number(b?.ledger_balance_minor ?? 0)` /
`Number(b?.active_holds_minor ?? 0)`. Delete the dynamic `import('../services/ledger.js')`
(`:1675`) — it is no longer used in this handler.

Query count goes from `1 + N` to `2 + ceil(N/1000)`.

#### D-2 — Delivered-order aggregate

Extend `GET /purchases/summary` (`admin.ts:2242`) rather than adding an endpoint — it is already
mapped in the route policy. Two corrections, both required:

1. Add a delivered-only bucket.
2. Stop summing a possibly-paged `select`. Use `fetchAllRows` for the value sums, keeping
   `{ count: 'exact', head: true }` for the counts.

```ts
const deliveredToday = await fetchAllRows<{ amount_minor: number }>(
    () => scope(adminClient.from('purchase_orders')
        .select('amount_minor')
        .gte('created_at', sod)
        .eq('status', 'delivered')
        .order('id')),
);
// add to the response object:
deliveredTodayCount:      deliveredToday.length,
deliveredTodayValueMinor: deliveredToday.reduce((s, r) => s + Number(r.amount_minor ?? 0), 0),
```

Apply the same `fetchAllRows` treatment to the existing `today` / `last24h` value sums so the
endpoint stops reporting a truncated figure alongside an exact count.

**Route policy check:** `'GET /purchases/summary'` must already exist in
`ADMIN_ROUTE_PERMISSIONS`. Confirm with
`grep -n "'GET /purchases/summary'" backend/wallet/src/routes/admin.ts`.
If it is absent, the route 403s with `permission_not_mapped` (`admin.ts:444-450`) — add it as
`'wallet.vending.monitor'` to match `/vending`.

Client (`Dashboard.vue`): add a fifth feed gated on `canSeeVending`, and drive
`todayVendingTotal` / `deliveredToday` from `deliveredTodayValueMinor` /
`deliveredTodayCount`. Keep the client-side computeds as the fallback only when the summary feed
is `'error'`, and label the tile footer accordingly.

#### D-3 — Timezone

Compute the day boundary in the business timezone rather than the browser's:

```ts
const BUSINESS_TZ = 'Africa/Lagos';
function startOfBusinessDay(): Date {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: BUSINESS_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date());
    const get = (t: string) => parts.find((p) => p.type === t)!.value;
    return new Date(`${get('year')}-${get('month')}-${get('day')}T00:00:00+01:00`);
}
```

Replace the three `new Date(); setHours(0,0,0,0)` sites (`:52,58,62`). Africa/Lagos is UTC+01:00
year-round with no DST, so the fixed offset is exact — do not generalise it to other zones
without revisiting.

Server side, `sod` in `/purchases/summary` (`admin.ts:2244`) uses the *server's* local time.
Pin it the same way, or accept an ISO `from` query parameter from the client. Prefer pinning —
one source of truth.

### 5.3 PR-3 — Recent activity, scoping, resilience

- **D-4a:** render the filter bar that already has state — type tabs from `recentActivityTabs`
  (`:109`), station select from `recentStations` (`:117`), date select — into the Recent
  Transactions header (`:540-556`), toggled by `showRecentFilters` (`:39`).
- **D-4b:** change `recentDateFilter` default (`:38`) from `'today'` to `'seven'`, and make the
  card subtitle (`:543`) reflect the active filter. Alternative if product prefers today-only:
  keep `'today'` but change the empty state (`:581`) to *"No transactions today."* — the current
  copy is what makes it a bug.
- **D-4c:** remove the `disputes` entry from `RECENT_TYPE_FILTERS` (`:46`) — no row source
  emits that kind. Add it back only with a real disputes feed.
- **D-5:** station-scope `/vendor-applications` (`admin.ts:1130-1139`). `vendor_applications`
  has no direct station column — confirm the linkage before writing the filter:
  ```sql
  select column_name, data_type from information_schema.columns
  where table_schema='public' and table_name='vendor_applications' order by ordinal_position;
  ```
  If an `operating_stations`-style column exists, mirror `stationOwnerIds` (`admin.ts:500-509`)
  and filter with `.overlaps(...)`. **If no station linkage exists, do not invent one** — instead
  document the endpoint as intentionally global and add a note to the dashboard card. Record the
  outcome in the PR description.
- **D-8:** in `stores/auth.ts:53-58`, when `refreshSession` fails with a non-401 during
  `hydrate`, mark the session unverified (`this.lastValidatedAt = null`) and expose a
  `permissionsStale` flag the shell can surface. Do not silently clear permissions — that would
  lock out a working user during a transient `/me` blip.
- **D-10:** pause the poll on `document.visibilityState === 'hidden'`; cancel the previous rAF
  handle in `animateStat`; fix `:354`; either drive the sparklines from real series or drop
  them.

### 5.4 PR-4 — Custom role hardening

#### A-2 pre-flight (blocking for A-2a only)

Run the §2/A-2 query. Record the result in the PR body. Then:

**A-2a — only if `roles.name` is not `text`.** New migration
`supabase/migrations/20260728120000_roles_name_text.sql` (filename satisfies
`tools/migration-hygiene-check.cjs:36`; no `create table`, so the idempotency rule is moot):

```sql
-- Custom roles need a free-form name column; legacy CRM databases may still
-- carry an enum here. Idempotent: no-op when already text.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'roles'
      and column_name = 'name' and data_type <> 'text'
  ) then
    alter table public.roles alter column name type text using name::text;
  end if;
end $$;

alter table public.roles alter column name drop not null;
```

**A-2b — unconditional.** `admin.ts:899` keeps writing `name: roleKey` only while the column may
be `NOT NULL`. After A-2a lands, that write can be dropped in a follow-up; do not drop it in the
same PR.

#### A-1 — Confirm critical grants

`RolesPermissions.vue`. `PERMISSION_CATALOG` carries `risk` and is already returned by `/me`
(`admin.ts:683`) and `/access` (`admin.ts:837`); the view holds it in `catalog` (`:37`).

```ts
const editorCriticalPermissions = computed(() =>
    catalog.value.filter((i) => i.risk === 'critical' && roleEditor.value.permissions.includes(i.key)),
);

function requestSaveRole() {
    if (!canManage.value || !roleEditor.value.name.trim()) return;
    const critical = editorCriticalPermissions.value;
    if (!critical.length) return void saveRole();
    confirm.value = {
        title: roleEditor.value.creating ? 'Create role with critical permissions' : 'Save critical permissions',
        body: `${roleEditor.value.name.trim()} will hold ${critical.length} critical permission${critical.length > 1 ? 's' : ''}:\n\n${critical.map((i) => `• ${i.label}`).join('\n')}\n\nThe change is audit-logged.`,
        label: roleEditor.value.creating ? 'Yes, create role' : 'Yes, save role',
        danger: true,
        fn: () => saveRole(),
    };
}
```

Bind the form to `requestSaveRole` (`:456` `@submit.prevent`). Render a live warning strip above
the actions (`:488`) listing `editorCriticalPermissions`.

Server-side hard stop for the highest-value grant — in `POST /access/roles` after the catalog
filter (`admin.ts:897`) and in `PUT /access/roles/:roleKey/permissions` after `:855`:

```ts
const RESTRICTED_TO_SYSTEM_ROLES = new Set(['dev.console']);
if (!SYSTEM_ROLE_KEYS.has(roleKey) && selectedPermissions.some((p) => RESTRICTED_TO_SYSTEM_ROLES.has(p))) {
    return reply.code(400).send({
        error: 'permission_not_grantable',
        message: 'dev.console cannot be granted to a custom role.',
    });
}
```

(In the create handler the key variable is `roleKey`, built at `:890`; in the PUT handler it is
the route param at `:847`. Use `next` instead of `selectedPermissions` in the PUT handler.)

#### A-3 — Reserved and duplicate names

In `POST /access/roles` after the length check (`admin.ts:891-893`):

```ts
const desired = body.name.trim().toLowerCase();
const reserved = new Set(Object.values(ROLE_LABELS).map((label) => label.toLowerCase()));
if (reserved.has(desired)) {
    return reply.code(409).send({ error: 'role_name_reserved', message: 'That name belongs to a system role. Choose another.' });
}
const { data: sameName } = await adminClient.from('roles').select('role_key').ilike('role_name', body.name.trim()).maybeSingle();
if (sameName) {
    return reply.code(409).send({ error: 'role_name_taken', message: 'Another role already uses this name.' });
}
```

`ROLE_LABELS` is already imported in `admin.ts` (see the import block at `:44-50`; add it if the
named import is absent). Mirror the same two checks in `PATCH /access/roles/:roleKey`
(`admin.ts:920`), excluding the role being edited.

#### A-4 — Slug and message accuracy

Replace `admin.ts:889-893`:

```ts
const slug = body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
if (slug.length < 2) {
    return reply.code(400).send({
        error: 'invalid_role_name',
        message: 'Role names must contain at least two latin letters or digits.',
    });
}
const roleKey = `custom-${slug}`;
```

(`body.name` is already zod-trimmed at `:885`, so the extra `.trim()` was redundant.)
And make the collision message name the cause — `admin.ts:895`:

```ts
message: `"${body.name}" resolves to the same role key as an existing role (${roleKey}). Choose a more distinct name.`,
```

#### A-5 — Honest permission label

`admin-access-constants.ts:22` — rename the label to reflect reality:

```ts
{ key: 'wallet.access.manage', label: 'View roles and permissions', group: 'Access', risk: 'high' },
```

**Do not** change `requireAccessManager` in this PR. Making writes permission-driven is a
deliberate authorization-model change that needs its own design and its own tests; mislabeling
it is the bug being fixed here. File a follow-up issue: *"Decide whether custom roles may ever
manage access."*

> Risk downgrade `critical`→`high` is intentional and consistent: with writes locked to
> super-admin, this permission grants read access only.

#### A-6 — Reject permission-less roles

`admin.ts:887` — `z.array(z.string()).min(1).max(PERMISSION_CATALOG.length)`, plus a clear
message. Client: disable submit while `roleEditor.permissions.length === 0`
(`RolesPermissions.vue:490`) and show the reason.

#### A-7 — Atomic edit

Add `PUT /access/roles/:roleKey` handling name, description and permissions in one request, or —
lower risk — have `saveRole` (`:229-235`) send permissions first and the rename second, so a
failure leaves the *name* stale rather than the *permissions* stale. Prefer the single endpoint;
it is ~20 lines and removes the class of bug.

#### A-8 — Custom roles on the Permissions page

`apps/admin/src/views/Permissions.vue:84` — derive from data, not a constant:

```ts
const SYSTEM_ROLE_ORDER = ['super-admin', 'operations-manager', 'finance-checker', 'account'];
const displayRoles = computed(() => [
    ...SYSTEM_ROLE_ORDER.filter((k) => roles.value.some((r) => r.role_key === k)),
    ...roles.value.map((r) => r.role_key).filter((k) => !SYSTEM_ROLE_ORDER.includes(k)).sort(),
]);
```

Delete the now-unused `STAFF_ROLES` (`:28`). Confirm the table header/colspan expressions
(`:187`) still hold with a variable column count.

#### A-9 — TOCTOU

Wrap the insert (`admin.ts:898`) and map a unique-violation (`error.code === '23505'`) to the
same `409 role_exists` the pre-check returns.

#### A-10 — Single source for system roles

`GET /access` already returns `defaults: DEFAULT_ROLE_PERMISSIONS` (`admin.ts:841`). In
`RolesPermissions.vue`, replace the hardcoded `isSystemRole` (`:95`) with a lookup against
`Object.keys(d.defaults)` captured in `load()` (`:146-151`).

#### A-11 — Surface field errors

`RolesPermissions.vue:238` — render `details`:

```ts
} catch (e: any) {
    const detail = Array.isArray(e?.details) && e.details.length
        ? e.details.map((d: any) => `${d.path}: ${d.message}`).join('; ')
        : '';
    toast(detail || e?.message || 'Could not save custom role', 'err');
}
```

Also add `minlength="2"` to the name input (`:467`) so the browser blocks the mismatch first.

#### A-12 — Colour, a11y, loading gate

- Extend `ROLE_COLORS` (`:98`) with a deterministic hash-to-palette fallback in `rc()` (`:106`)
  so custom roles are visually distinct; add 3–4 `.rc-*` token blocks alongside `:956-959`.
- On `.ac-role-editor` (`:456`): `role="dialog" aria-modal="true" aria-labelledby="ac-role-editor-title"`,
  `id` on the `<h3>` (`:460`), `aria-label="Close role editor"` on the × (`:462`), `@keydown.esc`
  on the overlay (`:455`), and initial focus on the name input.
- Gate `openRoleEditor` (`:206`) on `!loading.value`; disable both trigger buttons (`:610`,
  `:840`) while loading.

---

## 6. Tests — the green gate

New tests are **behavioural**, not string greps. Two homes:

### 6.1 Backend unit tests (vitest, `backend/wallet/src/services/__tests__/`)

Config includes `src/**/__tests__/**/*.test.ts` (`backend/wallet/vitest.config.ts`). The existing
suite tests extracted pure logic (see `feature-flags.test.ts:1-13` for the established pattern of
mirroring a function under test). Follow it: extract the reducers being fixed into exported pure
helpers, then test them.

`wallet-summary-scope.test.ts`
- `scopeWalletsToStations()` with owner-typed fixtures returns vendor wallets for a matching
  station — **fails against the pre-fix code path where `owner_id` is undefined** (this is the
  regression lock for D-1).
- Returns all wallets when `stationIds === null` (super-admin).
- Aggregation over a balances `Map` yields correct `totalFloatMinor` / `byStatus` and tolerates a
  missing balance row.

`purchase-aggregate.test.ts`
- Delivered-only sum excludes `failed`, `reversed`, `pending`.
- `fetchAllRows` pagination: a build stub returning 1000 then 1000 then 137 rows produces 2137 —
  proves no truncation (D-2).

`business-day.test.ts`
- `startOfBusinessDay()` returns the same instant for a process at `TZ=UTC` and `TZ=America/New_York`
  (D-3). Set `process.env.TZ` per case.

`role-key-slug.test.ts`
- `"Compliance Reviewer"` → `custom-compliance-reviewer`.
- `"Ops!"` and `"ops"` → identical key (collision is expected and must be reported as 409).
- Cyrillic/emoji input → slug shorter than 2 ⇒ rejected.
- Reserved-name matching is case-insensitive against `ROLE_LABELS`.
- `dev.console` in a custom-role permission set is rejected; in a system role it is allowed.

### 6.2 Repo contract tests (`tests/*.test.cjs`)

Extend the two existing files rather than adding new ones, and **wire them into a script** (§7).

`tests/admin-dashboard-wallet-summary-contract.test.cjs`
- Assert `select('id, owner_type, owner_id, status')` appears in the `/wallets/summary` handler
  — a direct lock on D-1.
- Assert `Dashboard.vue` contains no `Promise.allSettled` over the four raw feeds and does
  contain `feedState`.
- Assert `getBalance` is no longer called inside the summary handler.

`tests/admin-role-creation-ui-contract.test.cjs`
- Keep the existing assertions (they still hold).
- Add: `requestSaveRole` exists and is bound to the editor's `@submit.prevent`;
  `permission_not_grantable` exists in `admin.ts`; `role_name_reserved` exists in `admin.ts`;
  `Permissions.vue` no longer contains `const STAFF_ROLES`.

### 6.3 Manual verification matrix (pre-merge, staging)

Create one staff user per role via the existing invite flow and confirm:

| Role | Expected dashboard |
|---|---|
| super-admin | 6 tiles populated, no banner |
| operations-manager | Funding + Wallet Float tiles read **Restricted**, no red banner, no `access.permission_denied` rows accumulating |
| finance-checker | Applications + Vending tiles **Restricted** |
| account | Applications tile **Restricted** |
| any non-super-admin, no station | Header shows the "No station assigned" message |
| custom role, 1 permission | Sidebar shows exactly that section; dashboard reachable only if `wallet.dashboard.view` granted |

Confirm the audit-log volume claim empirically: leave an operations-manager tab open 10 minutes,
then `select count(*) from audit_logs where action='access.permission_denied' and created_at > now() - interval '10 minutes';`
Expect ~0 after the fix (was ~40 before).

---

## 7. Wiring the tests into CI (mandatory — do not skip)

Both feature contract tests are currently orphaned (T-0). Add them to `package.json`:

- Append to `scripts["test:wallet"]`:
  `&& node --disable-warning=ExperimentalWarning tests/admin-dashboard-wallet-summary-contract.test.cjs && node --disable-warning=ExperimentalWarning tests/admin-role-creation-ui-contract.test.cjs`

`tools/test-runner.cjs` expands script chains on `&&` (`:32-40`), so both files are picked up by
`npm run test:parallel test:wallet` automatically once chained.

Backend vitest files need no wiring — the config glob already matches
(`backend/wallet/vitest.config.ts`).

---

## 8. Green-build definition

A PR is green only when **all** of the following pass locally and in CI, in this order:

```bash
npm run typecheck
```
```bash
corepack pnpm --filter @beverly/admin-app build
```
> This runs `vue-tsc --noEmit && vite build` (`apps/admin/package.json`) — any type error
> introduced in `Dashboard.vue`, `RolesPermissions.vue`, `Permissions.vue` or `stores/auth.ts`
> fails here. Run it after every frontend edit, not just at the end.

```bash
corepack pnpm --filter @beverly/wallet-backend build
```
```bash
npm --prefix backend/wallet run test
```
```bash
npm run test:wallet
```
```bash
node tools/migration-hygiene-check.cjs
```
> Required only for PR-4 when A-2a adds a migration.

```bash
npm run build
```
```bash
npm test
```

Rules:
- **No `--force`, no skipped tests, no `.only`.** A red test is a blocked merge.
- If `npm test` is red **before** your change on a clean checkout, capture that baseline in the
  PR description and confirm your change does not extend it. Do not fix unrelated red tests in
  these PRs.
- New TypeScript must not use `any` where a type exists; `feedState`, `FeedState`, and the
  wallet/balance row shapes above are all explicitly typed for this reason.

---

## 9. Rollback

| PR | Rollback | Data impact |
|---|---|---|
| PR-1 | `git revert` | None — read-only paths |
| PR-2 | `git revert` | None — read-only paths |
| PR-3 | `git revert` | None |
| PR-4 code | `git revert` | Roles created under the new rules remain valid |
| PR-4 migration (A-2a) | Forward-fix only | `alter column type text using name::text` is not losslessly reversible to an enum. Take a `roles` table snapshot before applying. |

Roles created while PR-4 is live remain consistent after a revert: no new columns, no new key
format. The only non-reversible step is the A-2a type change, which is why it is isolated and
conditional.

---

## 10. Out of scope (deliberately)

Recorded so they are not silently dropped:

1. **Making `requireAccessManager` permission-driven** (A-5 follow-up). An authorization-model
   change; needs its own design, threat review, and test plan.
2. **Materialised wallet-balance aggregate.** PR-2 removes the N+1 with two paginated queries.
   If wallet count exceeds ~50k, revisit with a `SECURITY DEFINER` aggregate RPC following the
   pattern in `supabase/migrations/20260606110000_refund_approval_rpc.sql`.
3. **A disputes feed for the Recent Activity tab** (A tab was declared without a source, D-4c
   removes it).
4. **Replacing localStorage session caching** (D-8 is mitigated, not eliminated).
5. **Real sparkline series** (D-10) — needs a time-bucketed endpoint that does not exist.

---

## 11. Traceability

| ID | Grade | Severity | PR | Test lock |
|---|---|---|---|---|
| A-1 | CONFIRMED | High | PR-4 | `role-key-slug.test.ts`, role UI contract |
| A-2 | VERIFY-FIRST | High* | PR-4 | pre-flight query + migration |
| A-3 | CONFIRMED | High | PR-4 | `role-key-slug.test.ts` |
| A-4 | CONFIRMED | Medium | PR-4 | `role-key-slug.test.ts` |
| A-5 | POLICY | Medium | PR-4 | role UI contract |
| A-6 | CONFIRMED | Medium | PR-4 | backend zod test |
| A-7 | CONFIRMED | Medium | PR-4 | — (manual) |
| A-8 | CONFIRMED | Medium | PR-4 | role UI contract |
| A-9 | CONFIRMED | Low | PR-4 | — |
| A-10 | CONFIRMED | Low | PR-4 | role UI contract |
| A-11 | CONFIRMED | Low | PR-4 | — |
| A-12 | CONFIRMED | Low | PR-4 | — |
| D-0 | CONFIRMED | High | PR-1 | dashboard contract + manual matrix |
| D-1 | CONFIRMED | High | PR-1 | `wallet-summary-scope.test.ts` |
| D-2 | CONFIRMED | High | PR-2 | `purchase-aggregate.test.ts` |
| D-3 | CONFIRMED | Medium | PR-2 | `business-day.test.ts` |
| D-4 | CONFIRMED | Medium | PR-3 | — (manual) |
| D-5 | CONFIRMED | Medium | PR-3 | schema pre-flight |
| D-6 | CONFIRMED | Medium | PR-1 | dashboard contract |
| D-7 | CONFIRMED | High | PR-2 | `purchase-aggregate.test.ts` |
| D-8 | CONFIRMED | Medium | PR-3 | — |
| D-9 | CONFIRMED | Medium | PR-1 | — (manual) |
| D-10 | CONFIRMED | Low | PR-3 | — |
| T-0 | CONFIRMED | High | §7 | self-locking |

\* A-2 severity is High **only if** the pre-flight query shows a non-text `roles.name`.
On a repo-built database it is a no-op.
