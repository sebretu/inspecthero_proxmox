# InspectHero — Backup and Rollback Strategy

> **DOCUMENT TYPE:** Stage 0 Master Disaster Recovery & Rollback Guide  
> **REPO LOCATION:** `/home/ubuntu/building-task-manager`  
> **DATE:** 2026-09-24  
> **STATUS:** Verified & Documented

---

## 1. Backup Strategy Overview

To ensure complete data safety across all stages of the migration, backups must cover:
1. **PostgreSQL Database** (Schemas: `public`, `auth`, `storage`, custom types, triggers, and RPC functions).
2. **Supabase Storage Buckets** (Binary photo uploads, CAD/PDF blueprints, generated PDFs).
3. **Application Code & Configuration** (Next.js web, shared packages, sidecar services, environment variables).

---

## 2. Backup Procedures

### 2.1 Database & Schema Backup

#### A. Direct PostgreSQL Dump (Recommended for Full Backup)
```bash
# Set timestamp
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/home/ubuntu/backups/db"
mkdir -p "$BACKUP_DIR"

# Full PostgreSQL dump including schemas, functions, and data
pg_dump -h 127.0.0.1 -p 54322 -U postgres -d postgres -F c -b -v -f "$BACKUP_DIR/db_full_${TIMESTAMP}.dump"
pg_dump -h 127.0.0.1 -p 54322 -U postgres -d postgres -F p -v -f "$BACKUP_DIR/db_full_${TIMESTAMP}.sql"
gzip "$BACKUP_DIR/db_full_${TIMESTAMP}.sql"
```

#### B. Docker Container Backup (Supabase CLI Environment)
```bash
DB_CONTAINER="supabase_db_building-task-manager"
docker exec -t "$DB_CONTAINER" pg_dump -U postgres postgres | gzip > "/home/ubuntu/backups/supabase_db_${TIMESTAMP}.sql.gz"
```

### 2.2 Application Code & Configuration Backup
```bash
# Automated tar backup script already available in repo:
python3 /home/ubuntu/create_backup.py
```

### 2.3 Supabase Storage Backup
```bash
# Sync storage volume or S3 bucket to local directory
STORAGE_DIR="/home/ubuntu/backups/storage"
mkdir -p "$STORAGE_DIR"
# Copy uploaded assets (tiles, task photos, plans)
rsync -avz --exclude 'node_modules' /home/ubuntu/building-task-manager/web/private_tiles "$STORAGE_DIR/"
rsync -avz --exclude 'node_modules' /home/ubuntu/building-task-manager/web/private_reports "$STORAGE_DIR/"
```

---

## 3. Restore Procedures

### 3.1 PostgreSQL Database Restore
```bash
# 1. Stop web application to prevent concurrent writes
# (e.g., pm2 stop inspecthero-web or systemctl stop inspecthero)

# 2. Execute restore script
/home/ubuntu/building-task-manager/scripts/restore.sh /home/ubuntu/backups/db/db_full_<TIMESTAMP>.sql.gz

# 3. Verify integrity
docker exec -i supabase_db_building-task-manager psql -U postgres -d postgres -c "
  SELECT count(*) AS companies_count FROM companies;
  SELECT count(*) AS profiles_count FROM profiles;
  SELECT count(*) AS projects_count FROM projects;
  SELECT count(*) AS tasks_count FROM tasks;
  SELECT count(*) AS cables_count FROM cables;
"
```

---

## 4. Rollback Plan by Component

### 4.1 SQL Migration Rollback (Zero-Downtime / Additive)
* All migration scripts created during this migration are strictly **additive** (e.g., adding `version`, `deleted_at`, `client_created_at`, `sync_changes`, `processed_mutations`).
* Because existing columns and tables are never dropped or renamed, existing web clients continue operating without interruption even if new sync columns are present.
* To roll back a migration trigger or function:
  ```sql
  -- Safe disable of sync trigger if needed:
  DROP TRIGGER IF EXISTS trg_tasks_sync_changes ON public.tasks;
  ```

### 4.2 Web Application Rollback
```bash
# 1. Restore previous git commit
cd /home/ubuntu/building-task-manager
git checkout <PREVIOUS_COMMIT_TAG>

# 2. Rebuild and restart web
cd web
npm run build
pm2 restart inspecthero-web || ./deploy.sh
```

### 4.3 Mobile App Emergency Kill-Switch (Feature Flag Disable)
The backend sync endpoints `/api/sync/pull` and `/api/sync/push` respect the following feature flags:
* `MOBILE_SYNC_ENABLED=false`
* `MOBILE_WRITE_ENABLED=false`

If disabled:
1. Mobile requests receive HTTP 503 `SERVICE_TEMPORARILY_DISABLED`.
2. Existing web users and traditional `/api/*` endpoints continue operating 100% normally.
3. Mobile client keeps unsynced mutations safely stored in local SQLite until sync is re-enabled.

---

## 5. Verification Checklist for Restore & Rollback

- [x] Database dump script verified and working.
- [x] Restore script (`/home/ubuntu/building-task-manager/scripts/restore.sh`) exists and handles gzip dumps.
- [x] Web and backend use additive DB schema patterns (no `DROP TABLE` or destructive DDL allowed).
- [x] Mobile kill-switch architecture designed and documented.
- [x] Verification query checklist prepared for data integrity confirmation.
