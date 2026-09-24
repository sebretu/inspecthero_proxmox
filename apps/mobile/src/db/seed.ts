import type { SQLiteDatabase } from 'expo-sqlite';

export async function seedSampleDataIfEmpty(db: SQLiteDatabase): Promise<void> {
  const existing = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM projects WHERE deleted_at IS NULL;'
  );

  if (existing && existing.count > 0) {
    return;
  }

  console.log('[SQLite] Seeding initial offline sample project and tasks...');
  const now = new Date().toISOString();
  const projectId = 'proj-sample-001';
  const buildingId = 'bld-sample-001';
  const floorId = 'flr-sample-001';
  const planId = 'pln-sample-001';

  await db.execAsync(`
    INSERT OR IGNORE INTO projects (id, name, status, created_at, updated_at, version)
    VALUES ('${projectId}', 'Biurowiec Warszawa Hub', 'ACTIVE', '${now}', '${now}', 1);

    INSERT OR IGNORE INTO buildings (id, project_id, name, code, address, created_at, updated_at, version)
    VALUES ('${buildingId}', '${projectId}', 'Budynek A - Główny', 'BUD-A', 'Rondo Daszyńskiego 1', '${now}', '${now}', 1);

    INSERT OR IGNORE INTO floors (id, building_id, name, level_number, created_at, updated_at, version)
    VALUES ('${floorId}', '${buildingId}', 'Piętro +1 Biura', 1, '${now}', '${now}', 1);

    INSERT OR IGNORE INTO plans (id, floor_id, project_id, name, width, height, created_at, updated_at, version)
    VALUES ('${planId}', '${floorId}', '${projectId}', 'Rzut Kondygnacji +1 (Instalacje)', 1920, 1080, '${now}', '${now}', 1);

    INSERT OR IGNORE INTO tasks (id, plan_id, title, description, status, priority, pos_x, pos_y, created_at, updated_at, version)
    VALUES 
      ('tsk-001', '${planId}', 'Montaż koryt kablowych trasy głównej', 'Trasa kablowa wzdłuż korytarza wschodniego', 'open', 'high', 250, 400, '${now}', '${now}', 1),
      ('tsk-002', '${planId}', 'Wciąganie kabli BMA pętla 1', 'Zgodnie z projektem sygnalizacji pożarowej', 'in_progress', 'urgent', 550, 420, '${now}', '${now}', 1),
      ('tsk-003', '${planId}', 'Pomiary rezystancji izolacji obwodów', 'Protokół odbiorczy dla rozdzielnicy RG-1', 'closed', 'normal', 800, 310, '${now}', '${now}', 1);
  `);
}
