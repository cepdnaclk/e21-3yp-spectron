# Database (PostgreSQL + TimescaleDB)

This folder contains database migrations and DB verification scripts.

## Folder Layout

- `migrations/` → schema and seed SQL migrations
- `scripts/` → database utility scripts (`check-db*.ps1`, `check-db.sql`)
- `docs/` → extra reference docs
- root `check-db*.ps1` → compatibility wrappers to `scripts/`

## Prerequisites

- PostgreSQL installed and running
- `psql` client available in `PATH`
- TimescaleDB extension installed (recommended)

Check tools:

```powershell
psql --version
```

If `psql` is not found, install PostgreSQL and add the PostgreSQL `bin` folder to `PATH`.

## Team `.env` Setup

This folder now includes:
- `.env` (local shared defaults)
- `.env.example` (template)

Update `.env` for your machine if needed:

```env
DB_HOST=localhost
DB_PORT=5432
DB_USER=spectron
DB_PASSWORD=spectron
DB_NAME=spectron
DATABASE_URL=postgres://spectron:spectron@localhost:5432/spectron?sslmode=disable
```

`check-db.ps1` reads this file automatically.

## Create Database and User (example)

Open `psql` as superuser and run:

```sql
CREATE USER spectron WITH PASSWORD 'spectron';
CREATE DATABASE spectron OWNER spectron;
\c spectron
GRANT USAGE, CREATE ON SCHEMA public TO spectron;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS timescaledb;
```

> `timescaledb` is used for hypertable support on `sensor_readings`.

If your database already exists and backend startup fails with `permission denied for schema public`, run this as a PostgreSQL superuser:

```sql
ALTER DATABASE spectron OWNER TO spectron;
GRANT USAGE, CREATE ON SCHEMA public TO spectron;
```

## Run Migrations

From this folder (`software/database`):

```powershell
psql -U spectron -d spectron -f .\migrations\001_init.sql
```

Optional test user seed:

```powershell
psql -U spectron -d spectron -f .\migrations\002_create_test_user.sql
```

## Verify Database

Run the automated checker:

```powershell
.\check-db.ps1
```

Or override values explicitly:

```powershell
.\check-db.ps1 -User spectron -Database spectron -Host localhost -Port 5432
```

Or open psql and inspect quickly:

```sql
\dt
SELECT current_database(), current_user;
SELECT extname FROM pg_extension WHERE extname IN ('timescaledb','pgcrypto');
```

## Important Note on TimescaleDB

The migration `001_init.sql` will:
- create a hypertable for `sensor_readings` when TimescaleDB exists,
- otherwise keep a normal PostgreSQL table and create indexes.

So the project can still run without TimescaleDB, but TimescaleDB is strongly recommended for time-series performance.
