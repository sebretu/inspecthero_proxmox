import type { SQLiteDatabase } from 'expo-sqlite';

export interface Migration {
  version: number;
  up: (db: SQLiteDatabase) => Promise<void>;
}

export const migrations: Migration[] = [
  {
    version: 1,
    up: async (db: SQLiteDatabase) => {
      // 1. sync_meta table for storing server cursor & sync state
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS sync_meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);

      // 2. mutations table for tracking offline writes & retry queue
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS mutations (
          mutation_id TEXT PRIMARY KEY,
          entity_type TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          operation TEXT NOT NULL,
          base_version INTEGER NOT NULL,
          payload TEXT NOT NULL,
          status TEXT NOT NULL CHECK(status IN ('PENDING', 'SYNCING', 'SYNCED', 'FAILED', 'CONFLICT')),
          attempts INTEGER NOT NULL DEFAULT 0,
          last_error TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_mutations_status ON mutations(status, created_at);
      `);

      // 3. Local Replica Tables (mirroring PostgreSQL domain entities)
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY,
          company_id TEXT,
          name TEXT NOT NULL,
          status TEXT,
          created_at TEXT,
          updated_at TEXT,
          version INTEGER NOT NULL DEFAULT 1,
          deleted_at TEXT
        );

        CREATE TABLE IF NOT EXISTS buildings (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          name TEXT NOT NULL,
          code TEXT,
          address TEXT,
          created_at TEXT,
          updated_at TEXT,
          version INTEGER NOT NULL DEFAULT 1,
          deleted_at TEXT
        );

        CREATE TABLE IF NOT EXISTS floors (
          id TEXT PRIMARY KEY,
          building_id TEXT NOT NULL,
          name TEXT NOT NULL,
          level_number INTEGER,
          created_at TEXT,
          updated_at TEXT,
          version INTEGER NOT NULL DEFAULT 1,
          deleted_at TEXT
        );

        CREATE TABLE IF NOT EXISTS plans (
          id TEXT PRIMARY KEY,
          floor_id TEXT,
          project_id TEXT,
          name TEXT NOT NULL,
          pdf_url TEXT,
          image_url TEXT,
          width REAL,
          height REAL,
          created_at TEXT,
          updated_at TEXT,
          version INTEGER NOT NULL DEFAULT 1,
          deleted_at TEXT
        );

        CREATE TABLE IF NOT EXISTS tasks (
          id TEXT PRIMARY KEY,
          plan_id TEXT NOT NULL,
          title TEXT,
          description TEXT,
          status TEXT NOT NULL DEFAULT 'open',
          priority TEXT,
          pos_x REAL,
          pos_y REAL,
          assigned_to TEXT,
          due_date TEXT,
          created_at TEXT,
          updated_at TEXT,
          version INTEGER NOT NULL DEFAULT 1,
          deleted_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_tasks_plan ON tasks(plan_id) WHERE deleted_at IS NULL;

        CREATE TABLE IF NOT EXISTS task_photos (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL,
          url TEXT,
          local_uri TEXT,
          photo_type TEXT,
          upload_status TEXT DEFAULT 'uploaded',
          created_at TEXT,
          version INTEGER NOT NULL DEFAULT 1,
          deleted_at TEXT
        );

        CREATE TABLE IF NOT EXISTS task_comments (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL,
          user_id TEXT,
          comment TEXT NOT NULL,
          created_at TEXT,
          version INTEGER NOT NULL DEFAULT 1,
          deleted_at TEXT
        );

        CREATE TABLE IF NOT EXISTS cables (
          id TEXT PRIMARY KEY,
          plan_id TEXT,
          trommel_id TEXT,
          cable_number TEXT,
          cable_type TEXT,
          length REAL,
          status TEXT,
          points_json TEXT,
          created_at TEXT,
          updated_at TEXT,
          version INTEGER NOT NULL DEFAULT 1,
          deleted_at TEXT
        );

        CREATE TABLE IF NOT EXISTS trommels (
          id TEXT PRIMARY KEY,
          project_id TEXT,
          company_id TEXT,
          name TEXT NOT NULL,
          cable_type TEXT,
          initial_length REAL,
          remaining_length REAL,
          is_archived INTEGER DEFAULT 0,
          created_at TEXT,
          updated_at TEXT,
          version INTEGER NOT NULL DEFAULT 1,
          deleted_at TEXT
        );

        CREATE TABLE IF NOT EXISTS bma_devices (
          id TEXT PRIMARY KEY,
          plan_id TEXT,
          device_number TEXT,
          device_type TEXT,
          pos_x REAL,
          pos_y REAL,
          status TEXT,
          created_at TEXT,
          updated_at TEXT,
          version INTEGER NOT NULL DEFAULT 1,
          deleted_at TEXT
        );

        CREATE TABLE IF NOT EXISTS stromkreise (
          id TEXT PRIMARY KEY,
          plan_id TEXT,
          circuit_name TEXT,
          fuse_type TEXT,
          pos_x REAL,
          pos_y REAL,
          created_at TEXT,
          updated_at TEXT,
          version INTEGER NOT NULL DEFAULT 1,
          deleted_at TEXT
        );
      `);
    },
  },
];

export async function runMigrations(db: SQLiteDatabase): Promise<void> {
  // Create schema_migrations tracking table
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedRows = await db.getAllAsync<{ version: number }>(
    'SELECT version FROM schema_migrations ORDER BY version ASC;'
  );
  const appliedVersions = new Set(appliedRows.map((r) => r.version));

  for (const migration of migrations) {
    if (!appliedVersions.has(migration.version)) {
      console.log(`[SQLite Migration] Applying version ${migration.version}...`);
      await migration.up(db);
      await db.runAsync(
        'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?);',
        [migration.version, new Date().toISOString()]
      );
      console.log(`[SQLite Migration] Version ${migration.version} applied successfully.`);
    }
  }
}
