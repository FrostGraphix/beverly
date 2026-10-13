# SparkMeter local contract sandbox

## Purpose

This is a deterministic development harness. It lets Beverly test its Koios v2 read adapter without SparkMeter sandbox access, real credentials, or network access.

The harness uses only synthetic data. The adapter still constructs the documented official Koios v2 request. Tests inject the harness through the existing fetch seam. Production host validation is unchanged.

## Coverage

- Koios v2 live-reading request path and body.
- Dual API-key header names with synthetic-only values.
- Canonical reading normalization.
- Explicitly unknown energy-counter interpretation.
- Malformed-reading quarantine.
- Unsupported routes fail closed.

## Limitations

This is not a SparkMeter-operated sandbox. It does not validate provider credentials, TLS, provider availability, live meter behavior, or deployment networking. It does not simulate payments, retries, ambiguous-write reconciliation, tariffs, credit units, or offline cutoff. Those contracts remain unverified and must not be inferred from these tests.

Never point production credentials at this fixture. Never treat its results as vendor certification or permission to activate writes.

## Run

```powershell
npm --prefix backend/wallet run test -- --run src/adapters/__tests__/sparkmeter-contract-sandbox.test.ts
```

The fixture lives under adapter tests. It is excluded from runtime imports and has no listener or network transport.
