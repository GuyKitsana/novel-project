# Novel Backend

Express.js + TypeScript backend for Novel Book Recommendation System.

## Database Migrations

**Canonical Location:** `backend/src/db/migrations/`

The source of truth for database schema changes is in the migrations folder:

- `000000_baseline_schema.sql` - Baseline schema (all current tables)
- `000001_add_user_book_views.sql` - Adds user_book_views table (optional feature)

### Migration Guidelines

- **New schema changes:** Create new migration files following the naming pattern:
  - `000002_your_change_name.sql`
  - `000003_another_change.sql`
  - etc.

- **Do NOT edit existing migration files** (except to fix typos)
- **Always use `IF NOT EXISTS`** for idempotency
- **Test migrations** before applying to production

### Legacy Scripts

Files in `backend/scripts/` are legacy/manual helper scripts:
- `apply_schema_updates.sql` - Legacy script (kept for reference only)
- Do not use these for new schema changes

## Development

```bash
npm install
npm run dev
```

Server runs on `http://localhost:3001` by default.

## Environment Variables

Required:
- `DATABASE_URL` or PostgreSQL connection vars (`PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`)
- `JWT_SECRET` - Secret key for JWT token signing

Optional:
- `PORT` - Server port (default: 3001)
