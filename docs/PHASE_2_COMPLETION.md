# Phase 2 Completion

## Scope

- Add `LIVE_API_BEARER_TOKEN`
- Forward caller bearer first
- Fallback to env bearer
- Preserve query strings
- Support `GET`, `POST`, uploads
- Normalize `/API/...` and `/api/...`
- Keep live response raw
- Add app-normalized fields
- Log proxy failures
- Fallback to local facade only when live fails

## Completed

- Live proxy now forwards caller token first.
- Live proxy now falls back to env token.
- Query strings stay intact.
- Multipart uploads pass through.
- Alias casing resolves through `reference-contract.json`.
- Live responses preserve raw fields.
- App fields `msg`, `reason`, `data`, `result` are normalized.
- Proxy failures log once before facade fallback.
- Facade fallback only happens after live transport or upstream failure.

## Verification

- `readMore` works through facade fallback path.
- `readHourly` remains covered by facade route support.
- Prepay report casing aliases resolve from contract.
- Remote task reads resolve to live alias paths.
- `npm run test`
- `npm run build`
