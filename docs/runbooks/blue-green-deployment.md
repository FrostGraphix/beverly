# Blue-Green Deployment & Instant Recovery

## Overview

Beverly uses Vercel for hosting. Blue-green is implemented via **Vercel deployment aliases**:

| Slot | Meaning |
|------|---------|
| **Blue** | Current live production (recorded in `LAST_STABLE_DEPLOYMENT_URL`) |
| **Green** | Candidate deployment being promoted |

Traffic switches instantly when the production alias is re-pointed. No DNS TTL wait.

---

## Normal Promotion Flow

```
Push to main
    ↓
CI passes (unit tests + typecheck + build)
    ↓
Vercel auto-deploys to a unique preview URL  (green)
    ↓
Manually trigger: Actions → Blue-Green Promote & Rollback → action=promote
    ↓
Workflow: health → readiness → smoke test → alias → record last-stable
    ↓
Production is now the new deployment
```

### Step-by-step

1. **Wait for Vercel preview URL** — check the `frontend-build` CI job artifacts or Vercel dashboard.
2. **Run promote**:
   - Go to **Actions → Blue-Green Promote & Rollback**
   - Set `action = promote`
   - Set `deployment_url` to the green preview URL (e.g. `https://beverly-abc123.vercel.app`)
3. The workflow will:
   - Poll `/api/v1/health` until 200 (up to 60 s)
   - Check `/api/v1/ready` — DB + Redis must both be `ok`
   - Run `tools/wallet-smoke-test.cjs` against the candidate
   - Alias `PRODUCTION_DOMAIN` → candidate URL
   - Record the URL in `LAST_STABLE_DEPLOYMENT_URL` repo variable

---

## Rollback Procedures

### Option A — Normal rollback (2 min)

Use when production is degraded but still reachable enough for you to act calmly.

1. Go to **Actions → Blue-Green Promote & Rollback**
2. Set `action = rollback`
3. Leave `deployment_url` blank
4. Click **Run workflow**

The workflow verifies the stable URL is still alive and re-aliases production.

### Option B — Emergency rollback (< 1 min)

Use when production is **fully down** and you need the fastest possible path.

1. Go to **Actions → Emergency Rollback (1-click)**
2. Type `ROLLBACK` in the confirmation field
3. Optionally supply an `override_url` if the recorded stable URL is also bad
4. Click **Run workflow**

No health checks — immediately re-aliases production to the stable build.

### Option C — Vercel CLI (manual, last resort)

```bash
npx vercel alias \
  "https://beverly-<stable-id>.vercel.app" \
  "<PRODUCTION_DOMAIN>" \
  --token "$VERCEL_TOKEN"
```

Find the last known-good deployment ID in:
- GitHub repo variable `LAST_STABLE_DEPLOYMENT_URL`
- Vercel dashboard → Deployments → filter by "Promoted"

---

## Required Secrets / Variables

| Name | Type | Purpose |
|------|------|---------|
| `VERCEL_TOKEN` | secret | Vercel API token (project-scoped) |
| `VERCEL_ORG_ID` | secret | Vercel org/team ID |
| `VERCEL_PROJECT_ID` | secret | Vercel project ID |
| `VERCEL_PROTECTION_BYPASS` | secret | Bypass password protection for smoke tests |
| `SMOKE_AUTH_TOKEN` | secret | Bearer token for smoke test auth |
| `PRODUCTION_DOMAIN` | variable | e.g. `acob-beverly.vercel.app` |
| `LAST_STABLE_DEPLOYMENT_URL` | variable | Auto-updated on every successful promote |

---

## Health Endpoints

| Endpoint | Purpose | Expected |
|----------|---------|---------|
| `GET /api/v1/health` | Liveness — cheap | `200 { status: "ok" }` |
| `GET /api/v1/ready` | Readiness — DB + Redis | `200 { status: "ready", checks: { database: { ok: true }, redis: { ok: true } } }` |
| `GET /api/v1/version` | Build info | `200 { service, version, node, env }` |

---

## Rollback Decision Tree

```
Is production returning 5xx / unreachable?
├── YES → Emergency Rollback (Option B)
└── NO → Is the issue a bad deploy (new code introduced the bug)?
          ├── YES → Normal Rollback (Option A)
          └── NO → Investigate further (database? redis? paystack?)
                   See gateway-outage.md / database-failover.md
```

---

## Post-Rollback Checklist

- [ ] Confirm `/api/v1/health` returns 200 on production
- [ ] Confirm `/api/v1/ready` returns `status: ready`
- [ ] Check Sentry/logs for the error that triggered rollback
- [ ] Create a post-mortem issue before re-promoting
- [ ] Fix root cause in a new branch, run CI, then promote again
