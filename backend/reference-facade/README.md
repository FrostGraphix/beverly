# Reference Facade

Local API facade for the reference `9310` contract.

## Run

```powershell
node backend/reference-facade/server.js
```

## Health

```powershell
Invoke-RestMethod http://127.0.0.1:9310/health
```

## Contract

- Preserves `/api/*` paths.
- Preserves `POST` methods.
- Preserves bearer auth shape.
- Uses deterministic fixtures.
