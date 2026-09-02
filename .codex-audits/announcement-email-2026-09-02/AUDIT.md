# Announcement email audit

Date: 2 September 2026

## Verdict

The announcement email pipeline is corrected. New broadcasts now preserve message structure, remove repeated Beverly sign-offs, embed the official Beverly logo, and adapt safely across light and dark email clients.

## Root causes

1. The logo used an external URL.
   - Local and undeployed asset URLs could not load inside inboxes.
   - New emails now use an inline CID attachment.

2. Message whitespace was escaped only.
   - Email HTML collapsed paragraphs and numbered steps.
   - New emails render paragraphs and ordered lists.

3. Sign-offs were duplicated.
   - Admin-written sign-offs appeared above the automatic footer.
   - Common trailing Beverly sign-offs are now removed.

4. The email table was malformed.
   - The card table sat directly inside another table.
   - The card now uses a valid row and cell wrapper.

5. Dark mode was unavailable.
   - The email declared light mode only.
   - It now declares light and dark schemes.
   - The logo remains readable on a stable white surface.

## Audited flow

1. Compose — Healthy
   - Titles and messages accept normal text.
   - Newlines remain visible during review.

2. Review — Healthy
   - The official Beverly logo loads.
   - Repeated sign-offs are removed.
   - Numbered steps remain separated.

3. Rendering — Healthy
   - Paragraphs render separately.
   - Numbered instructions use an ordered list.
   - Untrusted HTML remains escaped.

4. Delivery payload — Healthy
   - Resend receives the logo attachment.
   - HTML references the attachment by CID.
   - Batch delivery retains idempotency.

5. Theme handling — Healthy
   - Light mode remains legible.
   - Dark mode receives matching colors.
   - Logo contrast remains stable.

6. Verification — Healthy
   - Production builds passed.
   - Backend tests: 353 passed.
   - Backend test files: 41 passed.
   - Announcement contract passed.
   - Whitespace validation passed.

## Evidence limits

No real replacement broadcast was sent. That avoided contacting recipients during verification. The Resend payload, generated HTML, inline logo data, formatting, theme rules, escaping, and application review screen were verified locally. Final inbox rendering still varies slightly by email client.

## Evidence

- `01-corrected-review.png`
- `02-corrected-review-logo.png`
- `preview.html`
- `render-preview.mjs`
