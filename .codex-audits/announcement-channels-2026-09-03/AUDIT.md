# Announcement Delivery Channels Audit

## Scope

Wallet Admin announcement composition, recipient resolution, in-app notification delivery, Resend email delivery, history, exports, webhooks, and customer/vendor inbox visibility.

## Verified journey

1. Select Notification, Email, or Both.
2. Resolve eligible wallet customers and vendors for that medium.
3. Choose all matching recipients or selected identities.
4. Compose and review the announcement.
5. Persist the chosen channels and idempotency key.
6. Create in-app notifications only when selected.
7. Send Resend email only when selected and reachable.
8. Track partial email failure without duplicating successful notifications.
9. Exclude email-only deliveries from in-app inboxes.
10. Display and export the stored delivery medium.

## Closed gaps

- Added explicit Notification, Email, and Both choices.
- Added channel-aware recipient guidance and counts.
- Added distinct notification and unique-email totals in review.
- Added backend channel validation and canonical persistence.
- Made notification and Resend fan-out independently conditional.
- Preserved successful notifications during email failure.
- Prevented unsafe retry-key rotation after partial notification delivery.
- Made webhook rollups aware of successful in-app delivery.
- Prevented email-only records leaking into customer or vendor inboxes.
- Added delivery medium to history and exports.
- Preserved legacy clients with Both as the default.

## Verification

- Production build: passed.
- Backend tests: 353 passed across 41 files.
- Backend typecheck: passed.
- Announcement contract: passed.
- Live authenticated page: passed.
- Live recipient API: 2 customers, 11 vendors, 13 total.
- No real announcement sent during QA.

## Evidence

- `01-delivery-mediums.png`
- `02-combined-review.png`

## Health

Green. The selectable-channel flow is fully wired without requiring a database migration because the existing `channel` lineage already stores the delivery medium.
