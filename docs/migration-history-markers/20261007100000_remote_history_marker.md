# Archived comment-only history marker: 20261007100000

Original contents:

```sql
-- Already applied to production before this checkout was synchronized.
-- History marker only; do not replay unknown production DDL.
```

Moved out of the executable migration directory because the same version is
represented by `20261007100000_bounded_api_cache.sql`. No SQL or production
migration-history row was changed. This note alone does not establish live DDL parity.
