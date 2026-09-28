import * as FileSystem from 'expo-file-system';
import { authSupabase } from '../../auth/authClient';
import { getDatabase } from '../../db/database';

const TILES_BASE_DIR = `${FileSystem.documentDirectory}tiles/`;

export interface TileCacheProgress {
  total: number;
  completed: number;
  currentZoom: number;
  planId?: string;
  planName?: string;
}

export interface ProjectCacheProgress {
  totalPlans: number;
  completedPlans: number;
  currentPlanName: string;
  planProgress: TileCacheProgress;
}

export class TileCacheService {
  private static apiUrl = process.env.EXPO_PUBLIC_API_URL || 'https://inspecthero.pl';

  /**
   * Format bytes into readable format (KB, MB)
   */
  static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  /**
   * Get the local filesystem directory for a plan's cached tiles
   */
  static getPlanTilesDir(planId: string): string {
    return `${TILES_BASE_DIR}${planId}/`;
  }

  /**
   * Check if any tiles for this plan have been cached locally
   */
  static async isPlanCachedLocally(planId: string): Promise<boolean> {
    try {
      const planDir = this.getPlanTilesDir(planId);
      const info = await FileSystem.getInfoAsync(planDir);
      return info.exists && info.isDirectory;
    } catch {
      return false;
    }
  }

  /**
   * Calculate disk usage for a specific plan
   */
  static async getPlanCacheSize(planId: string): Promise<number> {
    try {
      const planDir = this.getPlanTilesDir(planId);
      const info = await FileSystem.getInfoAsync(planDir);
      if (!info.exists || !info.isDirectory) return 0;

      let totalBytes = 0;
      const readDirRecursive = async (dirUri: string) => {
        const files = await FileSystem.readDirectoryAsync(dirUri);
        for (const file of files) {
          const fileUri = `${dirUri}${file}`;
          const fileInfo = await FileSystem.getInfoAsync(fileUri);
          if (fileInfo.exists) {
            if (fileInfo.isDirectory) {
              await readDirRecursive(`${fileUri}/`);
            } else if (fileInfo.size) {
              totalBytes += fileInfo.size;
            }
          }
        }
      };

      await readDirRecursive(planDir);
      return totalBytes;
    } catch {
      return 0;
    }
  }

  /**
   * Calculate total disk usage for all cached plans
   */
  static async getTotalCacheSize(): Promise<number> {
    try {
      const info = await FileSystem.getInfoAsync(TILES_BASE_DIR);
      if (!info.exists || !info.isDirectory) return 0;

      let totalBytes = 0;
      const readDirRecursive = async (dirUri: string) => {
        const files = await FileSystem.readDirectoryAsync(dirUri);
        for (const file of files) {
          const fileUri = `${dirUri}${file}`;
          const fileInfo = await FileSystem.getInfoAsync(fileUri);
          if (fileInfo.exists) {
            if (fileInfo.isDirectory) {
              await readDirRecursive(`${fileUri}/`);
            } else if (fileInfo.size) {
              totalBytes += fileInfo.size;
            }
          }
        }
      };

      await readDirRecursive(TILES_BASE_DIR);
      return totalBytes;
    } catch {
      return 0;
    }
  }

  /**
   * Delete cached tiles for a given plan to free up space
   */
  static async clearPlanCache(planId: string): Promise<void> {
    try {
      const planDir = this.getPlanTilesDir(planId);
      const info = await FileSystem.getInfoAsync(planDir);
      if (info.exists) {
        await FileSystem.deleteAsync(planDir, { idempotent: true });
      }
    } catch (err) {
      console.warn('[TileCacheService] Failed to clear plan cache:', err);
    }
  }

  /**
   * Delete all cached tiles across all plans
   */
  static async clearAllTileCache(): Promise<void> {
    try {
      const info = await FileSystem.getInfoAsync(TILES_BASE_DIR);
      if (info.exists) {
        await FileSystem.deleteAsync(TILES_BASE_DIR, { idempotent: true });
      }
    } catch (err) {
      console.warn('[TileCacheService] Failed to clear all tile cache:', err);
    }
  }

  /**
   * Prefetch tiles for offline use up to specified maxZoom (default 4 for optimal crispness + storage)
   */
  static async prefetchPlanTiles(
    planId: string,
    targetMaxZoom: number = 4,
    onProgress?: (p: TileCacheProgress) => void
  ): Promise<{ success: boolean; tileCount: number }> {
    try {
      const { data: { session } } = await authSupabase.auth.getSession();
      const token = session?.access_token;
      const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';

      // 1. Fetch Plan Metadata
      const metaRes = await fetch(`${this.apiUrl}/api/tiles/${planId}/meta${tokenParam}`);
      if (!metaRes.ok) {
        throw new Error(`Failed to fetch plan metadata: HTTP ${metaRes.status}`);
      }

      const meta = await metaRes.json();
      const minZoom = meta.minZoom || 1;
      const maxZoom = Math.min(meta.maxZoom || 5, targetMaxZoom);
      const limits = meta.limits || {};

      // 2. Count total tiles to download
      let totalTiles = 0;
      for (let z = minZoom; z <= maxZoom; z++) {
        const lim = limits[String(z)];
        if (lim) {
          totalTiles += (lim.maxX + 1) * (lim.maxY + 1);
        } else {
          const maxIdx = Math.pow(2, z) - 1;
          totalTiles += (Math.min(maxIdx, 10) + 1) * (Math.min(maxIdx, 10) + 1);
        }
      }

      let completed = 0;

      // 3. Download tiles concurrently in small batches
      for (let z = minZoom; z <= maxZoom; z++) {
        const lim = limits[String(z)];
        const maxX = lim ? lim.maxX : Math.min(Math.pow(2, z) - 1, 10);
        const maxY = lim ? lim.maxY : Math.min(Math.pow(2, z) - 1, 10);

        for (let x = 0; x <= maxX; x++) {
          const zxDir = `${this.getPlanTilesDir(planId)}${z}/${x}/`;
          await FileSystem.makeDirectoryAsync(zxDir, { intermediates: true });

          const downloadPromises = [];
          for (let y = 0; y <= maxY; y++) {
            const localPath = `${zxDir}${y}.png`;
            const fileInfo = await FileSystem.getInfoAsync(localPath);

            if (!fileInfo.exists) {
              const remoteUrl = `${this.apiUrl}/api/tiles/${planId}/${z}/${x}/${y}.png${tokenParam}`;
              downloadPromises.push(
                FileSystem.downloadAsync(remoteUrl, localPath)
                  .then(() => {
                    completed++;
                    if (onProgress) {
                      onProgress({ total: totalTiles, completed, currentZoom: z, planId });
                    }
                  })
                  .catch((e) => {
                    console.warn(`[TileCacheService] Failed tile ${z}/${x}/${y}:`, e);
                    completed++;
                  })
              );
            } else {
              completed++;
              if (onProgress) {
                onProgress({ total: totalTiles, completed, currentZoom: z, planId });
              }
            }
          }

          // Await batch of column tiles
          await Promise.all(downloadPromises);
        }
      }

      return { success: true, tileCount: completed };
    } catch (err) {
      console.error('[TileCacheService] Prefetch error:', err);
      return { success: false, tileCount: 0 };
    }
  }

  /**
   * Prefetch all plans for an entire project
   */
  static async prefetchProjectPlans(
    projectId: string,
    onProgress?: (p: ProjectCacheProgress) => void
  ): Promise<{ success: boolean; totalPlans: number }> {
    try {
      const db = await getDatabase();
      const plans = await db.getAllAsync<{ id: string; name: string }>(
        'SELECT id, name FROM plans WHERE project_id = ? AND deleted_at IS NULL;',
        [projectId]
      );

      if (!plans || plans.length === 0) {
        return { success: true, totalPlans: 0 };
      }

      let completedPlans = 0;

      for (const p of plans) {
        if (onProgress) {
          onProgress({
            totalPlans: plans.length,
            completedPlans,
            currentPlanName: p.name,
            planProgress: { total: 100, completed: 0, currentZoom: 1, planId: p.id, planName: p.name },
          });
        }

        await this.prefetchPlanTiles(p.id, 4, (prog) => {
          if (onProgress) {
            onProgress({
              totalPlans: plans.length,
              completedPlans,
              currentPlanName: p.name,
              planProgress: prog,
            });
          }
        });

        completedPlans++;
        if (onProgress) {
          onProgress({
            totalPlans: plans.length,
            completedPlans,
            currentPlanName: p.name,
            planProgress: { total: 100, completed: 100, currentZoom: 4, planId: p.id, planName: p.name },
          });
        }
      }

      return { success: true, totalPlans: plans.length };
    } catch (err) {
      console.error('[TileCacheService] Project prefetch error:', err);
      return { success: false, totalPlans: 0 };
    }
  }
}
