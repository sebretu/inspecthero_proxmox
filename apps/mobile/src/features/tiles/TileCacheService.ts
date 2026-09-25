import * as FileSystem from 'expo-file-system';
import { authSupabase } from '../../auth/authClient';

const TILES_BASE_DIR = `${FileSystem.documentDirectory}tiles/`;

export interface TileCacheProgress {
  total: number;
  completed: number;
  currentZoom: number;
}

export class TileCacheService {
  private static apiUrl = process.env.EXPO_PUBLIC_API_URL || 'https://inspecthero.pl';

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
   * Prefetch tiles for offline use up to specified maxZoom (default 3 for storage optimization)
   */
  static async prefetchPlanTiles(
    planId: string,
    targetMaxZoom: number = 3,
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
        }
      }

      let completed = 0;

      // 3. Download tiles concurrently in batches
      for (let z = minZoom; z <= maxZoom; z++) {
        const lim = limits[String(z)];
        if (!lim) continue;

        for (let x = 0; x <= lim.maxX; x++) {
          const zxDir = `${this.getPlanTilesDir(planId)}${z}/${x}/`;
          await FileSystem.makeDirectoryAsync(zxDir, { intermediates: true });

          for (let y = 0; y <= lim.maxY; y++) {
            const localPath = `${zxDir}${y}.png`;
            const fileInfo = await FileSystem.getInfoAsync(localPath);

            if (!fileInfo.exists) {
              const remoteUrl = `${this.apiUrl}/api/tiles/${planId}/${z}/${x}/${y}.png${tokenParam}`;
              await FileSystem.downloadAsync(remoteUrl, localPath).catch((e) => {
                console.warn(`[TileCacheService] Failed to download tile ${z}/${x}/${y}:`, e);
              });
            }

            completed++;
            if (onProgress) {
              onProgress({ total: totalTiles, completed, currentZoom: z });
            }
          }
        }
      }

      return { success: true, tileCount: completed };
    } catch (err) {
      console.error('[TileCacheService] Prefetch error:', err);
      return { success: false, tileCount: 0 };
    }
  }
}
