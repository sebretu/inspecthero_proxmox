import { getDatabase, withTransaction } from '../db/database';
import { authSupabase } from '../auth/authClient';
import type { SyncPullResponse, SyncChange } from './protocol';

export type SyncStatus = 'IDLE' | 'SYNCING' | 'SYNCED' | 'ERROR';

export class SyncEngine {
  private static isRunning = false;
  private static apiUrl = process.env.EXPO_PUBLIC_API_URL || 'https://inspecthero.app';

  /**
   * Get current server cursor stored locally
   */
  static async getLocalCursor(): Promise<number> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM sync_meta WHERE key = 'sync_cursor';"
    );
    return row ? parseInt(row.value, 10) : 0;
  }

  /**
   * Set server cursor in local SQLite
   */
  static async setLocalCursor(cursor: number): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `INSERT INTO sync_meta (key, value, updated_at) 
       VALUES ('sync_cursor', ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;`,
      [cursor.toString(), new Date().toISOString()]
    );
  }

  /**
   * Execute full incremental pull replication
   */
  static async pullChanges(projectId?: string): Promise<{ syncedCount: number; nextCursor: number }> {
    if (this.isRunning) {
      console.warn('[SyncEngine] Sync pull already in progress.');
      return { syncedCount: 0, nextCursor: await this.getLocalCursor() };
    }

    this.isRunning = true;
    let totalSynced = 0;

    try {
      // 1. Get authenticated user session token
      const { data: { session } } = await authSupabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('AUTH_REQUIRED: User is not logged in.');
      }

      let hasMore = true;
      let currentCursor = await this.getLocalCursor();

      while (hasMore) {
        const response = await fetch(`${this.apiUrl}/api/sync/pull`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            protocol_version: 1,
            cursor: currentCursor,
            limit: 100,
            project_id: projectId,
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Sync pull HTTP ${response.status}: ${errText}`);
        }

        const data: SyncPullResponse = await response.json();
        if (!data.ok) {
          throw new Error(data.error?.message || 'Sync pull failed');
        }

        if (data.changes.length > 0) {
          // 2. Transactionally apply changes and advance cursor
          await withTransaction(async (db) => {
            for (const change of data.changes) {
              await this.applyChangeToSqlite(db, change);
            }
            await db.runAsync(
              `INSERT INTO sync_meta (key, value, updated_at) 
               VALUES ('sync_cursor', ?, ?)
               ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;`,
              [data.next_cursor.toString(), new Date().toISOString()]
            );
          });

          totalSynced += data.changes.length;
        }

        currentCursor = data.next_cursor;
        hasMore = data.has_more;
      }

      console.log(`[SyncEngine] Pull completed. Total changes applied: ${totalSynced}, cursor: ${currentCursor}`);
      return { syncedCount: totalSynced, nextCursor: currentCursor };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Apply an individual change record to SQLite table
   */
  private static async applyChangeToSqlite(db: any, change: SyncChange): Promise<void> {
    const { table, operation, record_id, data, version } = change;

    if (operation === 'DELETE') {
      // Soft-delete tombstone in SQLite replica
      await db.runAsync(
        `UPDATE ${table} SET deleted_at = ?, version = ? WHERE id = ?;`,
        [new Date().toISOString(), version, record_id]
      );
      return;
    }

    // Upsert record into corresponding table
    const rowData = data as Record<string, any>;
    if (!rowData || !rowData.id) return;

    const columns = Object.keys(rowData);
    const placeholders = columns.map(() => '?').join(', ');
    const values = Object.values(rowData).map((v) =>
      typeof v === 'object' && v !== null ? JSON.stringify(v) : v
    );

    const updateClauses = columns
      .filter((c) => c !== 'id')
      .map((c) => `${c} = excluded.${c}`)
      .join(', ');

    const sql = `
      INSERT INTO ${table} (${columns.join(', ')})
      VALUES (${placeholders})
      ON CONFLICT(id) DO UPDATE SET ${updateClauses};
    `;

    try {
      await db.runAsync(sql, values);
    } catch (err) {
      console.warn(`[SyncEngine] Failed to apply change to ${table} (${record_id}):`, err);
    }
  }
}
