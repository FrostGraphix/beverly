# Paystack Live Payment Runbook

## Endpoint goal

Accept live Paystack payments for customer wallet top-ups, customer direct token purchases, and vendor wallet funding. Deliver value exactly once after server-side verification, with webhook and scheduled reconciliation as recovery paths.

## Phase 1 - Gateway boundary

- Task: initialize transactions only from the wallet backend.
- Endpoints: Paystack `POST /transaction/initialize` and `GET /transaction/verify/:reference`.
- Done when: secret keys remain server-only, calls time out safely, and webhook HMAC uses `PAYSTACK_SECRET_KEY`.

## Phase 2 - Canonical fulfillment

- Task: verify ownership, reference, amount, currency, and success before crediting or issuing a token.
- Endpoints:
  - `POST /api/v1/customer/wallet/fund`
  - `POST /api/v1/customer/purchase`
  - `POST /api/v1/vendor/funding/paystack`
  - `POST /api/v1/customer/payments/:reference/verify`
  - `POST /api/v1/vendor/payments/:reference/verify`
- Done when: callback, webhook, and scheduler all pass through the payment fulfillment lease and idempotent ledger keys.

## Phase 3 - Return experience

- Task: verify Paystack's returned `reference` and display confirmed, processing, or delayed status.
- Consumers: customer Fund Wallet, customer Buy Token, and vendor Fund Wallet pages.
- Done when: a redirect never claims success on its own and the user has a clear recovery state.

## Phase 4 - Production activation

- Set the Paystack dashboard callback URL to `https://beverly.acoblighting.com`.
- Set the Paystack dashboard webhook URL to `https://beverly.acoblighting.com/api/v1/webhook/paystack`.
- Provision the variables from `.env.example` in the production wallet backend. Never copy `.env` into source control.
- Apply all Supabase migrations, including payment transaction status, webhook deduplication, and fulfillment leases.
- Deploy the separate BullMQ wallet worker and verify its heartbeat before relying on scheduled payment recovery.
- Enable both `MONEY_WRITES_ENABLED=true` and `WALLET_PROXY_MONEY_WRITES_ENABLED=true` only after the production secret, webhook URL, Supabase service role, and portal URLs are present.
- Run the focused tests, build, public webhook signature smoke test, one low-value live payment, ledger/Paystack reconciliation, and duplicate webhook replay check.

## Recovery and operations

- Paystack retries webhooks; duplicate events are deduplicated before fulfillment.
- The payment scheduler verifies initiated/pending transactions when a callback or webhook is missed.
- Amount, reference, currency, frozen-wallet, or token-delivery failures are retained for operations review rather than silently delivering value.
- Rotate the Paystack secret immediately if it is exposed outside approved secret storage, then update the deployment environment before accepting more payments.
