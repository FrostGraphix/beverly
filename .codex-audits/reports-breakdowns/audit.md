# Reports Breakdown Audit

## Audit scope

- Reports flow was traced.
- Backend queries were reviewed.
- Site scoping was reviewed.
- Export contracts were reviewed.
- Power BI needs were reviewed.
- Accessibility patterns were reviewed.

## Confirmed gaps

- Vendor separation was missing.
- Customer separation was missing.
- Site filtering was missing.
- Grouped exports were missing.
- Power BI schema was missing.
- Entity searching was missing.
- Entity pagination was missing.
- Date validation stayed weak.
- Formula injection remained possible.
- Staff scopes leaked aggregates.
- PDF omitted entity performance.

## Closed gaps

- Vendor groups now exist.
- Customer groups now exist.
- SiteID filtering now exists.
- SiteID grouping now exists.
- Cross-site entities stay separated.
- Direct purchases remain visible.
- Vendor-assisted purchases remain visible.
- Customer counts remain visible.
- Revenue uses delivered purchases.
- Success uses processed purchases.
- Database aggregation prevents truncation.
- Staff station scopes apply.
- Unauthorized SiteIDs return errors.
- Unassigned staff receive errors.
- Search now filters groups.
- Pagination now limits tables.
- Power BI CSV now exists.
- Schema version stays explicit.
- NGN scaling stays explicit.
- Formula payloads get neutralized.
- Dates receive strict validation.
- PDF includes grouped performance.

## Browser evidence

### Reports login blocker

![Reports login blocker](01-reports-login-blocker.png)

## Evidence limits

- Authentication remained browser-blocked.
- Credentials remained masked throughout.
- Authenticated visuals remain unverified.
- Code contracts passed locally.
