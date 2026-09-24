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

    INSERT OR IGNORE INTO trommels (id, project_id, name, cable_type, initial_length, remaining_length, created_at, updated_at, version)
    VALUES
      ('trm-001', '${projectId}', 'Bęben B-01 (YDYp 3x2.5)', 'YDYp 3x2.5mm²', 500.0, 345.5, '${now}', '${now}', 1),
      ('trm-002', '${projectId}', 'Bęben B-02 (FTP Cat.6A)', 'U/FTP 4x2x0.5 Cat.6A', 1000.0, 780.0, '${now}', '${now}', 1),
      ('trm-003', '${projectId}', 'Bęben B-03 (HDGs 2x1.5 E90)', 'HDGs 2x1.5mm² (Ognioodporny)', 300.0, 185.0, '${now}', '${now}', 1);

    INSERT OR IGNORE INTO cables (id, plan_id, trommel_id, cable_number, cable_type, length, status, created_at, updated_at, version)
    VALUES
      ('cbl-001', '${planId}', 'trm-001', 'W-01/RG-1/01', 'YDYp 3x2.5mm²', 42.5, 'connected', '${now}', '${now}', 1),
      ('cbl-002', '${planId}', 'trm-001', 'W-01/RG-1/02', 'YDYp 3x2.5mm²', 38.0, 'drawn', '${now}', '${now}', 1),
      ('cbl-003', '${planId}', 'trm-002', 'LAN-101/SW-01', 'U/FTP Cat.6A', 55.0, 'measured', '${now}', '${now}', 1),
      ('cbl-004', '${planId}', 'trm-003', 'BMA-P1/01-12', 'HDGs 2x1.5mm² E90', 74.0, 'planned', '${now}', '${now}', 1);

    INSERT OR IGNORE INTO stromkreise (id, plan_id, circuit_name, fuse_type, pos_x, pos_y, created_at, updated_at, version)
    VALUES
      ('str-001', '${planId}', 'Obwód Oświetlenia Korytarz (1Q1)', 'B10A / RCD 30mA', 320, 280, '${now}', '${now}', 1),
      ('str-002', '${planId}', 'Obwód Gniazd Biuro 101 (2Q1)', 'B16A / RCD 30mA', 450, 310, '${now}', '${now}', 1),
      ('str-003', '${planId}', 'Zasilanie Klimatyzacji VRF (3Q1)', 'C20A / 3-Fazowy', 680, 220, '${now}', '${now}', 1);

    INSERT OR IGNORE INTO bma_devices (id, plan_id, device_number, device_type, pos_x, pos_y, status, created_at, updated_at, version)
    VALUES
      ('bma-001', '${planId}', 'Czujka Optyczna 1/01', 'Optyczna Dymu (FDOOT241-9)', 300, 350, 'OK', '${now}', '${now}', 1),
      ('bma-002', '${planId}', 'ROP 1/01 (Przycisk)', 'Ręczny Ostrzegacz Pożarowy', 210, 480, 'OK', '${now}', '${now}', 1),
      ('bma-003', '${planId}', 'Sygnalizator Akustyczny S1', 'Sygnalizator Optyczno-Akustyczny', 520, 290, 'OK', '${now}', '${now}', 1);
  `);
}
