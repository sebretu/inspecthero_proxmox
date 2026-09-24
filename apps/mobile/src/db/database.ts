import * as SQLite from 'expo-sqlite';
import { runMigrations } from './migrations';

let dbInstance: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance) {
    return dbInstance;
  }

  // Open local SQLite database
  const db = await SQLite.openDatabaseAsync('et4u.db');

  // Enable WAL mode for high concurrent read performance & foreign keys
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
  `);

  // Run internal migration system
  await runMigrations(db);

  // Seed offline starter data if replica is empty
  const { seedSampleDataIfEmpty } = await import('./seed');
  await seedSampleDataIfEmpty(db);

  dbInstance = db;
  return db;
}

/**
 * Execute an atomic SQLite transaction
 */
export async function withTransaction<T>(
  callback: (db: SQLite.SQLiteDatabase) => Promise<T>
): Promise<T> {
  const db = await getDatabase();
  await db.execAsync('BEGIN TRANSACTION;');
  try {
    const result = await callback(db);
    await db.execAsync('COMMIT;');
    return result;
  } catch (error) {
    await db.execAsync('ROLLBACK;');
    throw error;
  }
}
