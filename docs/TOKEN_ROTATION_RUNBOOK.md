Token Rotation Runbook
======================

Owner
-----
- business owner: ACOB operations
- technical owner: Beverly by ACOB maintainer
- upstream owner: AMR API provider

Stored Tokens
-------------
- `LIVE_API_BEARER_TOKEN`: production/preview live API token
- `UPSTREAM_BEARER_TOKEN`: local capture and fallback token
- `GPRS_UPSTREAM_BEARER_TOKEN`: optional GPRS-specific token

Rotation Schedule
-----------------
- rotate before token expiry
- rotate immediately after staff changes
- rotate immediately after suspected exposure
- validate in preview before production

Expiry Check
------------
1. Decode JWT header and claims locally.
2. Confirm `exp` is later than planned deployment date.
3. Confirm required permission claims exist.
4. Run live smoke after update.

Preview Validation
------------------
```powershell
$env:TARGET_URL="https://your-preview-url.vercel.app"
npm run smoke:vercel
```

Emergency Rotation
------------------
1. Revoke exposed token upstream.
2. Create replacement token.
3. Update Vercel preview env.
4. Deploy preview.
5. Run smoke.
6. Update production env.
7. Redeploy production.
8. Run smoke again.

Secure Storage Notes
--------------------
- never commit `.env`
- never paste tokens into docs
- store production tokens in Vercel environment variables
- keep `.env.example` empty
- do not log Authorization headers

Done Criteria
-------------
- token changes require no code changes
- preview validates before production
- smoke passes after rotation
