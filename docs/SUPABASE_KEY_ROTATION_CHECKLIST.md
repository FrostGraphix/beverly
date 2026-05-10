# Supabase Key Rotation Checklist

## Why

Keys were exposed in chat.

Treat them as compromised.

## Rotate

Rotate in Supabase dashboard:

- project API keys
- anon key
- service role key
- secret key
- database password
- personal access token

## Update

Update every runtime:

- local `.env`
- Vercel production env
- Vercel preview env
- CI secrets
- deployment docs

## Verify

Run:

```powershell
npm.cmd run build
node --disable-warning=ExperimentalWarning tests\supabase-migrations.test.cjs
```

Smoke:

- admin login
- storage report
- live route read
- guarded write block

## Rule

Never place service role keys in frontend code.

Never commit `.env`.

