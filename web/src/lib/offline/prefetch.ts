import { apiGet, getApiUrl, getToken } from '../apiClient';
import { IDBStorage } from './idb';

export interface PrefetchProgress {
    current: number;
    total: number;
    phase: string;
}

export type PrefetchCallback = (progress: PrefetchProgress) => void;

let isSyncing = false;
let syncLogs: string[] = [];

function log(msg: string) {
    const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
    syncLogs.push(line);
    if (syncLogs.length > 200) syncLogs.shift();
    console.log(line);
}

export function getPrefetchLogs(): string[] {
    return syncLogs;
}

export async function resetOfflineCache(): Promise<void> {
    localStorage.removeItem('last_offline_sync');
    await IDBStorage.clearCache();
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) await reg.unregister();
        const keys = await caches.keys();
        for (const key of keys) await caches.delete(key);
    }
}

export async function getOfflineStats() {
    try {
        const all = await IDBStorage.getAllCache();
        return {
            apiEntries: all.length,
            lastSync: localStorage.getItem('last_offline_sync')
        };
    } catch {
        return { apiEntries: 0, lastSync: null };
    }
}

async function prefetchPlanTiles(planId: string): Promise<void> {
    try {
        const token = await getToken();
        // Use v cache-buster here too
        const meta = await apiGet<any>(`/api/tiles/${planId}/meta?v=${Date.now()}`);
        if (!meta || !meta.maxZoom) return;

        const tilesToFetch: string[] = [];
        for (let z = 0; z <= Math.min(meta.maxZoom, 3); z++) {
            const limits = meta.limits?.[String(z)];
            const maxX = limits?.maxX ?? (Math.pow(2, z) - 1);
            const maxY = limits?.maxY ?? (Math.pow(2, z) - 1);
            for (let x = 0; x <= Math.min(maxX, 10); x++) {
                for (let y = 0; y <= Math.min(maxY, 10); y++) {
                    tilesToFetch.push(`/api/tiles/${planId}/${z}/${x}/${y}.png` + (token ? `?token=${token}` : ''));
                }
            }
        }

        for (let i = 0; i < tilesToFetch.length; i += 20) {
            const chunk = tilesToFetch.slice(i, i + 20);
            await Promise.all(chunk.map(url => fetch(getApiUrl(url)).catch(() => { })));
        }
    } catch (err) {
        log(`Błąd kafli ${planId}: ${err}`);
    }
}

export async function startPrefetchProcess(onProgress?: PrefetchCallback): Promise<void> {
    if (isSyncing) return;
    isSyncing = true;
    syncLogs = [];
    log('Początek synchronizacji...');

    try {
        const projects = await apiGet<any[]>('/api/projects');
        log(`Znaleziono ${projects?.length || 0} projektów.`);

        const totalSteps = 20 + (projects?.length || 0) * 15;
        let currentStep = 0;

        const update = (phase: string) => {
            currentStep++;
            log(phase);
            if (onProgress) onProgress({ current: Math.min(currentStep, totalSteps), total: totalSteps, phase });
        };

        const routes = ['/', '/plans', '/materials'];
        // Temporarily removed /admin/orders to avoid 404 in sync
        await Promise.all(routes.map(r => fetch(r).catch(() => { })));

        update('Pobieranie profili...');
        await apiGet('/api/profiles?limit=1000').catch(() => { });
        await apiGet('/api/me').catch(() => { });
        await apiGet('/api/materials').catch(() => { });

        for (const project of projects || []) {
            const pid = project.id;
            const plans = await apiGet<any[]>(`/api/plans?projectId=${pid}`).catch(() => []);
        log(`Projekt: ${project.name} (${plans.length} planów)`);
        for (const plan of plans) {
            const planDisplayName = plan.name || plan.id.substring(0, 8);
            try {
                if (!plan.storage_path) {
                    // Silently skip if no file path is defined in DB
                    continue;
                }
                const token = await getToken();
                const proxyPath = `/api/plans/pdf?id=${plan.id}${token ? `&token=${token}` : ''}`;
                log(`[PDF] Requesting ${planDisplayName}...`);
                const res = await fetch(getApiUrl(proxyPath));
                if (res.status === 404) {
                    // Silent skip for missing files in storage
                    continue;
                }
                log(`[PDF] ${planDisplayName} result: ${res.status}`);
                const blob = await res.blob();
                await IDBStorage.setBlob(`plan_pdf_${plan.id}`, blob);
                log(`[PDF] Saved ${planDisplayName}`);
            } catch (e: any) {
                log(`[PDF] Error ${planDisplayName}: ${e.message}`);
            }
        }

        log(`[Tasks] Fetching task list for ${project.name}...`);
        const tasks = await apiGet<any[]>(`/api/tasks?projectId=${pid}&limit=300`).catch(() => []);
        log(`[Tasks] Found ${tasks?.length || 0} tasks.`);
        for (let i = 0; i < (tasks?.length || 0); i += 15) {
            const chunk = tasks!.slice(i, i + 15);
            log(`[Tasks] Syncing batch ${i/15 + 1}...`);
            await Promise.all(chunk.map(async (t) => {
                await apiGet(`/api/task?id=${t.id}`).catch(() => { });
                await apiGet(`/api/task-photos?taskId=${t.id}`).catch(() => { });
            }));
        }

        for (const plan of plans) {
            log(`[Tiles] Starting tiles prefetch for ${plan.name || plan.id.substring(0, 8)}...`);
            await prefetchPlanTiles(plan.id);
            log(`[Tiles] Finished tiles for ${plan.id.substring(0, 8)}`);
        }
        }

        localStorage.setItem('last_offline_sync', new Date().toISOString());
        log('Synchronizacja zakończona pomyślnie.');
        update('Gotowe!');
    } catch (err: any) {
        log(`KRYTYCZNY BŁĄD: ${err.message}`);
        throw err;
    } finally {
        isSyncing = false;
    }
}
