# Station Onboarding Creative Ops

## Mission

Stand up a new station ID.
Make it vending-ready.
Make it remote-ready.
Make it report-ready.

This doc now matches the shipped CRM flow.
The missing meter-create gap is closed.
Use `#/system/station-onboarding-studio` as the command surface.

---

## Operating Model

The flow is not one backend transaction.
It is a controlled chain.
Each stage writes one dependency.
Each later stage consumes the earlier stage.

Working order:

1. Station
2. Gateway
3. Meter
4. Tariff
5. Customer
6. Account
7. Vending
8. Remote operations
9. Reports

Core routes:

- `#/system/station-onboarding-studio`
- `#/admin/station`
- `#/management/gateway`
- `#/admin/meter`
- `#/management/tariff`
- `#/management/customer`
- `#/management/account`
- `#/token-generate/credit-token`
- `#/remote-operation/remote-meter-reading`
- `#/prepay-report/long-nonpurchase-situation`

---

## New Command Surface

Use `Station Onboarding Studio`.

Purpose:

- one station selector
- one readiness board
- one launch lane
- one guided step stack
- one modal workflow

The studio does four jobs:

1. selects the active station
2. launches each create step
3. refreshes dependency counts
4. exposes downstream launch links

Readiness lanes:

- Provisioning lane
- Vending lane
- Remote lane
- Report lane

---

## Step Flow

### 1. Register Station

Route:

- `#/admin/station`

Write:

- `POST /api/station/create`

Read:

- `POST /api/station/read`

Required fields:

- `stationId`
- `name`

Outcome:

- station becomes selectable
- downstream forms inherit station context

### 2. Attach Gateway

Route:

- `#/management/gateway`

Write:

- `POST /api/gateway/create`

Read:

- `POST /api/gateway/read`

Required fields:

- `gatewayId`
- `stationId`

Outcome:

- station now has a telemetry lane

### 3. Provision Meter

Route:

- `#/admin/meter`

Write:

- `POST /api/meter/create`

Read:

- `POST /api/meter/read`

Required fields:

- `meterId`
- `type`
- `isThreePhase`
- `communicationWay`
- `protocolVersion`
- `stationId`

Optional fields:

- `lat`
- `lng`
- `remark`

Shipped change:

- meter page now supports `Add`
- meter page now supports `Edit`
- meter page now supports `Delete`
- meter page now supports `Import`
- studio now launches meter create directly

Why it matters:

- this was the live onboarding gap
- no end-to-end vending flow existed without it

### 4. Publish Tariff

Route:

- `#/management/tariff`

Write:

- `POST /api/tariff/create`

Read:

- `POST /api/tariff/read`

Required fields:

- `tariffId`

Outcome:

- vending math can resolve unit price

Important:

- tariff is global
- not station-scoped

### 5. Register Customer

Route:

- `#/management/customer`

Write:

- `POST /api/customer/create`

Read:

- `POST /api/customer/read`

Required fields:

- `customerId`
- `customerName`
- `stationId`

Outcome:

- customer exists in the same station boundary as the meter

### 6. Bind Account

Route:

- `#/management/account`

Write:

- `POST /api/account/create`

Read:

- `POST /api/account/read`

Required fields:

- `customerId`
- `meterId`
- `stationId`

Common fields:

- `tariffId`
- `ctRatio`
- `remark`

What this binding does:

- links customer to meter
- links meter to tariff
- becomes the base row for vending
- becomes the base row for remote operations
- becomes the join key for many reports

Constraint:

- upstream `account/create` can still fail
- CRM now falls back to a local binding ledger
- the create still returns success
- account reads merge the local binding back in
- vending and remote follow-up can continue inside CRM

---

## Vending Flow

Once account binding exists:

### Credit Token

Route:

- `#/token-generate/credit-token`

Reads:

- `POST /api/station/read`
- `POST /api/account/read`
- `POST /api/tariff/read`

Write:

- `POST /api/token/creditToken/generate`

Payload shape uses:

- `customerId`
- `meterId`
- `tariffId`
- `amount` or `totalUnit`
- `purchaseWay`
- `paymentMethod`

### Other Token Flows

Routes:

- `#/token-generate/clear-tamper-token`
- `#/token-generate/clear-credit-token`
- `#/token-generate/set-maximum-power-limit-token`

Writes:

- `POST /api/token/clearTamperToken/generate`
- `POST /api/token/clearCreditToken/generate`
- `POST /api/token/setMaximumPowerLimitToken/generate`

### Token Records

Reads:

- `POST /api/token/creditTokenRecord/read`
- `POST /api/token/clearTamperTokenRecord/read`
- `POST /api/token/clearCreditTokenRecord/read`
- `POST /api/token/setMaximumPowerLimitTokenRecord/read`

Use these pages to confirm:

- receipt exists
- token exists
- station tagging exists
- vending trail is auditable

---

## Remote Operations

Base requirement:

- account binding must exist

Source route set:

- `#/remote-operation/remote-meter-reading`
- `#/remote-operation/remote-meter-control`
- `#/remote-operation/remote-meter-token`

Source dataset:

- `POST /api/account/read`

Task writes:

- `POST /api/RemoteMeterTask/CreateReadingTask`
- `POST /api/RemoteMeterTask/CreateControlTask`
- `POST /api/RemoteMeterTask/CreateTokenTask`

Task record reads:

- `POST /api/RemoteMeterTask/GetReadingTask`
- `POST /api/RemoteMeterTask/GetControlTask`
- `POST /api/RemoteMeterTask/GetTokenTask`

Operational meaning:

- if the account exists, the meter can be targeted
- if the meter station is wrong, task routing breaks

---

## Reporting Flow

### Long Nonpurchase

Route:

- `#/prepay-report/long-nonpurchase-situation`

Needs:

- customer
- meter
- tariff
- station

### Low Purchase

Route:

- `#/prepay-report/low-purchase-situation`

Needs:

- customer
- meter
- tariff
- station

### Interval Data

Route:

- `#/prepay-report/daily-data-meter`

Needs:

- meter
- gateway
- station

Important rule:

- `DailyDataMeter` requires `stationId`

### Consumption Statistics

Route:

- `#/prepay-report/consumption-statistics`

Needs:

- station
- customer
- meter
- daily meter data

---

## Control Rules

### Station Context

The studio keeps one active station.
Gateway, meter, customer, and account inherit it.

### Tariff Context

Tariff remains shared.
Do not clone tariff per station unless operations demands it.

### Customer Meter Match

Customer and meter station must align.
Account bind should only pair matching station records.

### Meter Create Schema

Live swagger schema confirms:

```json
{
  "meterId": "required",
  "type": "integer",
  "isThreePhase": "integer",
  "communicationWay": "enum",
  "protocolVersion": "string",
  "lat": "number",
  "lng": "number",
  "remark": "string",
  "stationId": "string"
}
```

---

## Studio Use Pattern

Recommended operator loop:

1. open `Station Onboarding Studio`
2. create station
3. pick the station
4. create gateway
5. create meter
6. create or confirm tariff
7. create customer
8. create account
9. use launch links
10. verify token page
11. verify remote page
12. verify report page

---

## Verification Checklist

Provisioning check:

- station visible
- gateway visible
- meter visible

Vending check:

- account row visible
- credit token page lists the meter
- test vend returns token record

Remote check:

- meter appears on remote operation pages
- reading task can be queued

Report check:

- station appears in report filters
- customer and meter appear in nonpurchase views
- interval page resolves station rows

---

## Current Limits

- upstream account storage can still fail
- fallback binding exists inside CRM, not the third-party core
- readiness board reflects merged live plus local state

---

## Shipped Files

- [src/components/OnboardingStudioPage.vue](/C:/Users/ACOB/Desktop/VS%20Code/acob-crm-4/src/components/OnboardingStudioPage.vue)
- [src/data/route-manifest.js](/C:/Users/ACOB/Desktop/VS%20Code/acob-crm-4/src/data/route-manifest.js)
- [src/services/management-forms.mjs](/C:/Users/ACOB/Desktop/VS%20Code/acob-crm-4/src/services/management-forms.mjs)
- [src/services/action-service.mjs](/C:/Users/ACOB/Desktop/VS%20Code/acob-crm-4/src/services/action-service.mjs)
- [src/components/ActionModal.vue](/C:/Users/ACOB/Desktop/VS%20Code/acob-crm-4/src/components/ActionModal.vue)
