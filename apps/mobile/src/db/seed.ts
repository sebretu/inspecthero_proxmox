import type { SQLiteDatabase } from 'expo-sqlite';

export async function seedSampleDataIfEmpty(db: SQLiteDatabase): Promise<void> {
  // Purge any legacy sample data to prevent confusion with real production projects
  try {
    await db.execAsync(`
      DELETE FROM tasks WHERE plan_id = 'pln-sample-001';
      DELETE FROM bma_devices WHERE plan_id = 'pln-sample-001';
      DELETE FROM stromkreise WHERE plan_id = 'pln-sample-001';
      DELETE FROM cables WHERE plan_id = 'pln-sample-001';
      DELETE FROM trommels WHERE project_id = 'proj-sample-001';
      DELETE FROM plans WHERE id = 'pln-sample-001';
      DELETE FROM floors WHERE id = 'flr-sample-001';
      DELETE FROM buildings WHERE id = 'bld-sample-001';
      DELETE FROM projects WHERE id = 'proj-sample-001';
    `);
  } catch {
    // Ignore if tables are empty
  }
}

