import { getDatabase, withTransaction } from '../db/database';
import { authSupabase } from '../auth/authClient';
import type {
  SyncPullResponse,
  SyncChange,
  SyncMutation,
  SyncPushResponse,
} from '@repo/sync-protocol';

export type SyncStatus = 'IDLE' | 'SYNCING' | 'SYNCED' | 'ERROR';

export interface SyncEngineState {
  status: SyncStatus;
  lastSyncedAt: string | null;
  pendingCount: number;
  lastError: string | null;
}

type SyncStateListener = (state: SyncEngineState) => void;

export class SyncEngine {
  private static isRunning = false;
  private static apiUrl = process.env.EXPO_PUBLIC_API_URL || 'https://inspecthero.pl';
  private static stateListeners = new Set<SyncStateListener>();

  private static currentState: SyncEngineState = {
    status: 'IDLE',
    lastSyncedAt: null,
    pendingCount: 0,
    lastError: null,
  };

  static subscribe(listener: SyncStateListener): () => void {
    this.stateListeners.add(listener);
    listener(this.currentState);
    return () => this.stateListeners.delete(listener);
  }

  private static notify(patch: Partial<SyncEngineState>) {
    this.currentState = { ...this.currentState, ...patch };
    for (const listener of this.stateListeners) {
      try {
        listener(this.currentState);
      } catch (e) {
        console.error('[SyncEngine] Error in state listener:', e);
      }
    }
  }

  static getState(): SyncEngineState {
    return this.currentState;
  }

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
   * Push pending offline mutations to the backend
   */
  static async pushMutations(): Promise<{ pushedCount: number; failedCount: number }> {
    const db = await getDatabase();
    const pendingRows = await db.getAllAsync<{
      mutation_id: string;
      entity_type: string;
      entity_id: string;
      operation: string;
      base_version: number;
      payload: string;
      created_at: string;
    }>("SELECT * FROM mutations WHERE status = 'PENDING' ORDER BY created_at ASC LIMIT 50;");

    if (pendingRows.length === 0) {
      return { pushedCount: 0, failedCount: 0 };
    }

    const { data: { session } } = await authSupabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error('AUTH_REQUIRED: User is not logged in.');
    }

    const mutations: SyncMutation[] = pendingRows.map((r) => ({
      mutation_id: r.mutation_id,
      entity_type: r.entity_type as any,
      entity_id: r.entity_id,
      operation: r.operation as any,
      base_version: r.base_version,
      payload: JSON.parse(r.payload),
      client_created_at: r.created_at,
    }));

    const response = await fetch(`${this.apiUrl}/api/sync/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        protocol_version: 1,
        mutations,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Sync push HTTP ${response.status}: ${errText}`);
    }

    const result: SyncPushResponse = await response.json();
    let pushedCount = 0;
    let failedCount = 0;

    await withTransaction(async (dbTx) => {
      for (const item of result.processed) {
        if (item.status === 'APPLIED' || item.status === 'DUPLICATE') {
          await dbTx.runAsync(
            "UPDATE mutations SET status = 'SYNCED', updated_at = ? WHERE mutation_id = ?;",
            [new Date().toISOString(), item.mutation_id]
          );
          pushedCount++;
        } else if (item.status === 'CONFLICT') {
          await dbTx.runAsync(
            "UPDATE mutations SET status = 'CONFLICT', last_error = ?, updated_at = ? WHERE mutation_id = ?;",
            [item.error?.message || 'Conflict detected', new Date().toISOString(), item.mutation_id]
          );
          failedCount++;
        } else {
          await dbTx.runAsync(
            "UPDATE mutations SET status = 'FAILED', last_error = ?, updated_at = ? WHERE mutation_id = ?;",
            [item.error?.message || 'Mutation rejected', new Date().toISOString(), item.mutation_id]
          );
          failedCount++;
        }
      }
    });

    return { pushedCount, failedCount };
  }

  /**
   * Execute full incremental pull replication
   */
  static async pullChanges(projectId?: string): Promise<{ syncedCount: number; nextCursor: number }> {
    let totalSynced = 0;

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

    return { syncedCount: totalSynced, nextCursor: currentCursor };
  }

  /**
   * Full bidirectional synchronization (Push pending outbox -> Pull delta changes)
   */
  static async syncAll(projectId?: string): Promise<{ pushed: number; pulled: number }> {
    if (this.isRunning) {
      console.warn('[SyncEngine] Sync already in progress.');
      return { pushed: 0, pulled: 0 };
    }

    this.isRunning = true;
    this.notify({ status: 'SYNCING', lastError: null });

    try {
      // 1. Push Outbox mutations
      const pushRes = await this.pushMutations();

      // 2. Upload pending binary photos to Supabase Storage
      const { PhotoService } = await import('../features/photos/PhotoService');
      await PhotoService.uploadPendingPhotos().catch((e) => {
        console.warn('[SyncEngine] Photo upload background error:', e);
      });

      // 3. Pull Inbound Deltas
      const pullRes = await this.pullChanges(projectId);

      // 3. Count remaining pending mutations
      const db = await getDatabase();
      const countRow = await db.getFirstAsync<{ count: number }>(
        "SELECT COUNT(*) as count FROM mutations WHERE status = 'PENDING';"
      );

      const now = new Date().toISOString();
      this.notify({
        status: 'SYNCED',
        lastSyncedAt: now,
        pendingCount: countRow?.count ?? 0,
        lastError: null,
      });

      console.log(`[SyncEngine] Full sync finished: pushed ${pushRes.pushedCount}, pulled ${pullRes.syncedCount}`);
      return { pushed: pushRes.pushedCount, pulled: pullRes.syncedCount };
    } catch (err: any) {
      console.error('[SyncEngine] Sync error:', err);
      this.notify({
        status: 'ERROR',
        lastError: err?.message || 'Błąd synchronizacji z serwerem',
      });
      throw err;
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
      await db.runAsync(
        `UPDATE ${table} SET deleted_at = ?, version = ? WHERE id = ?;`,
        [new Date().toISOString(), version, record_id]
      ).catch(() => {});
      return;
    }

    const rowData = data as Record<string, any>;
    if (!rowData || !rowData.id) return;

    try {
      // Validate columns dynamically against SQLite table schema
      const tableInfo = (await db.getAllAsync(`PRAGMA table_info(${table});`)) as { name: string }[];
      const validCols = new Set(tableInfo.map((c) => c.name));
      if (validCols.size === 0) return;

      const columns = Object.keys(rowData).filter((k) => validCols.has(k));
      if (columns.length === 0 || !columns.includes('id')) return;

      const placeholders = columns.map(() => '?').join(', ');
      const values = columns.map((k) => {
        const v = rowData[k];
        return typeof v === 'object' && v !== null ? JSON.stringify(v) : v;
      });

      const updateClauses = columns
        .filter((c) => c !== 'id')
        .map((c) => `${c} = excluded.${c}`)
        .join(', ');

      const sql = updateClauses.length > 0
        ? `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders}) ON CONFLICT(id) DO UPDATE SET ${updateClauses};`
        : `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders}) ON CONFLICT(id) DO NOTHING;`;

      await db.runAsync(sql, values);
    } catch (err) {
      console.warn(`[SyncEngine] Failed to apply change to ${table} (${record_id}):`, err);
    }
  }
}
