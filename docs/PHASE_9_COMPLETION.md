Phase 9 Completion
==================

Architecture fit
- `backend/src/services/local-database.js` owns SQLite persistence.
- `api/reference.js` owns cache, audit, and local job routing.
- `src/services/local-jobs.mjs` owns frontend job logging.
- `tests/` verifies cache fallback and persisted jobs.

Implemented
- SQLite local database bootstrap
- portable UUID and timestamp schema
- users, roles, permissions tables
- audit log persistence
- API read cache persistence
- cache fallback for live read failures
- import job persistence
- export job persistence
- print job persistence
- write confirmation persistence
- frontend export and print job logging

Done when
- app runs offline through facade and cache
- live reads can be cached
- audit logs persist
